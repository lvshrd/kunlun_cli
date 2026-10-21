import type { Config } from "../config/store.ts"
import { CliError } from "../errors.ts"

// 用户授权走 accounts 域 authorize：client_id + response_type=code + redirect_uri + state。
// open 域 /authen/v1/index 适合网页内嵌，经 cmd start 截断 query 时也容易报「请求非法」。
export function buildAuthorizeUrl(config: Config, state: string, scope?: string): string {
  const url = new URL("/open-apis/authen/v1/authorize", config.accountsBaseUrl)
  url.searchParams.set("client_id", config.appId)
  url.searchParams.set("redirect_uri", config.redirectUrl)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("state", state)
  const scopes = [...new Set(scope?.trim().split(/\s+/).filter(Boolean) ?? [])]
  if (scopes.length > 50) throw new CliError("usage", "一次授权最多请求 50 个 scope")
  if (scopes.length > 0) url.searchParams.set("scope", scopes.join(" "))
  return url.toString()
}

export function appTokenPath(): string {
  return "/open-apis/auth/v3/app_access_token/internal"
}

export function userTokenPath(): string {
  return "/open-apis/authen/v1/oidc/access_token"
}

export function refreshTokenPath(): string {
  return "/open-apis/authen/v1/oidc/refresh_access_token"
}

export function tenantTokenPath(): string {
  return "/open-apis/auth/v3/tenant_access_token/internal"
}

export function userInfoPath(): string {
  return "/open-apis/authen/v1/user_info"
}
