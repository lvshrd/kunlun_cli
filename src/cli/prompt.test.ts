import assert from "node:assert/strict"
import { PassThrough } from "node:stream"
import test from "node:test"
import { promptValue } from "./prompt.ts"

test("Secret 交互输入不回显，取消时不给出部分凭证", async () => {
  const input = new PassThrough()
  const output = new PassThrough()
  let displayed = ""
  output.on("data", (chunk) => { displayed += chunk.toString() })
  const result = promptValue("App Secret: ", true, input, output)
  input.write("invisible-secret\r")
  assert.equal(await result, "invisible-secret")
  assert.match(displayed, /App Secret:/)
  assert.doesNotMatch(displayed, /invisible-secret/)
  const cancelledInput = new PassThrough()
  const cancelled = promptValue("Secret: ", true, cancelledInput, output)
  cancelledInput.write("partial\x03")
  await assert.rejects(cancelled, /cancelled/)
  assert.doesNotMatch(displayed, /partial/)
})

test("App ID 提示在等待输入时可见，回车后返回输入值", async () => {
  const input = new PassThrough()
  const output = new PassThrough()
  let displayed = ""
  output.on("data", (chunk) => { displayed += chunk.toString() })
  const result = promptValue("Enter App ID: ", false, input, output)
  assert.match(displayed, /Enter App ID:/)
  input.write("cli_test")
  input.write("\r")
  assert.equal(await result, "cli_test")
})
