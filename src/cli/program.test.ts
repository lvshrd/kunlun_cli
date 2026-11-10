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
  assert.match(help, /kunlun-cli <command> \[arguments\]/)
  assert.doesNotMatch(help, /\bkunlun\s/)
})

test("安装后的标准版本参数与子命令帮助可用", async () => {
  const versionOutput = await capture(() => run(["--version"]))
  assert.equal(versionOutput.code, 0)
  assert.equal(typeof JSON.parse(versionOutput.stdout).data.version, "string")
  const help = await capture(() => run(["auth", "--help"]))
  assert.equal(help.code, 0)
  assert.match(help.stdout, /auth login/)
  assert.doesNotMatch(help.stdout, /^\s+docs create\s+/m)
  assert.doesNotMatch(help.stdout, /node src\/main\.ts/)
})

test("创建文档的预览不访问网络", async () => {
  const output = await capture(() => run(["docs", "create", "--title", "周报", "--content", "# 进展\n完成登录", "--dry-run"]))
  assert.equal(output.code, 0)
  const payload = JSON.parse(output.stdout) as { ok: boolean; data: { block_count: number; title: string } }
  assert.equal(payload.ok, true)
  assert.equal(payload.data.title, "周报")
  assert.equal(payload.data.block_count, 2)
})

test("版本与帮助的短选项、长选项和子命令等价", async () => {
  let expected = ""
  for (const arg of ["-v", "--version", "version"]) {
    const result = await capture(() => run([arg]))
    assert.equal(result.code, 0)
    if (!expected) expected = result.stdout
    assert.equal(result.stdout, expected)
  }
  const globalHelp = await capture(() => run(["--help"]))
  for (const args of [["-h"], ["help"], []]) assert.deepEqual(await capture(() => run(args)), globalHelp)
  const docsHelp = await capture(() => run(["docs", "--help"]))
  for (const args of [["docs", "-h"], ["help", "docs"]]) assert.deepEqual(await capture(() => run(args)), docsHelp)
  assert.match(docsHelp.stdout, /docs read/)
  assert.doesNotMatch(docsHelp.stdout, /^\s+auth login\s+/m)
  assert.deepEqual(await capture(() => run(["help", "docs", "read"])), await capture(() => run(["docs", "read", "-h"])))
})

test("短选项规范化后拒绝重复，未知帮助目标和额外版本参数不误报成功", async () => {
  for (const args of [["-v", "--version"], ["-h", "--help"], ["-x"], ["-vh"], ["help", "missing"], ["missing", "-h"], ["version", "extra"], ["version", "--raw"]]) {
    const output = await capture(() => run(args))
    assert.equal(output.code, 1, args.join(" "))
    assert.equal(JSON.parse(output.stdout).error.type, "usage")
  }
  assert.deepEqual(parseArgs(["--", "-v"]).positionals, ["-v"])
  assert.equal(parseArgs(["--content", "-1"]).flags.content, "-1")
})

test("所有命令帮助和本地参数错误使用英文", async () => {
  const help = await capture(() => run(["--help"]))
  assert.equal(help.code, 0)
  assert.doesNotMatch(help.stdout, /\p{Script=Han}/u)
  for (const args of [["missing"], ["-x"], ["version", "extra"], ["auth", "login", "--scope="]]) {
    const result = await capture(() => run(args))
    assert.equal(result.code, 1)
    const payload = JSON.parse(result.stdout)
    assert.equal(payload.error.type, "usage")
    assert.doesNotMatch(payload.error.message, /\p{Script=Han}/u)
    assert.doesNotMatch(payload.error.hint ?? "", /\p{Script=Han}/u)
  }
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
