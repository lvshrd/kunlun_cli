import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { packProject, manifest, runNpm } from "./package-lib.mjs"

const temporary = mkdtempSync(path.join(tmpdir(), "kunlun-package-"))
const prefix = path.join(temporary, "安装目录")
const work = path.join(temporary, "工作目录")
mkdirSync(work)
// 不继承维护者的应用凭证和目录覆盖；仅在临时目录中配置模拟应用。
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("KUNLUN_")))
env.KUNLUN_CONFIG_DIR = path.join(temporary, "配置")
env.npm_config_cache = path.join(temporary, "npm-cache")
const steps = []

function invoke(args, input) {
  const shim = process.platform === "win32" ? path.join(prefix, "kunlun.cmd") : path.join(prefix, "bin", "kunlun")
  const quote = (value) => `'${value.replace(/'/g, "''")}'`
  const command = process.platform === "win32" ? "powershell.exe" : shim
  const commandArgs = process.platform === "win32"
    ? ["-NoProfile", "-NonInteractive", "-Command", `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [Console]::OutputEncoding; & ${quote(shim)} ${args.map(quote).join(" ")}; exit $LASTEXITCODE`]
    : args
  const result = spawnSync(command, commandArgs, { cwd: work, env, input, encoding: "utf8", timeout: 30_000, windowsHide: true })
  if (result.error) throw result.error
  return result
}

function ok(args, input) {
  const result = invoke(args, input)
  assert.equal(result.status, 0, `${args.join(" ")}: ${result.stdout}\n${result.stderr}`)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.ok, true)
  return payload.data
}

try {
  const packed = packProject(temporary)
  runNpm(["install", "--global", "--prefix", prefix, packed.path, "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--update-notifier=false"], { env })
  steps.push("安装包无运行时依赖，使用空 npm 缓存离线全局安装成功")
  assert.equal(ok(["--version"]).version, manifest.version)
  const help = invoke(["--help"])
  assert.equal(help.status, 0)
  assert.match(help.stdout, /用法：kunlun/)
  assert.doesNotMatch(help.stdout, /node src\/main\.ts/)
  steps.push("从源码目录外通过 npm 生成的命令入口运行帮助和版本")
  assert.equal(ok(["config", "show"]).app_id, "")
  assert.equal(ok(["config", "show"]).secret_source, "missing")
  const scopes = ok(["auth", "scopes"])
  assert.equal(scopes.version, manifest.version)
  assert.deepEqual(scopes.default_scopes, ["docx:document", "drive:drive.metadata:readonly", "drive:drive:readonly", "space:document:retrieve"])
  assert.deepEqual(scopes.allowed_scopes, scopes.default_scopes)
  // 无配置也应先拒绝非法授权参数，不能进入浏览器等待或返回缺凭证错误。
  for (const args of [["--scope", "im:message"], ["--scope="], ["--scpoe", "docx:document"]]) {
    const refusedAuth = invoke(["auth", "login", ...args])
    assert.equal(refusedAuth.status, 1)
    assert.equal(JSON.parse(refusedAuth.stdout).error.type, "usage")
    assert.equal(refusedAuth.stderr, "")
  }
  steps.push("固定权限目录可离线查询，未知或空 scope 与拼错参数在授权前退出")
  const needsTerminal = invoke(["config", "init"])
  assert.notEqual(needsTerminal.status, 0)
  assert.match(JSON.parse(needsTerminal.stdout).error.message, /需要终端/)
  ok(["config", "init", "--app-id", "cli_package_test", "--app-secret-stdin"], "package-test-secret\n")
  const config = ok(["config", "show"])
  assert.equal(config.app_id, "cli_package_test")
  assert.equal(config.secret_source, "file")
  assert.doesNotMatch(JSON.stringify(config), /package-test-secret/)
  assert.equal(ok(["auth", "status"]).logged_in, false)
  steps.push("模拟应用配置、凭证脱敏和未登录状态验证")
  const output = path.join(work, "操作文档.md")
  ok(["docs", "template", "--output", output])
  const content = readFileSync(output, "utf8")
  assert.match(content, /# 操作文档示例/)
  const refused = invoke(["docs", "template", "--output", output])
  assert.notEqual(refused.status, 0)
  assert.match(JSON.parse(refused.stdout).error.message, /已存在/)
  assert.equal(readFileSync(output, "utf8"), content)
  const preview = ok(["docs", "create", "--title", "试用文档", "--file", output, "--dry-run"])
  assert.ok(preview.block_count > 0)
  assert.equal(preview.dry_run, true)
  const denied = invoke(["docs", "create", "--title", "试用文档", "--file", output])
  assert.notEqual(denied.status, 0)
  assert.equal(JSON.parse(denied.stdout).error.type, "auth")
  steps.push("中文路径模板、拒绝覆盖、创建预览和未登录写入拦截")
  const skills = path.join(work, "Agent技能")
  ok(["skills", "install", "--dir", skills])
  assert.match(readFileSync(path.join(skills, "kunlun-doc", "SKILL.md"), "utf8"), /docs edit/)
  const repeated = invoke(["skills", "install", "--dir", skills])
  assert.notEqual(repeated.status, 0)
  steps.push("安装 Agent Skill 并保护已有技能")
  mkdirSync(env.KUNLUN_CONFIG_DIR, { recursive: true })
  writeFileSync(path.join(env.KUNLUN_CONFIG_DIR, "user-session.json"), "{}")
  writeFileSync(path.join(env.KUNLUN_CONFIG_DIR, "bot-token.json"), "{}")
  ok(["config", "init", "--app-id", "cli_other", "--app-secret-stdin"], "other-test-secret\n")
  assert.equal(ok(["config", "show"]).app_id, "cli_other")
  assert.equal(ok(["config", "show"]).secret_source, "file")
  assert.equal(existsSync(path.join(env.KUNLUN_CONFIG_DIR, "user-session.json")), false)
  assert.equal(existsSync(path.join(env.KUNLUN_CONFIG_DIR, "bot-token.json")), false)
  steps.push("统一包不带应用配置；更换应用后旧用户与 bot 登录态失效")
  console.log(JSON.stringify({ ok: true, version: manifest.version, steps, note: "隔离目录离线验收，未访问昆仑或使用维护者真实凭证；同事本人授权与云端读写需另行实测" }, null, 2))
} finally {
  // 删除范围仅限本脚本通过 mkdtempSync 创建的临时目录。
  assert.ok(path.resolve(temporary).startsWith(path.resolve(tmpdir()) + path.sep))
  rmSync(temporary, { recursive: true, force: true })
}
