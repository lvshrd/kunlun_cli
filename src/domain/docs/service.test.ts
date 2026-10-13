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
})

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
