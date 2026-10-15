import assert from "node:assert/strict"
import test from "node:test"
import { shouldOpenBrowser, windowsBrowserSpawn } from "./browser.ts"

test("Windows 用 rundll32 传递完整 URL", () => {
  const url =
    "https://accounts.example.com/open-apis/authen/v1/authorize?client_id=x&redirect_uri=http%3A%2F%2F127.0.0.1%3A19876%2Fcallback&response_type=code&state=abc"
  const spawn = windowsBrowserSpawn(url)
  assert.equal(spawn.command, "rundll32.exe")
  assert.deepEqual(spawn.args, ["url.dll,FileProtocolHandler", url])
})

test("SSH 或 KUNLUN_NO_BROWSER 时不自动打开浏览器", () => {
  const prev = process.env.KUNLUN_NO_BROWSER
  process.env.KUNLUN_NO_BROWSER = "1"
  try {
    assert.equal(shouldOpenBrowser(true), false)
  } finally {
    if (prev === undefined) delete process.env.KUNLUN_NO_BROWSER
    else process.env.KUNLUN_NO_BROWSER = prev
  }
})
