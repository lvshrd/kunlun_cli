import assert from "node:assert/strict"
import test from "node:test"
import type { CallRequest, OpenApi } from "../../client/http.ts"
import { CliError } from "../../errors.ts"
import { appendDocument, createDocument, documentIdFromInput, readDocument } from "./service.ts"

test("创建文档后按批追加正文", async () => {
  const calls: CallRequest[] = []
  const api = fakeApi(calls, 0)
  const content = Array.from({ length: 51 }, (_, index) => `第${index + 1}行`).join("\n")
  const created = await createDocument(api, "token", { title: "周报", content })
  assert.equal(created.documentId, "dox_1")
  assert.equal(created.blockCount, 51)
  const writes = calls.filter((call) => call.path.endsWith("/children"))
  assert.equal(writes.length, 2)
  assert.equal((writes[0]?.body as { index: number }).index, 0)
  assert.equal((writes[1]?.body as { children: unknown[] }).children.length, 1)
  assert.equal((writes[1]?.body as { index: number }).index, 50)
})

test("正文写入失败时仍返回已创建的文档 ID", async () => {
  const calls: CallRequest[] = []
  const api: OpenApi = {
    async call(request) {
      calls.push(request)
      if (request.method === "POST" && request.path === "/open-apis/docx/v1/documents") {
        return { code: 0, data: { document: { document_id: "dox_1" } } }
      }
      throw new CliError("api", "权限不足")
    },
  }
  await assert.rejects(
    () => createDocument(api, "token", { title: "周报", content: "一段正文" }),
    (err: unknown) => err instanceof CliError && (err.data as { document_id: string }).document_id === "dox_1",
  )
})

test("读取文档时翻页并抽出文本", async () => {
  const api: OpenApi = {
    async call(request) {
      if (!request.path.endsWith("/blocks")) return { data: { document: { revision_id: 7 } } }
      assert.equal(request.query?.document_revision_id, "7")
      const token = request.query?.page_token
      if (!token) {
        return { code: 0, data: { items: [{ text: { elements: [{ text_run: { content: "第一页" } }] } }], has_more: true, page_token: "next" } }
      }
      return { code: 0, data: { items: [{ heading1: { elements: [{ text_run: { content: "第二页" } }] } }], has_more: false } }
    },
  }
  const result = await readDocument(api, "token", "dox_1")
  assert.equal(result.markdown, "第一页\n# 第二页")
  assert.equal(result.blockCount, 2)
  assert.equal(result.complete, true)
  assert.equal(result.revision, 7)
  assert.equal(result.pages_read, 2)
  assert.equal("raw_blocks" in result, false)
})

test("完整分页与内容转换完整性分别报告，原始块仅按需返回", async () => {
  const items = [{ block_id: "table", block_type: 31, table: {} }]
  const api = readApi(() => ({ data: { items, has_more: false } }))
  const result = await readDocument(api, "token", "dox_1", { raw: true })
  assert.equal(result.pagination_complete, true)
  assert.equal(result.content_complete, false)
  assert.equal(result.complete, false)
  assert.deepEqual(result.raw_blocks, items)
  assert.equal(result.diagnostics[0]?.block_id, "table")
})

test("缺失和重复游标拒绝作为全文成功，保留部分内容与文档 ID", async () => {
  for (const [reason, next] of [["missing_page_token", ""], ["repeated_page_token", "repeat"]]) {
    let calls = 0
    const api = readApi(() => {
      calls++
      return { data: { items: [{ text: { elements: [{ text_run: { content: "部分内容" } }] } }], has_more: true, page_token: next } }
    })
    await assert.rejects(() => readDocument(api, "token", "dox_1"), (err: unknown) => {
      assert.ok(err instanceof CliError)
      const data = err.data as Record<string, unknown>
      assert.equal(err.type, "incomplete")
      assert.equal(data.reason, reason)
      assert.equal(data.document_id, "dox_1")
      assert.equal(data.pagination_complete, false)
      assert.equal(data.complete, false)
      assert.match(String(data.markdown), /部分内容/)
      assert.equal(data.block_count, calls)
      return true
    })
    assert.equal(calls, next ? 2 : 1)
  }
})

test("20 页上限明确失败且不请求第 21 页", async () => {
  let calls = 0
  const api = readApi(() => ({ data: { items: [], has_more: true, page_token: `page-${++calls}` } }))
  await assert.rejects(() => readDocument(api, "token", "dox"), (err: unknown) => {
    assert.ok(err instanceof CliError)
    assert.equal((err.data as Record<string, unknown>).reason, "page_limit")
    assert.equal((err.data as Record<string, unknown>).pages_read, 20)
    return true
  })
  assert.equal(calls, 20)
})

test("无效分页响应不能误报空文档成功", async () => {
  for (const data of [{}, { items: [], has_more: "false" }, { has_more: false }]) {
    await assert.rejects(() => readDocument(readApi(() => ({ data })), "token", "dox"),
      (err: unknown) => err instanceof CliError && (err.data as Record<string, unknown>).reason === "invalid_page")
  }
})

test("后续页网络失败保留前页内容、原错误类型与修复提示", async () => {
  let calls = 0
  const api = readApi(() => {
    if (++calls === 2) throw new CliError("network", "请求失败", "检查办公网络")
    return { data: { items: [{ text: { elements: [{ text_run: { content: "已读内容" } }] } }], has_more: true, page_token: "next" } }
  })
  await assert.rejects(() => readDocument(api, "token", "dox"), (err: unknown) => {
    assert.ok(err instanceof CliError)
    const data = err.data as Record<string, unknown>
    assert.equal(data.markdown, "已读内容")
    assert.equal(data.reason, "request_failed")
    assert.deepEqual(data.cause, { type: "network", message: "请求失败" })
    assert.equal(err.hint, "检查办公网络")
    return true
  })
})

test("缺少版本时停止读取，不以混合版本拼接全文", async () => {
  let calls = 0
  await assert.rejects(() => readDocument({ async call() { calls++; return { data: {} } } }, "token", "dox"), /Cannot determine the document revision/)
  assert.equal(calls, 1)
})

function readApi(page: () => unknown): OpenApi {
  return { async call(request) {
    assert.equal(request.method, "GET")
    if (!request.path.endsWith("/blocks")) return { data: { document: { revision_id: 7 } } }
    assert.equal(request.query?.document_revision_id, "7")
    return page()
  } }
}

test("从文档链接提取 document_id", () => {
  assert.equal(documentIdFromInput("https://example.com/docx/dox_abc?from=copy"), "dox_abc")
  assert.equal(documentIdFromInput("dox_abc"), "dox_abc")
})

test("追加时从现有子块数量之后插入", async () => {
  const calls: CallRequest[] = []
  const api = fakeApi(calls, 2)
  const count = await appendDocument(api, "token", "dox_1", "新段落")
  assert.equal(count, 1)
  const write = calls.find((call) => call.path.endsWith("/children"))
  assert.equal((write?.body as { index: number }).index, 2)
})

function fakeApi(calls: CallRequest[], existingChildren: number): OpenApi {
  return {
    async call(request) {
      calls.push(request)
      if (request.method === "POST" && request.path === "/open-apis/docx/v1/documents") {
        return { code: 0, data: { document: { document_id: "dox_1" } } }
      }
      if (request.method === "GET") {
        return { code: 0, data: { block: { children: Array.from({ length: existingChildren }, (_, index) => `b${index}`) } } }
      }
      return { code: 0, data: {} }
    },
  }
}
