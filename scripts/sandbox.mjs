import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs"
import path from "node:path"
import { manifest, projectRoot, runNpm } from "./package-lib.mjs"

const archive = path.join(projectRoot, "release", `${manifest.name}-${manifest.version}.tgz`)
if (!existsSync(archive)) throw new Error("先运行 npm run package 生成要试用的安装包")
const root = path.join(projectRoot, ".kunlun-sandbox")
mkdirSync(root, { recursive: true })
const sandbox = mkdtempSync(path.join(root, "trial-"))
const prefix = path.join(sandbox, "install")
const config = path.join(sandbox, "config")
const work = path.join(sandbox, "work")
const cache = path.join(sandbox, "npm-cache")
mkdirSync(work)
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("KUNLUN_")))
env.npm_config_cache = cache
runNpm(["install", "--global", "--prefix", prefix, archive, "--offline", "--ignore-scripts", "--no-audit", "--no-fund"], { env })
const quote = (value) => `'${value.replace(/'/g, "''")}'`
const start = path.join(root, "start.ps1")
writeFileSync(start, [
  "$ErrorActionPreference = 'Stop'",
  "Get-ChildItem Env: | Where-Object { $_.Name -like 'KUNLUN_*' } | ForEach-Object { Remove-Item -LiteralPath ('Env:' + $_.Name) }",
  `$env:KUNLUN_CONFIG_DIR = ${quote(config)}`,
  `$env:npm_config_cache = ${quote(cache)}`,
  `$env:PATH = ${quote(prefix + path.delimiter)} + $env:PATH`,
  "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
  "$OutputEncoding = [Console]::OutputEncoding",
  `Set-Location -LiteralPath ${quote(work)}`,
  `& ${quote(path.join(prefix, "kunlun.cmd"))} --version`,
  `& ${quote(path.join(prefix, "kunlun.cmd"))} config show`,
  "Write-Host 'Isolated trial ready. Run: kunlun.cmd config init'",
].join("\r\n") + "\r\n", "utf8")
writeFileSync(path.join(root, "latest.json"), JSON.stringify({ sandbox, prefix, config, work, archive, start }, null, 2) + "\n", "utf8")
console.log(JSON.stringify({ ok: true, version: manifest.version, sandbox, config_dir: config, work_dir: work, launch: `powershell -NoExit -ExecutionPolicy Bypass -File "${start}"`, note: "新终端仅对本次进程设置环境，不读取或覆盖原有 ~/.kunlun-cli；隔离安装与配置，但不是操作系统安全沙箱" }, null, 2))
