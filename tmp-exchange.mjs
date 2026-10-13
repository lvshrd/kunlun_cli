import { readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

const dir = path.join(homedir(), ".kunlun-cli")
const config = JSON.parse(readFileSync(path.join(dir, "config.json"), "utf8"))
const secret = readFileSync(path.join(dir, "app-secret"), "utf8").trim()
const code = process.argv[2]
if (!code) {
  console.log("missing code")
  process.exit(1)
}

const appResponse = await fetch(config.openBaseUrl + "/open-apis/auth/v3/app_access_token/internal", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ app_id: config.appId, app_secret: secret }),
})
const app = await appResponse.json()
if (!app.app_access_token) {
  console.log("app_token_failed", app.code, app.msg || app.message || "")
  process.exit(1)
}

const tokenResponse = await fetch(config.openBaseUrl + "/open-apis/authen/v1/oidc/access_token", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${app.app_access_token}`,
  },
  body: JSON.stringify({ grant_type: "authorization_code", code }),
})
const tokenBody = await tokenResponse.json()
const data = tokenBody.data || tokenBody
if (!data.access_token) {
  console.log("exchange_failed", tokenResponse.status, tokenBody.code, tokenBody.msg || tokenBody.message || tokenBody.error || "")
  process.exit(1)
}

const now = Date.now()
const session = {
  accessToken: data.access_token,
  refreshToken: data.refresh_token || "",
  expiresAt: now + (data.expires_in || 7200) * 1000,
  refreshExpiresAt: data.refresh_expires_in ? now + data.refresh_expires_in * 1000 : 0,
  openId: "",
  name: "",
  scope: data.scope || "",
}
const infoResponse = await fetch(config.openBaseUrl + "/open-apis/authen/v1/user_info", {
  headers: { Authorization: `Bearer ${data.access_token}` },
})
const info = await infoResponse.json()
const profile = info.data || {}
session.name = profile.name || ""
session.openId = profile.open_id || ""
writeFileSync(path.join(dir, "user-session.json"), JSON.stringify(session) + "\n", { mode: 0o600 })
console.log(JSON.stringify({
  ok: true,
  name: session.name,
  open_id: session.openId,
  scope: session.scope,
  expires_in: data.expires_in,
}))
