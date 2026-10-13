import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { loadEffectiveConfig, loadSecret, saveConfig, saveSecret, type Config } from "./store.ts"

const sample: Config = {
  appId: "cli_test",
  openBaseUrl: "https://open.example.com",
  accountsBaseUrl: "https://accounts.example.com",
  redirectUrl: "http://127.0.0.1:19876/callback",
  webBaseUrl: "",
}

test("配置与密钥分开保存，环境变量覆盖应用 ID", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "kunlun-config-"))
  try {
    saveConfig(dir, sample)
    saveSecret(dir, "secret-value")
    const loaded = loadEffectiveConfig(dir, { KUNLUN_APP_ID: "cli_env" })
    assert.equal(loaded.appId, "cli_env")
    assert.equal(loaded.openBaseUrl, "https://open.example.com")
    assert.equal(loadSecret(dir, {}), "secret-value")
    assert.equal(loadSecret(dir, { KUNLUN_APP_SECRET: "from-env" }), "from-env")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("拒绝非回环重定向地址", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "kunlun-config-"))
  try {
    assert.throws(() => saveConfig(dir, { ...sample, redirectUrl: "https://evil.example/callback" }))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
