import type { Config } from "../config/store.ts"

// 昆仑智联的授权页只接受 app_id、redirect_uri、state。
// 带上 client_id、response_type 或 scope 时，登录后会返回 20029。
export function buildAuthorizeUrl(config: Config, state: string): string {
  const url = new URL("/open-apis/authen/v1/index", config.openBaseUrl)
  url.searchParams.set("app_id", config.appId)
  url.searchParams.set("redirect_uri", config.redirectUrl)
  url.searchParams.set("state", state)
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
