import assert from "node:assert/strict"
import test from "node:test"
import type { CallRequest, OpenApi } from "../../client/http.ts"
import { CliError } from "../../errors.ts"
import { resolveDocumentByName, searchDocuments } from "./search.ts"

const docx = (token = "dox_1", title = "操作规程") => ({ docs_token: token, docs_type: "docx", title, owner_id: "ou_1" })
const apiWith = (items: unknown[], hasMore = false, total = items.length): OpenApi => ({
  async call() { return { code: 0, data: { docs_entities: items, has_more: hasMore, total } } },
})

test("搜索遵循昆仑契约：POST、doc 包含 docx、用户 token、显式分页", async () => {
  const calls: CallRequest[] = []
  const api: OpenApi = { async call(request) {
    calls.push(request)
    return apiWith([docx()]).call(request)
  } }
  const result = await searchDocuments(api, "user-token", { query: "  操作规程  ", limit: 10, offset: 20 })
  assert.deepEqual(calls, [{ method: "POST", path: "/open-apis/suite/docs-api/search/object", token: "user-token",
    body: { search_key: "操作规程", count: 10, offset: 20, docs_types: ["doc"] } }])
  assert.deepEqual(result.items, [{ token: "dox_1", type: "docx", title: "操作规程", owner_id: "ou_1", document_id: "dox_1" }])
  assert.equal(result.next_offset, null)
})

test("分页按实际返回数量前进，并限制最后一页在 200 之前", async () => {
  const result = await searchDocuments(apiWith([docx()], true, 300), "token", { query: "规程", limit: 10, offset: 180 })
  assert.equal(result.has_more, true)
  assert.equal(result.next_offset, 181)
  assert.equal(result.next_limit, 10)
  const last = await searchDocuments(apiWith(Array.from({ length: 9 }, (_, i) => docx(`dox_${i}`)), true, 300), "token", { query: "规程", limit: 9, offset: 190 })
  assert.equal(last.has_more, true)
  assert.equal(last.next_offset, null)
  assert.equal(last.search_window_exhausted, true)
  const near = await searchDocuments(apiWith([docx()], true, 300), "token", { query: "规程", limit: 10, offset: 188 })
  assert.equal(near.next_limit, 10)
  const shorter = await searchDocuments(apiWith([docx()], true, 300), "token", { query: "规程", limit: 9, offset: 190 })
  assert.equal(shorter.next_offset, 191)
  assert.equal(shorter.next_limit, 8)
})

test("空关键词和非法分页在请求前拒绝，尤其拒绝 offset + count 等于 200", async () => {
  const api: OpenApi = { async call() { assert.fail("不应请求网络") } }
  for (const input of [
    { query: " " }, { query: "规程", limit: 0 }, { query: "规程", limit: 51 },
    { query: "规程", limit: 1.5 }, { query: "规程", offset: -1 },
    { query: "规程", offset: 150, limit: 50 }, { query: "规程", offset: NaN },
  ]) await assert.rejects(() => searchDocuments(api, "token", input), (err: unknown) => err instanceof CliError && err.type === "usage")
})

test("异常响应不能被当作零结果或完整结果", async () => {
  for (const data of [undefined, {}, { docs_entities: [], total: 0 },
    { docs_entities: [], total: 1, has_more: true },
    { docs_entities: [null], total: 1, has_more: false },
    { docs_entities: [{ title: "缺少 token" }], total: 1, has_more: false },
    { docs_entities: [], total: -1, has_more: false },
  ]) {
    const api: OpenApi = { async call() { return { code: 0, data } } }
    await assert.rejects(() => searchDocuments(api, "token", { query: "规程" }), (err: unknown) => err instanceof CliError && err.type === "api")
  }
})

test("合法零结果保留空列表，权限错误原样上抛", async () => {
  const empty = await searchDocuments(apiWith([]), "token", { query: "规程" })
  assert.equal(empty.total, 0)
  assert.deepEqual(empty.items, [])
  const denied = new CliError("api", "权限不足", "由维护者核实权限")
  const api: OpenApi = { async call() { throw denied } }
  await assert.rejects(() => searchDocuments(api, "token", { query: "规程" }), err => err === denied)
})

test("仅完整标题唯一匹配才定位，搜索中的相近标题不会自动胜出", async () => {
  const result = await resolveDocumentByName(apiWith([docx(), docx("dox_2", "操作规程补充")]), "token", "操作规程")
  assert.equal(result.document_id, "dox_1")
  const repeated = await resolveDocumentByName(apiWith([docx(), docx()]), "token", "操作规程")
  assert.equal(repeated.document_id, "dox_1")
  await assert.rejects(() => resolveDocumentByName(apiWith([docx("dox_2", "操作规程补充")]), "token", "操作规程"),
    (err: unknown) => err instanceof CliError && err.type === "not_found" && Boolean(err.data))
})

test("同名、分页未完、旧版 doc 或未知类型均不误用作 docx ID", async () => {
  for (const [api, type] of [
    [apiWith([docx(), docx("dox_2")]), "ambiguous"],
    [apiWith([docx()], true, 60), "incomplete"],
    [apiWith([{ ...docx(), docs_type: "doc" }]), "unsupported"],
    [apiWith([{ ...docx(), docs_type: "future-type" }]), "unsupported"],
  ] as const) {
    await assert.rejects(() => resolveDocumentByName(api, "token", "操作规程"), (err: unknown) => err instanceof CliError && err.type === type)
  }
})
