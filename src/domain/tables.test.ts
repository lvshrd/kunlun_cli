import assert from "node:assert/strict"
import test from "node:test"
import type { CallRequest, OpenApi } from "../client/http.ts"
import { CliError } from "../errors.ts"
import { resourceToken, readPages } from "./table-common.ts"
import { parseRange, readRange, writeRange, validateValues } from "./sheets/service.ts"
import { searchRecords, writeRecord, writeField } from "./bitable/service.ts"

function mock(responses: unknown[]) {
  const calls: CallRequest[] = []
  const api: OpenApi = { async call(request) {
    calls.push(request)
    assert.ok(responses.length, `Unexpected request ${request.method} ${request.path}`)
    const response = responses.shift()
    if (response instanceof Error) throw response
    return response
  } }
  return { api, calls }
}
const grid = { data: { sheet: { sheet_id: "sheet1", resource_type: "sheet" } } }
const cells = (values: unknown[][], range = "sheet1!A1:B1") => ({ data: { revision: 4, valueRange: { range, values } } })
const record = (fields: unknown) => ({ data: { record: { record_id: "rec1", fields } } })

test("resource URLs are parsed without changing the API origin; wrong resource types are rejected", () => {
  assert.equal(resourceToken("https://tenant.example/sheets/sht1?sheet=sheet1", "sheets"), "sht1")
  assert.equal(resourceToken("https://tenant.example/base/base1?table=tbl1", "base"), "base1")
  for (const input of ["https://tenant.example/wiki/wiki1", "https://tenant.example/docx/dox1", "http://tenant.example/sheets/sht1", "../sht1", "sht1?x=y"]) assert.throws(() => resourceToken(input, "sheets"))
})

test("ranges and cell matrices reject unbounded, reversed, oversized and rich-cell writes", () => {
  assert.equal(parseRange("sheet1!a1:b2").range, "sheet1!A1:B2")
  for (const range of ["sheet1!A:A", "sheet1!B2:A1", "sheet1!A0", "sheet1!A1:A5001", "sheet1!A1:CW1", "sheet1!A999999999999999999"]) assert.throws(() => parseRange(range))
  for (const value of [[], [[1], [1, 2]], [[{ text: "rich" }]], [[Infinity]], [["a".repeat(50001)]]]) assert.throws(() => validateValues(value))
  assert.deepEqual(validateValues([["=SUM(1,2)", 3, true, null]]), [["=SUM(1,2)", 3, true, null]])
})

test("sheet reads use metadata type checks and the documented v2 Formula range endpoint", async () => {
  const { api, calls } = mock([grid, cells([["Task", 1]])])
  const result = await readRange(api, "token", "sht1", "sheet1!A1:B1")
  assert.equal(result.complete, true)
  assert.equal(calls[0]?.path, "/open-apis/sheets/v3/spreadsheets/sht1/sheets/sheet1")
  assert.equal(calls[1]?.path, "/open-apis/sheets/v2/spreadsheets/sht1/values/sheet1!A1%3AB1")
  assert.equal(calls[1]?.query?.valueRenderOption, "Formula")
})

test("a non-grid worksheet stops before reading or writing values", async () => {
  const { api, calls } = mock([{ data: { sheet: { resource_type: "bitable" } } }])
  await assert.rejects(() => writeRange(api, "token", "sht1", "sheet1!A1:B1", [["Task", 1]], "write"), (err: unknown) => err instanceof CliError && err.type === "unsupported")
  assert.equal(calls.length, 1)
})

test("empty sheet ranges are explicit and formulas use the official object format", async () => {
  const empty = mock([grid, { data: { valueRange: { range: "" } } }])
  const read = await readRange(empty.api, "token", "sht1", "sheet1!A1")
  assert.deepEqual(read.values, [])
  assert.equal(read.requested_range, "sheet1!A1:A1")
  const formula = { type: "formula", text: "=1+2" }
  const { api, calls } = mock([grid, cells([["", ""]]), { data: { updatedRange: "sheet1!A1:B1" } }, cells([["Total", "=1+2"]])])
  const result = await writeRange(api, "token", "sht1", "sheet1!A1:B1", [["Total", formula]], "write")
  assert.ok("verified" in result)
  assert.equal(result.verified, true)
  assert.deepEqual(calls[2]?.body, { valueRange: { range: "sheet1!A1:B1", values: [["Total", formula]] } })
})

