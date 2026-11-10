import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, copyFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { packProject, manifest, runNpm, projectRoot } from "./package-lib.mjs"

const temporary = mkdtempSync(path.join(tmpdir(), "kunlun-package-"))
const prefix = path.join(temporary, "安装目录")
const work = path.join(temporary, "工作目录")
mkdirSync(work)
// 不继承维护者的应用凭证和目录覆盖；仅在临时目录中配置模拟应用。
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("KUNLUN_")))
env.KUNLUN_CONFIG_DIR = path.join(temporary, "配置")
env.npm_config_cache = path.join(temporary, "npm-cache")
// Reproduce coexistence with an older installation without relying on this PC.
const oldBin = path.join(temporary, "旧安装目录")
const oldShim = "@echo off\r\nexit /b 42\r\n"
if (process.platform === "win32") {
  mkdirSync(oldBin)
  writeFileSync(path.join(oldBin, "kunlun-cli.cmd"), oldShim)
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "Path"
  env[pathKey] = oldBin + ";" + (env[pathKey] ?? "")
}
const steps = []

function invoke(args, input) {
  const shim = process.platform === "win32" ? path.join(prefix, "kunlun-cli.cmd") : path.join(prefix, "bin", "kunlun-cli")
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

function installWindows(archive, useManifest = false) {
  return spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(temporary, "install.ps1"),
    ...(useManifest ? [] : ["-PackagePath", archive]), "-InstallDir", prefix, "-NoPersistPath"], {
    cwd: work, env, encoding: "utf8", timeout: 120_000, windowsHide: true,
  })
}

function userPath() {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command",
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment'); if ($key) { try { $key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) } finally { $key.Dispose() } }"],
  { env, encoding: "utf8", timeout: 30_000, windowsHide: true })
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
  return result.stdout
}

// Build a minimal 0.1.0 of the same scoped package to exercise npm's real bin
// migration, rather than manually deleting the old shim in the installer.
function installLegacyCommand() {
  const stage = path.join(temporary, "legacy")
  mkdirSync(path.join(stage, "dist"), { recursive: true })
  writeFileSync(path.join(stage, "package.json"), JSON.stringify({
    name: manifest.name, version: "0.1.0", type: "module", bin: { kunlun: "dist/main.js" },
  }))
  writeFileSync(path.join(stage, "dist/main.js"), '#!/usr/bin/env node\nconsole.log(JSON.stringify({ok:true,data:{version:"0.1.0"}}))\n')
  const [legacy] = JSON.parse(runNpm(["pack", "--json", "--ignore-scripts", "--pack-destination", temporary], { cwd: stage, env }))
  runNpm(["install", "--global", "--prefix", prefix, path.join(temporary, legacy.filename), "--offline", "--ignore-scripts", "--no-audit", "--no-fund"], { env })
  const bin = process.platform === "win32" ? prefix : path.join(prefix, "bin")
  assert.equal(existsSync(path.join(bin, process.platform === "win32" ? "kunlun.cmd" : "kunlun")), true)
  assert.equal(existsSync(path.join(bin, process.platform === "win32" ? "kunlun-cli.cmd" : "kunlun-cli")), false)
}

