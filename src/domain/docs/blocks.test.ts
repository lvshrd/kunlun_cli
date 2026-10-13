import assert from "node:assert/strict"
import test from "node:test"
import { blocksToMarkdown, chunk, contentToBlocks } from "./blocks.ts"

test("把 Markdown 标题和段落转成云文档块", () => {
  const blocks = contentToBlocks("# 周报\r\n\r\n## 进展\r\n完成登录\r\n### 下一步\r\n联调授权")
  assert.deepEqual(blocks.map((block) => block.block_type), [3, 4, 2, 5, 2])
  assert.equal(blocks[0]?.heading1?.elements[0]?.text_run.content, "周报")
  assert.equal(blocks[2]?.text?.elements[0]?.text_run.content, "完成登录")
})

test("把云文档块还原成 Markdown", () => {
  const markdown = blocksToMarkdown([
    { page: { elements: [{ text_run: { content: "周报" } }] } },
    { heading2: { elements: [{ text_run: { content: "进展" } }] } },
    { text: { elements: [{ text_run: { content: "完成" } }, { text_run: { content: "登录" } }] } },
  ])
  assert.equal(markdown, "# 周报\n## 进展\n完成登录")
})

test("按 50 块分批", () => {
  assert.deepEqual(chunk([1, 2, 3], 2), [[1, 2], [3]])
})