test("sheet writes capture prior values and verify the exact target and read-back", async () => {
  const { api, calls } = mock([grid, cells([["Old", 0]]), { data: { updatedRange: "sheet1!A1:B1", updatedCells: 2 } }, cells([["Task", 1]])])
  const result = await writeRange(api, "token", "sht1", "sheet1!A1:B1", [["Task", 1]], "write")
  assert.ok("verified" in result)
  assert.equal(result.verified, true)
  assert.equal(result.concurrency_protected, false)
  assert.deepEqual(result.before, [["Old", 0]])
  assert.equal(calls[2]?.method, "PUT")
  assert.deepEqual(calls[2]?.body, { valueRange: { range: "sheet1!A1:B1", values: [["Task", 1]] } })
})

test("append requests INSERT_ROWS and verifies the server's actual inserted range", async () => {
  const { api, calls } = mock([grid, { data: { updates: { updatedRange: "sheet1!A3:B3" } } }, cells([["New", 2]], "sheet1!A3:B3")])
  const result = await writeRange(api, "token", "sht1", "sheet1!A1:B10", [["New", 2]], "append")
  assert.ok("verified" in result)
  assert.equal(result.verified, true)
  assert.equal(calls[1]?.method, "POST")
  assert.equal(calls[1]?.query?.insertDataOption, "INSERT_ROWS")
})

test("write verification errors are distinct from uncertain writes and never replay a request", async () => {
  for (const mode of ["network", "mismatch", "wrong-range"]) {
    const { api, calls } = mock([grid, cells([["Old", 0]]), ...(mode === "network" ? [new CliError("network", "timeout")] : [{ data: { updatedRange: mode === "wrong-range" ? "sheet1!C1:D1" : "sheet1!A1:B1" } }, cells([["Other", 3]])])])
    await assert.rejects(() => writeRange(api, "token", "sht1", "sheet1!A1:B1", [["Task", 1]], "write"), (err: unknown) => {
      assert.ok(err instanceof CliError)
      assert.equal(err.type, mode === "network" ? "write_unknown" : "verification")
      assert.equal((err.data as Record<string, unknown>).write_completed, mode !== "network")
      return true
    })
    assert.equal(calls.filter(c => c.method === "PUT").length, 1)
  }
})

test("all table write previews work without network and validate input", async () => {
  const { api, calls } = mock([])
  assert.equal((await writeRange(api, "", "sht1", "sheet1!A1", [[1]], "write", true)).dry_run, true)
  assert.equal((await writeRecord(api, "", "base1", "tbl1", { Task: "Plan" }, { dryRun: true })).dry_run, true)
  assert.equal((await writeField(api, "", "base1", "tbl1", { field_name: "Task", type: 1 }, { dryRun: true })).dry_run, true)
  await assert.rejects(() => writeRecord(api, "", "base1", "tbl1", {}, { dryRun: true }))
  assert.equal(calls.length, 0)
})

test("Base search retains typed filters, view, sorting and explicit pagination", async () => {
  const { api, calls } = mock([{ data: { items: [{ record_id: "rec1", fields: {} }], has_more: true, page_token: "next" } }, { data: { items: [], has_more: false } }])
  const body = { view_id: "vew1", filter: { conjunction: "and", conditions: [{ field_name: "Task", operator: "is", value: ["Plan"] }] }, sort: [{ field_name: "Task", desc: false }] }
  const result = await searchRecords(api, "token", "base1", "tbl1", body, { all: true, pageSize: 500 })
  assert.equal(result.complete, true)
  assert.equal(result.pages_read, 2)
  assert.equal(calls[0]?.path, "/open-apis/bitable/v1/apps/base1/tables/tbl1/records/search")
  assert.equal(calls[0]?.method, "POST")
  assert.deepEqual(calls[0]?.body, body)
  assert.equal(calls[1]?.query?.page_token, "next")
})

