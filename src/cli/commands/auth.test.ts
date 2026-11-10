import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { defaultConfig, saveConfig, saveSecret } from "../../config/store.ts"

const entrypoint = fileURLToPath(new URL("../../main.ts", import.meta.url))

test("真实 CLI 在启动授权前拒绝非法参数且保留已有凭证和登录态", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "kunlun-auth-guard-"))
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("KUNLUN_")))
  env.KUNLUN_CONFIG_DIR = dir
  env.KUNLUN_NO_BROWSER = "1"
  try {
    saveConfig(dir, { ...defaultConfig, appId: "cli_guard_test", openBaseUrl: "https://open.example.com", accountsBaseUrl: "https://accounts.example.com" })
    saveSecret(dir, "guard-test-secret")
    writeFileSync(path.join(dir, "user-session.json"), '{"accessToken":"existing-test-token"}')
    const before = ["config.json", "app-secret", "user-session.json"].map((file) => [file, readFileSync(path.join(dir, file), "utf8")] as const)
    for (const args of [
      ["--scope", "docx:document im:message"],
      ["--scope="],
      ["--scope", "   "],
      ["--scope", "*"],
      ["--scope"],
      ["--scpoe", "docx:document"],
      ["--scope", "im:message", "--scope", "docx:document"],
      ["--scope", "docx:document", "--force"],
      ["--allow-unknown-scopes=true"],
    ]) {
      const result = spawnSync(process.execPath, [entrypoint, "auth", "login", ...args], { env, encoding: "utf8", timeout: 5000, windowsHide: true })
      assert.ifError(result.error)
      assert.equal(result.status, 1, args.join(" "))
      const output = JSON.parse(result.stdout)
      assert.equal(output.ok, false)
      assert.equal(output.error.type, "usage")
      assert.equal(result.stderr, "", "不应输出浏览器授权提示或启动等待")
      assert.doesNotMatch(result.stdout, /guard-test-secret|existing-test-token/)
    }
    for (const [file, content] of before) assert.equal(readFileSync(path.join(dir, file), "utf8"), content)

    // 权限目录不依赖应用配置；无凭证时也能供 Agent 查询。
    const result = spawnSync(process.execPath, [entrypoint, "auth", "scopes"], {
      env: { ...env, KUNLUN_CONFIG_DIR: path.join(dir, "not-configured") }, encoding: "utf8", timeout: 5000, windowsHide: true,
    })
    assert.ifError(result.error)
    assert.equal(result.status, 0)
    const data = JSON.parse(result.stdout).data
    assert.equal(data.source, "release")
    assert.deepEqual(data.allowed_scopes, ["docx:document", "drive:drive.metadata:readonly", "drive:drive:readonly", "space:document:retrieve", "sheets:spreadsheet", "bitable:app"])
    assert.deepEqual(data.default_scopes, data.allowed_scopes)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
