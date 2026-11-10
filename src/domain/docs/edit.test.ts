import assert from "node:assert/strict"
import test from "node:test"
import type { CallRequest, OpenApi } from "../../client/http.ts"
import { editDocument } from "./edit.ts"

function fixture(content = "每周检查一次", hasMore = false) {
  const calls: CallRequest[] = []
  const api: OpenApi = { call: async (request) => {
    calls.push(request)
    if (request.path.endsWith("/blocks")) return { data: { items: [{ block_id: "b1", text: { elements: [{ text_run: { content, text_element_style: { bold: true } } }] } }], has_more: hasMore } }
    if (request.method === "PATCH") return { code: 0 }
    return { data: { document: { revision_id: 8 } } }
  } }
  return { api, calls }
}

test("段落编辑预览不写入，执行保留样式并使用预览版本", async () => {
  const { api, calls } = fixture()
  const preview = await editDocument(api, "t", "d", { find: "每周", replacement: "每天", dryRun: true })
  assert.equal(preview.after, "每天检查一次")
  assert.equal(calls.some((c) => c.method === "PATCH"), false)
  await editDocument(api, "t", "d", { find: "每周", replacement: "每天", revision: preview.revision })
  const patch = calls.find((c) => c.method === "PATCH")!
  assert.equal(patch.query?.document_revision_id, "8")
  assert.deepEqual(patch.body, { requests: [{ block_id: "b1", update_text_elements: { elements: [{ text_run: { content: "每天检查一次", text_element_style: { bold: true } } }] } }] })
})

test("版本冲突、重复匹配及不完整分页均拒绝修改", async () => {
  const conflict = fixture()
  await assert.rejects(editDocument(conflict.api, "t", "d", { find: "每周", replacement: "每天", revision: 7 }), /revision has changed/)
  const duplicate = fixture("每周检查，每周记录")
  await assert.rejects(editDocument(duplicate.api, "t", "d", { find: "每周", replacement: "每天" }), /2 editable matches/)
  const incomplete = fixture("每周检查", true)
  await assert.rejects(editDocument(incomplete.api, "t", "d", { find: "每周", replacement: "每天" }), /not fully read/)
  for (const f of [conflict, duplicate, incomplete]) assert.equal(f.calls.some((c) => c.method === "PATCH"), false)
})
