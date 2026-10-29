import assert from "node:assert/strict"
import test from "node:test"
import { inspectBlocks } from "./read.ts"

test("混合段落、列表、表格与容器：保留关系并逐块报告省略", () => {
  const result = inspectBlocks([
    { block_id: "root", block_type: 1, children: ["text", "list", "table"], page: { elements: [{ text_run: { content: "文档" } }] } },
    { block_id: "text", parent_id: "root", block_type: 2, text: { elements: [{ text_run: { content: "正文" } }] } },
    { block_id: "list", parent_id: "root", block_type: 12, bullet: { elements: [{ text_run: { content: "列表" } }] } },
    { block_id: "table", parent_id: "root", block_type: 31, children: ["cell"] },
    { block_id: "cell", parent_id: "table", block_type: 32, children: ["cell-text"] },
    { block_id: "cell-text", parent_id: "cell", block_type: 2, text: { elements: [{ text_run: { content: "单元格文本" } }] } },
  ])
  assert.equal(result.markdown, "# 文档\n正文\n单元格文本")
  assert.deepEqual(result.diagnostics.map((item) => item.block_id), ["list", "table", "cell"])
  assert.equal(result.blocks[5]?.parent_id, "cell")
  assert.deepEqual(result.blocks[3]?.children, ["cell"])
})

test("同一文本块混有提及和公式时，保留文本仍报告每项省略", () => {
  const result = inspectBlocks([{ block_id: "mixed", block_type: 2, text: { elements: [
    { text_run: { content: "已知文本" } },
    { mention_user: { user_id: "user" } },
    { text_run: { content: "结尾" }, equation: { content: "x" } },
  ] } }])
  assert.equal(result.markdown, "已知文本结尾")
  assert.deepEqual(result.diagnostics.map((item) => [item.element_index, item.element_type]), [[1, "mention_user"], [2, "equation"]])
})

test("空段落正常；未知块、无效文本和缺失子块均有定位诊断", () => {
  const result = inspectBlocks([
    { block_type: 2, text: { elements: [] } },
    null,
    { block_id: "unknown", block_type: 999, text: { elements: [{ text_run: { content: "不能误认支持" } }] } },
    { block_id: "bad-body", block_type: 2, text: {} },
    { block_id: "bad-text", block_type: 2, text: { elements: [{ text_run: { content: 123 } }, null] } },
    { block_id: "parent", block_type: 1, page: { elements: [] }, children: ["missing"] },
  ])
  assert.equal(result.markdown, "")
  assert.deepEqual(result.diagnostics.map((item) => item.reason), ["invalid_block", "unsupported_block", "invalid_elements", "invalid_text", "unsupported_element", "missing_child"])
  assert.equal(result.diagnostics[1]?.block_id, "unknown")
  assert.equal(result.diagnostics[5]?.block_index, 5)
})

test("纯文本、三级标题与样式段的文本完整提取", () => {
  const result = inspectBlocks([1, 2, 3, 4, 5].map((type, i) => ({
    block_type: type,
    [["page", "text", "heading1", "heading2", "heading3"][i]!]: { elements: [
      { text_run: { content: "内容", text_element_style: { bold: true } } },
      { text_run: { content: "结尾" } },
    ] },
  })))
  assert.equal(result.markdown, "# 内容结尾\n内容结尾\n# 内容结尾\n## 内容结尾\n### 内容结尾")
  assert.deepEqual(result.diagnostics, [])
})
