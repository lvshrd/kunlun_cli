import assert from "node:assert/strict"
import test from "node:test"
import { parseArgs } from "./args.ts"
import { formatHelp, run } from "./program.ts"

test("解析开关、等号和位置参数", () => {
  const parsed = parseArgs(["docs", "create", "--title=周报", "--dry-run", "--content", "你好"])
  assert.deepEqual(parsed.positionals, ["docs", "create"])
  assert.equal(parsed.flags.title, "周报")
  assert.equal(parsed.flags["dry-run"], true)
  assert.equal(parsed.flags.content, "你好")
})

test("帮助里包含文档命令", () => {
  const help = formatHelp([
    { path: ["docs", "create"], summary: "创建云文档", run: async () => {} },
  ])
  assert.match(help, /docs create/)
})

test("创建文档的预览不访问网络", async () => {
  const output = await capture(() => run(["docs", "create", "--title", "周报", "--content", "# 进展\n完成登录", "--dry-run"]))
  assert.equal(output.code, 0)
  const payload = JSON.parse(output.stdout) as { ok: boolean; data: { block_count: number; title: string } }
  assert.equal(payload.ok, true)
  assert.equal(payload.data.title, "周报")
  assert.equal(payload.data.block_count, 2)
})

async function capture(runCommand: () => Promise<number>): Promise<{ code: number; stdout: string }> {
  const chunks: string[] = []
  const original = process.stdout.write
  process.stdout.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"))
    return true
  }) as typeof process.stdout.write
  try {
    return { code: await runCommand(), stdout: chunks.join("") }
  } finally {
    process.stdout.write = original
  }
}