test("pagination reports incomplete pages, repeated cursors, failures and its 50-page limit", async () => {
  for (const mode of ["missing", "repeated", "network", "limit", "invalid"]) {
    let calls = 0
    await assert.rejects(() => readPages(async () => {
      calls++
      if (mode === "network" && calls === 2) throw new CliError("network", "timeout")
      if (mode === "invalid") return { data: { items: [], has_more: "false" } }
      return { data: { items: [{ id: calls }], has_more: true, ...(mode === "missing" ? {} : { page_token: mode === "limit" ? `p${calls}` : "next" }) } }
    }, { all: true }, 100), (err: unknown) => {
      assert.ok(err instanceof CliError)
      assert.equal(err.type, "incomplete")
      assert.equal((err.data as Record<string, unknown>).complete, false)
      return true
    })
    assert.equal(calls, mode === "limit" ? 50 : mode === "missing" || mode === "invalid" ? 1 : 2)
  }
  const partial = await readPages(async () => ({ data: { items: [], has_more: false } }), { pageToken: "later" }, 100)
  assert.equal(partial.complete, false, "a final page started from a cursor is not a full snapshot")
})

test("Base record creation carries a recoverable idempotency key and verifies enriched values", async () => {
  const fields = { Task: "Plan", Owner: [{ id: "ou_test" }] }
  const { api, calls } = mock([record(fields), record({ ...fields, Owner: [{ id: "ou_test", name: "User" }] })])
  const key = "b102209d-96a7-4e71-8777-a1bfc067d9df"
  const result = await writeRecord(api, "token", "base1", "tbl1", fields, { clientToken: key })
  assert.ok("verified" in result)
  assert.equal(result.verified, true)
  assert.equal(result.client_token, key)
  assert.equal(calls[0]?.query?.client_token, key)
  assert.equal(calls[0]?.query?.user_id_type, "open_id")
  assert.deepEqual(calls[0]?.body, { fields })
})

test("Base updates send only supplied fields; failed verification retains the record ID", async () => {
  const { api, calls } = mock([record({ Task: "Old", Unchanged: 7 }), record({ Task: "New" }), record({ Task: "New", Unchanged: 7 })])
  const result = await writeRecord(api, "token", "base1", "tbl1", { Task: "New" }, { recordId: "rec1" })
  assert.ok("verified" in result)
  assert.equal(result.verified, true)
  assert.equal(calls[1]?.method, "PUT")
  assert.deepEqual(calls[1]?.body, { fields: { Task: "New" } })
  const failed = mock([record({ Task: "Old" }), record({ Task: "New" }), record({ Task: "Other" })])
  await assert.rejects(() => writeRecord(failed.api, "token", "base1", "tbl1", { Task: "New" }, { recordId: "rec1" }), (err: unknown) => err instanceof CliError && err.type === "verification" && (err.data as Record<string, unknown>).record_id === "rec1")
  assert.equal(failed.calls.filter(c => c.method === "PUT").length, 1)
})

test("Base creation timeout retains its generated client token without retrying", async () => {
  const { api, calls } = mock([new CliError("network", "timeout")])
  await assert.rejects(() => writeRecord(api, "token", "base1", "tbl1", { Task: "Plan" }), (err: unknown) => {
    assert.ok(err instanceof CliError)
    assert.equal(err.type, "write_unknown")
    assert.equal((err.data as Record<string, unknown>).client_token, calls[0]?.query?.client_token)
    assert.match(String((err.data as Record<string, unknown>).client_token), /^[0-9a-f-]{36}$/)
    return true
  })
  assert.equal(calls.length, 1)
})

test("field edits use PUT and verify the name and type across paginated fields", async () => {
  const field = { field_id: "fld1", field_name: "Task", type: 1 }
  const { api, calls } = mock([{ data: { field } }, { data: { items: [], has_more: true, page_token: "next" } }, { data: { items: [field], has_more: false } }])
  const result = await writeField(api, "token", "base1", "tbl1", { field_name: "Task", type: 1 }, { fieldId: "fld1" })
  assert.ok("verified" in result)
  assert.equal(result.verified, true)
  assert.equal(result.verification_scope, "field_name_and_type")
  assert.equal(calls[0]?.method, "PUT")
  assert.equal(calls[2]?.query?.page_token, "next")
})
