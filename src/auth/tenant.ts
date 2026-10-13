import { CliError } from "../errors.ts"
import type { OpenApi } from "../client/http.ts"
import { isRecord, num, str } from "../json.ts"
import { appTokenPath, tenantTokenPath } from "./endpoints.ts"
import { isFresh, loadBotSession, saveBotSession } from "./session.ts"

export async function getBotToken(dir: string, api: OpenApi, appId: string, secret: string): Promise<string> {
  const cached = loadBotSession(dir)
  if (cached && isFresh(cached.expiresAt)) return cached.token
  const issued = await requestTenantToken(api, appId, secret)
  saveBotSession(dir, {
    token: issued.token,
    expiresAt: Date.now() + issued.expire * 1000,
  })
  return issued.token
}

export async function requestTenantToken(api: OpenApi, appId: string, secret: string): Promise<{ token: string; expire: number }> {
  const body = await api.call({
    method: "POST",
    path: tenantTokenPath(),
    body: { app_id: appId, app_secret: secret },
  })
  const record = isRecord(body) ? body : {}
  const token = str(record.tenant_access_token)
  if (!token) throw new CliError("auth", "租户凭证响应缺少 tenant_access_token")
  return { token, expire: num(record.expire) ?? 7200 }
}

export async function requestAppAccessToken(api: OpenApi, appId: string, secret: string): Promise<string> {
  const body = await api.call({
    method: "POST",
    path: appTokenPath(),
    body: { app_id: appId, app_secret: secret },
  })
  const token = str(isRecord(body) ? body.app_access_token : undefined)
  if (!token) throw new CliError("auth", "应用凭证响应缺少 app_access_token")
  return token
}
