import assert from "node:assert/strict"
import test from "node:test"
import type { CallRequest, OpenApi } from "../../client/http.ts"
import { CliError } from "../../errors.ts"
import { createTable, nativeValues, nativeWriteValues, planTable, readNativeTable, writeNativeTable } from "./tables.ts"

function mock(responses: unknown[]) {
  const calls: CallRequest[] = []
  return { calls, api: { async call(request: CallRequest) {
    calls.push(request)
    assert.ok(responses.length, `Unexpected request ${request.method} ${request.path}`)
    const result = responses.shift()
    if (result instanceof Error) throw result
    return result
  } } as OpenApi }
}
const root = { block_id: "doc1", block_type: 1, children: [], page: { elements: [] } }
function pages(items: unknown[], revision = 7) { return [{ data: { document: { revision_id: revision } } }, { data: { items, has_more: false } }] }
function native(values: string[][]) {
  const cells = values.flatMap((row, r) => row.map((value, c) => ({ value, cell: `cell_${r}_${c}`, text: `text_${r}_${c}` })))
  const table = { block_id: "table1", parent_id: "doc1", block_type: 31, children: cells.map(c => c.cell), table: {
    cells: cells.map(c => c.cell), property: { row_size: values.length, column_size: values[0]!.length, merge_info: cells.map(() => ({ row_span: 1, col_span: 1 })) },
  } }
  return [{ ...root, children: ["table1"] }, table, ...cells.flatMap(c => [
    { block_id: c.cell, block_type: 32, parent_id: "table1", children: [c.text], table_cell: {} },
    { block_id: c.text, block_type: 2, parent_id: c.cell, text: { elements: [{ text_run: { content: c.value, text_element_style: { bold: true } } }] } },
  ])]
}

test("creation plans and native matrices validate completely offline", async () => {
  assert.deepEqual(nativeValues([["A", 1, true, null]]), [["A", "1", "true", ""]])
  for (const input of [{ type: "unknown" }, { type: "bitable", rows: 2 }, { type: "sheet", values: [[true]] }, { type: "native", rows: 0 }, { type: "native", rows: 1, values: [[1], [2]] }, { type: "native", clientToken: "bad" }]) assert.throws(() => planTable(input as Parameters<typeof planTable>[0]))
  for (const matrix of [[], [[1], [1, 2]], [[{}]], [["a".repeat(10001)]], [[Infinity]]]) assert.throws(() => nativeValues(matrix))
  assert.throws(() => nativeWriteValues(Array.from({ length: 6 }, () => Array(9).fill(""))), /50 cells/)
  const { api, calls } = mock([])
  for (const type of ["native", "sheet", "bitable"] as const) assert.equal((await createTable(api, "", "doc1", { type, dryRun: true })).dry_run, true)
  assert.equal((await writeNativeTable(api, "", "doc1", "table1", [[1]], { dryRun: true })).dry_run, true)
  assert.equal(calls.length, 0)
})

test("native creation uses one descendant request with a text paragraph inside every cell", async () => {
  const items = native([["A", "1"], ["true", ""]]), table = items[1]
  const { api, calls } = mock([...pages([root]), { data: { children: [table] } }, ...pages(items), ...pages(items)])
  const key = "b102209d-96a7-4e71-8777-a1bfc067d9df"
  const result = await createTable(api, "token", "https://example.com/docx/doc1", { type: "native", title: "Native", values: [["A", 1], [true, null]], clientToken: key })
  assert.ok("verified" in result)
  assert.equal(result.verified, true)
  assert.equal(result.block_id, "table1")
  const request = calls[2]!
  assert.equal(request.path, "/open-apis/docx/v1/documents/doc1/blocks/doc1/descendant")
  assert.equal(request.query?.client_token, key)
  assert.equal(request.query?.document_revision_id, "7")
  const body = request.body as { children_id: string[]; descendants: Record<string, unknown>[] }
  assert.deepEqual(body.children_id, ["heading", "table"])
  assert.equal(body.descendants.filter(b => b.block_type === 32).length, 4)
  assert.equal(body.descendants.filter(b => b.block_type === 2).length, 4)
  assert.equal(calls.filter(c => c.method === "POST").length, 1)
})

test("sheet creation verifies the embedded target and returns IDs for sheets write", async () => {
  const block = { block_id: "sheetblock", block_type: 30, sheet: { token: "sht1_sheet1" } }
  const { api, calls } = mock([...pages([root]), { data: { children: [block] } }, ...pages([{ ...root, children: ["sheetblock"] }, block]), { data: { sheet: { resource_type: "sheet" } } }, { data: { valueRange: { range: "", values: [] } } }])
  const result = await createTable(api, "token", "doc1", { type: "sheet", rows: 3, columns: 4 })
  assert.ok("spreadsheet_token" in result)
  assert.equal(result.spreadsheet_token, "sht1")
  assert.equal(result.sheet_id, "sheet1")
  assert.equal(result.content_initialized, false)
  assert.deepEqual(calls[2]?.body, { index: -1, children: [{ block_type: 30, sheet: { row_size: 3, column_size: 4 } }] })
  assert.equal(calls.some(c => c.method === "PUT"), false)
})

