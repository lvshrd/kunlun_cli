import assert from "node:assert/strict"
import test from "node:test"
import { CliError } from "../errors.ts"
import { buildAuthorizeUrl } from "./endpoints.ts"
import { parseCallback, parseTokenBundle } from "./user.ts"
import type { Config } from "../config/store.ts"

const config: Config = {
  appId: "cli_test",
  openBaseUrl: "https://open.example.com",
  accountsBaseUrl: "https://accounts.example.com",
  redirectUrl: "http://127.0.0.1:19876/callback",
  webBaseUrl: "",
}

test("默认登录请求本版本固定的四项业务权限", () => {
  const url = new URL(buildAuthorizeUrl(config, "state-1"))
  assert.equal(url.origin, "https://accounts.example.com")
  assert.equal(url.pathname, "/open-apis/authen/v1/authorize")
  assert.equal(url.searchParams.get("client_id"), "cli_test")
  assert.equal(url.searchParams.get("redirect_uri"), config.redirectUrl)
  assert.equal(url.searchParams.get("response_type"), "code")
  assert.equal(url.searchParams.get("state"), "state-1")
  assert.equal(url.searchParams.get("app_id"), null)
  assert.equal(url.searchParams.get("scope"), "docx:document drive:drive.metadata:readonly drive:drive:readonly space:document:retrieve")
})

test("文档授权链接保留并编码业务权限，去重且规范空白", () => {
  const url = new URL(buildAuthorizeUrl(config, "state-1", "  docx:document\n docx:document  drive:drive:readonly "))
  assert.equal(url.searchParams.get("scope"), "docx:document drive:drive:readonly")
  assert.equal(url.searchParams.get("redirect_uri"), config.redirectUrl)
  assert.equal(url.searchParams.get("state"), "state-1")
})

test("拒绝空 scope、未知权限、通配符、逗号分隔及有效无效混合输入", () => {
  for (const scope of ["", "  ", "*", "all", "docx:document:readonly", "im:message", "docx:document im:message", "docx:document,drive:drive:readonly", "docx:document&scope=im:message"]) {
    assert.throws(
      () => buildAuthorizeUrl(config, "s", scope),
      (err: unknown) => err instanceof CliError && err.type === "usage",
      scope,
    )
  }
})

test("拒绝 state 不一致的回调", () => {
  assert.throws(
    () => parseCallback("/callback?code=abc&state=other", "expected", "/callback"),
    (err: unknown) => err instanceof CliError && err.type === "auth",
  )
})

test("解析换票响应", () => {
  const bundle = parseTokenBundle({
    code: 0,
    data: { access_token: "u-1", refresh_token: "r-1", expires_in: 10, scope: "docx:document" },
  })
  assert.equal(bundle.accessToken, "u-1")
  assert.equal(bundle.expiresIn, 10)
  assert.equal(bundle.scope, "docx:document")
})