try {
  const packed = packProject(temporary)
  const beforeUserPath = process.platform === "win32" ? userPath() : undefined
  if (process.platform === "win32") {
    copyFileSync(path.join(projectRoot, "scripts/install.ps1"), path.join(temporary, "install.ps1"))
    writeFileSync(path.join(temporary, "release.json"), JSON.stringify({ package: packed.filename }))
    writeFileSync(packed.path + ".sha256", "0".repeat(64) + "  " + packed.filename)
    const rejected = installWindows(packed.path)
    assert.ifError(rejected.error)
    assert.notEqual(rejected.status, 0)
    assert.equal(existsSync(prefix), false, "校验失败不得开始安装")
    const checksum = createHash("sha256").update(readFileSync(packed.path)).digest("hex")
    writeFileSync(packed.path + ".sha256", `${checksum}  ${packed.filename}\n`)
    const installed = installWindows(packed.path, true)
    assert.ifError(installed.error)
    assert.equal(installed.status, 0, installed.stdout + installed.stderr)
  } else {
    installLegacyCommand()
    runNpm(["install", "--global", "--prefix", prefix, packed.path, "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--update-notifier=false"], { env })
    assert.equal(existsSync(path.join(prefix, "bin", "kunlun")), false, "升级应移除旧入口")
  }
  steps.push("安装包无运行时依赖，使用空 npm 缓存离线全局安装成功")
  const packageRoot = path.join(prefix, ...(process.platform === "win32" ? [] : ["lib"]), "node_modules", ...manifest.name.split("/"))
  const installedManifest = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"))
  assert.equal(installedManifest.name, "@lvshrd/kunlun-cli")
  assert.equal(installedManifest.version, manifest.version)
  assert.equal(installedManifest.private, undefined)
  assert.equal(installedManifest.publishConfig.access, "public")
  assert.equal(installedManifest.scripts, undefined)
  assert.equal(installedManifest.devDependencies, undefined)
  assert.deepEqual(Object.keys(installedManifest.bin), ["kunlun-cli"])
  assert.equal(path.resolve(packageRoot, installedManifest.bin["kunlun-cli"]), path.join(packageRoot, "dist/main.js"))
  steps.push("scoped 包名、公开发布配置及安装 manifest 验证成功，Windows 默认 manifest 入口可识别 scoped tgz")
  assert.equal(ok(["--version"]).version, manifest.version)
  assert.equal(ok(["-v"]).version, manifest.version)
  assert.equal(ok(["version"]).version, manifest.version)
  const help = invoke(["--help"])
  assert.equal(help.status, 0)
  assert.match(help.stdout, /用法：kunlun-cli/)
  assert.doesNotMatch(help.stdout, /node src\/main\.ts/)
  assert.match(help.stdout, /docs search/)
  for (const args of [["-h"], ["help"]]) assert.equal(invoke(args).stdout, help.stdout)
  const docsHelp = invoke(["docs", "--help"])
  for (const args of [["docs", "-h"], ["help", "docs"]]) {
    const result = invoke(args)
    assert.equal(result.status, 0)
    assert.equal(result.stdout, docsHelp.stdout)
  }
  const invalidSearch = invoke(["docs", "search", "--query", "规程", "--offset", "150", "--limit", "50"])
  assert.equal(invalidSearch.status, 1)
  assert.equal(JSON.parse(invalidSearch.stdout).error.type, "usage")
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
  assert.match(readFileSync(path.join(skills, "kunlun-doc", "SKILL.md"), "utf8"), /docs search/)
  const repeated = invoke(["skills", "install", "--dir", skills])
  assert.notEqual(repeated.status, 0)
  steps.push("安装 Agent Skill 并保护已有技能")
  mkdirSync(env.KUNLUN_CONFIG_DIR, { recursive: true })
  writeFileSync(path.join(env.KUNLUN_CONFIG_DIR, "user-session.json"), "{}")
  writeFileSync(path.join(env.KUNLUN_CONFIG_DIR, "bot-token.json"), "{}")
  if (process.platform === "win32") {
    const protectedFiles = ["config.json", "app-secret", "user-session.json", "bot-token.json"]
    const before = protectedFiles.map((file) => readFileSync(path.join(env.KUNLUN_CONFIG_DIR, file), "utf8"))
    const installedPackage = path.join(prefix, "node_modules", ...manifest.name.split("/"))
    const installedMain = path.join(installedPackage, "dist/main.js")
    const original = readFileSync(installedMain, "utf8")
    installLegacyCommand()
    writeFileSync(installedMain, original + "\n// old installation marker\n")
    const obsolete = path.join(installedPackage, "obsolete-test-file")
    writeFileSync(obsolete, "old release")
    const updated = installWindows(packed.path)
    assert.ifError(updated.error)
    assert.equal(updated.status, 0, updated.stdout + updated.stderr)
    assert.equal(readFileSync(installedMain, "utf8"), original, "升级应覆盖旧程序文件")
    assert.equal(existsSync(obsolete), false, "覆盖安装应移除旧包残留")
    for (const legacyShim of ["kunlun", "kunlun.cmd", "kunlun.ps1"]) {
      assert.equal(existsSync(path.join(prefix, legacyShim)), false, "同一 scoped 包升级应移除旧命令入口")
    }
    protectedFiles.forEach((file, index) => assert.equal(readFileSync(path.join(env.KUNLUN_CONFIG_DIR, file), "utf8"), before[index]))
    assert.equal(userPath(), beforeUserPath, "隔离验收不能修改真实用户 PATH")
    assert.equal(readFileSync(path.join(oldBin, "kunlun-cli.cmd"), "utf8"), oldShim, "保留其他 PATH 目录中的旧安装")
    const commandEnv = Object.fromEntries(Object.entries(env).filter(([key]) => key.toLowerCase() !== "path"))
    commandEnv.Path = prefix + ";" + (Object.entries(env).find(([key]) => key.toLowerCase() === "path")?.[1] ?? "")
    const global = spawnSync("cmd.exe", ["/d", "/c", "kunlun-cli --version"], { cwd: work, env: commandEnv, encoding: "utf8", timeout: 30_000, windowsHide: true })
    assert.ifError(global.error)
    assert.equal(global.status, 0, global.stderr)
    assert.equal(JSON.parse(global.stdout).data.version, manifest.version)
    steps.push("Windows 从 0.1.0 kunlun 升级到 kunlun-cli：清理旧 shim 和残留，保留配置和登录态；多个 PATH 安装共存时首个命令执行成功")
  }
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
