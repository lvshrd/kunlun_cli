import assert from "node:assert/strict"
import test from "node:test"
import type { CallRequest, OpenApi } from "../../client/http.ts"
import { CliError } from "../../errors.ts"
import { emptyRecord, initializeNewBase, validateBaseInput } from "./initialize.ts"

const input = { fields: [{ field_name: "Task", type: 1 }, { field_name: "Count", type: 2 }], records: [{ fields: { Task: "A", Count: 0 } }, { fields: { Task: "B", Count: 2 } }] }
function fixture(initial: Record<string, unknown>[] = [{ record_id: "blank1", fields: {} }], failWrite = 0) {
  const calls: CallRequest[] = [], schema: Record<string, unknown>[] = [{ field_id: "primary", field_name: "Default", type: 1, is_primary: true }]
  const records = new Map(initial.map(r => [String(r.record_id), r]))
  let writes = 0
  const api: OpenApi = { async call(r) {
    calls.push(r)
    if (r.path.endsWith("/records/search")) return { data: { items: [...records.values()], has_more: false } }
    if (r.path.endsWith("/fields") && r.method === "GET") return { data: { items: schema, has_more: false } }
    if (r.path.includes("/fields") && r.method !== "GET") {
      const body = r.body as Record<string, unknown>
      const field = r.method === "PUT" ? schema.find(f => f.field_id === r.path.split("/").at(-1))! : { field_id: `fld${schema.length}` }
      Object.assign(field, body)
      if (r.method === "POST") schema.push(field)
      return { data: { field } }
    }
    if (r.method === "GET") return { data: { record: records.get(r.path.split("/").at(-1)!) } }
    if (++writes === failWrite) throw new CliError("network", "timeout")
    const id = r.method === "PUT" ? r.path.split("/").at(-1)! : `new${records.size}`
    const record = { record_id: id, fields: { ...(records.get(id)?.fields as object), ...(r.body as { fields: object }).fields } }
    records.set(id, record)
    return { data: { record } }
  } }
  return { api, calls, records }
}
test("Base JSON validation rejects unknown fields/types and preserves zero as real data", () => {
  assert.deepEqual(validateBaseInput(input), input)
  for (const raw of [{}, { ...input, fields: [{ field_name: "N", type: 2 }] }, { ...input, records: [{ fields: { Missing: "A" } }] }, { ...input, records: [{ fields: { Count: "2" } }] }, { ...input, records: [{ fields: { Task: "" } }] }, { ...input, fields: [input.fields[0], input.fields[0]] }]) assert.throws(() => validateBaseInput(raw))
  assert.equal(emptyRecord({ fields: { A: 0 } }), false)
  assert.equal(emptyRecord({ fields: { A: false } }), false)
  assert.equal(emptyRecord({ fields: { A: "", B: null, C: [] } }), true)
})
test("initialization reuses only blank records, creates the shortfall and verifies the final table", async () => {
  const f = fixture()
  const result = await initializeNewBase(f.api, "token", "base1", "tbl1", input)
  assert.equal(result.verified, true)
  assert.equal(result.records_reused, 1)
  assert.equal(result.records_created, 1)
  assert.equal(result.remaining_blank_records, 0)
  assert.equal(f.records.size, 2)
  assert.equal(f.calls.filter(c => c.method === "DELETE").length, 0)
  assert.deepEqual((f.records.get("blank1")!.fields as object), { Task: "A", Count: 0 })
})
test("remaining blank rows are reported; existing business data stops before any schema/record mutation", async () => {
  const f = fixture([{ record_id: "b1", fields: {} }, { record_id: "b2", fields: {} }, { record_id: "b3", fields: {} }])
  assert.equal((await initializeNewBase(f.api, "token", "base1", "tbl1", input)).remaining_blank_records, 1)
  const used = fixture([{ record_id: "used", fields: { Task: "Existing" } }])
  await assert.rejects(() => initializeNewBase(used.api, "token", "base1", "tbl1", input), (e: unknown) => e instanceof CliError && e.type === "partial_write")
  assert.ok(used.calls.every(c => c.method === "GET" || c.path.endsWith("/search")))
})
test("partial initialization retains completed record IDs and never retries a failed write", async () => {
  const f = fixture([], 2)
  await assert.rejects(() => initializeNewBase(f.api, "token", "base1", "tbl1", input), (e: unknown) => {
    assert.ok(e instanceof CliError)
    const data = e.data as { stage: string; progress: { records: unknown[] } }
    assert.equal(e.type, "partial_write")
    assert.equal(data.stage, "initialize_records")
    assert.equal(data.progress.records.length, 1)
    return true
  })
  assert.equal(f.calls.filter(c => c.method === "POST" && c.path.endsWith("/records")).length, 2)
})