test("Base creation returns the actual new table and its default field IDs", async () => {
  const block = { block_id: "baseblock", block_type: 18, bitable: { token: "base1_tbl1" } }
  const { api, calls } = mock([...pages([root]), { data: { children: [block] } }, ...pages([{ ...root, children: ["baseblock"] }, block]), { data: { app: { app_token: "base1" } } }, { data: { items: [{ field_id: "fld1", field_name: "Text", is_primary: true, type: 1 }], has_more: false } }])
  const result = await createTable(api, "token", "doc1", { type: "bitable" })
  assert.ok("app_token" in result)
  assert.equal(result.app_token, "base1")
  assert.equal(result.table_id, "tbl1")
  assert.equal(result.creation_verified, true)
  assert.deepEqual(calls[2]?.body, { index: -1, children: [{ block_type: 18, bitable: { view_type: 1 } }] })
})

test("Base JSON failure retains the created document/block/app/table and does not recreate it", async () => {
  const block = { block_id: "baseblock", block_type: 18, bitable: { token: "base1_tbl1" } }
  const schema = { data: { items: [{ field_id: "fld1", field_name: "Text", is_primary: true, type: 1 }], has_more: false } }
  const { api, calls } = mock([...pages([root]), { data: { children: [block] } }, ...pages([{ ...root, children: ["baseblock"] }, block]), { data: { app: {} } }, schema, schema, { data: { items: [{ record_id: "existing", fields: { Text: "Business" } }], has_more: false } }])
  await assert.rejects(() => createTable(api, "token", "doc1", { type: "bitable", base: { fields: [{ field_name: "Task", type: 1 }], records: [{ fields: { Task: "A" } }] } }), (e: unknown) => {
    assert.ok(e instanceof CliError)
    assert.equal(e.type, "partial_write")
    const data = e.data as Record<string, unknown>
    assert.equal(data.document_id, "doc1")
    assert.equal(data.block_id, "baseblock")
    assert.equal(data.app_token, "base1")
    assert.equal(data.table_id, "tbl1")
    return true
  })
  assert.equal(calls.filter(c => c.path.endsWith("/children") && c.method === "POST").length, 1)
})

test("failed creation and failed verification retain the document, block and idempotency key without retry", async () => {
  const key = "b102209d-96a7-4e71-8777-a1bfc067d9df"
  const network = mock([...pages([root]), new CliError("network", "timeout")])
  await assert.rejects(() => createTable(network.api, "token", "doc1", { type: "sheet", clientToken: key }), (err: unknown) => {
    assert.ok(err instanceof CliError)
    assert.equal(err.type, "write_unknown")
    assert.equal((err.data as Record<string, unknown>).document_id, "doc1")
    assert.equal((err.data as Record<string, unknown>).client_token, key)
    return true
  })
  assert.equal(network.calls.length, 3)
  const block = { block_id: "newblock", block_type: 30, sheet: { token: "bad" } }
  const verify = mock([...pages([root]), { data: { children: [block] } }, ...pages([{ ...root, children: ["newblock"] }, block])])
  await assert.rejects(() => createTable(verify.api, "token", "doc1", { type: "sheet", clientToken: key }), (err: unknown) => err instanceof CliError && err.type === "verification" && (err.data as Record<string, unknown>).block_id === "newblock")
  assert.equal(verify.calls.filter(c => c.method === "POST").length, 1)
})

test("native reads retain the matrix, reject merged/rich cells and never treat a sheet as native", async () => {
  const good = mock(pages(native([["A", "B"], ["C", "D"]])))
  assert.deepEqual((await readNativeTable(good.api, "token", "doc1", "table1")).values, [["A", "B"], ["C", "D"]])
  for (const mode of ["merged", "rich", "sheet", "missing"]) {
    const blocks: Record<string, unknown>[] = native([["A"]])
    if (mode === "merged") (blocks[1]!.table as { property: { merge_info: unknown[] } }).property.merge_info = [{ row_span: 2, col_span: 1 }]
    if (mode === "rich") blocks[3]!.text = { elements: [{ mention_user: { user_id: "ou1" } }] }
    if (mode === "sheet") blocks[1]!.block_type = 30
    if (mode === "missing") blocks.pop()
    const { api } = mock(pages(blocks))
    await assert.rejects(() => readNativeTable(api, "token", "doc1", "table1"), (err: unknown) => err instanceof CliError && err.type === "unsupported")
  }
})

test("native edits preserve run styles, check dimensions/revision and verify the written values", async () => {
  const { api, calls } = mock([...pages(native([["Old"]])), { data: { document_revision_id: 8 } }, ...pages(native([["New"]]), 8)])
  const result = await writeNativeTable(api, "token", "doc1", "table1", [["New"]], { revision: 7 })
  assert.ok("verified" in result)
  assert.equal(result.verified, true)
  assert.equal(calls[2]?.method, "PATCH")
  assert.deepEqual(calls[2]?.body, { requests: [{ block_id: "text_0_0", update_text_elements: { elements: [{ text_run: { content: "New", text_element_style: { bold: true } } }] } }] })
  for (const mode of ["revision", "dimensions"]) {
    const stopped = mock(pages(native([["Old"]])))
    await assert.rejects(() => writeNativeTable(stopped.api, "token", "doc1", "table1", mode === "dimensions" ? [["New", "Extra"]] : [["New"]], { revision: mode === "revision" ? 6 : 7 }))
    assert.equal(stopped.calls.some(c => c.method === "PATCH"), false)
  }
  const mismatch = mock([...pages(native([["Old"]])), { data: {} }, ...pages(native([["Other"]]))])
  await assert.rejects(() => writeNativeTable(mismatch.api, "token", "doc1", "table1", [["New"]]), (err: unknown) => err instanceof CliError && err.type === "verification")
  assert.equal(mismatch.calls.filter(c => c.method === "PATCH").length, 1)
})
