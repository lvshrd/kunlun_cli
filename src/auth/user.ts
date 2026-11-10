import { createServer, type ServerResponse } from "node:http"
import { CliError } from "../errors.ts"
import type { OpenApi } from "../client/http.ts"
import type { Config } from "../config/store.ts"
import { isRecord, num, str } from "../json.ts"
import { openBrowser, shouldOpenBrowser } from "./browser.ts"
import { requestAppAccessToken } from "./tenant.ts"
import { buildAuthorizeUrl, refreshTokenPath, userInfoPath, userTokenPath } from "./endpoints.ts"
import {
  isFresh,
  loadUserSession,
  newState,
  saveUserSession,
  type UserSession,
} from "./session.ts"

export interface TokenBundle {
  accessToken: string
  refreshToken: string
  expiresIn: number
  refreshExpiresIn: number
  scope: string
}

export function parseCallback(requestUrl: string, expectedState: string, expectedPath: string): { code: string } {
  const url = new URL(requestUrl, "http://127.0.0.1")
  if (url.pathname !== expectedPath) throw new CliError("auth", "Callback path mismatch")
  const oauthError = url.searchParams.get("error")
  if (oauthError) {
    throw new CliError("auth", url.searchParams.get("error_description") || oauthError)
  }
  if (url.searchParams.get("state") !== expectedState) {
    throw new CliError("auth", "Authorization callback state mismatch; login was rejected")
  }
  const code = url.searchParams.get("code")
  if (!code) throw new CliError("auth", "The authorization callback is missing code")
  return { code }
}

export function parseTokenBundle(body: unknown): TokenBundle {
  const record = isRecord(body) ? body : {}
  const data = isRecord(record.data) ? record.data : record
  const accessToken = str(data.access_token)
  if (!accessToken) throw new CliError("auth", "The token exchange response is missing access_token")
  return {
    accessToken,
    refreshToken: str(data.refresh_token) ?? "",
    expiresIn: num(data.expires_in) ?? 7200,
    refreshExpiresIn: num(data.refresh_expires_in) ?? 0,
    scope: str(data.scope) ?? "",
  }
}

export async function getUserToken(dir: string, api: OpenApi, config: Config, secret: string): Promise<string> {
  const session = loadUserSession(dir)
  if (!session?.accessToken) {
    throw new CliError("auth", "Not logged in as a user", "Run kunlun-cli auth login and complete Kunlun authorization in the browser")
  }
  if (isFresh(session.expiresAt)) return session.accessToken
  if (!session.refreshToken || (session.refreshExpiresAt > 0 && session.refreshExpiresAt <= Date.now())) {
    throw new CliError("auth", "The user session has expired", "Run kunlun-cli auth login again")
  }
  const bundle = await exchangeRefreshToken(api, config, secret, session.refreshToken)
  const next = sessionFromBundle(bundle, session.name, session.openId)
  saveUserSession(dir, next)
  return next.accessToken
}

export async function loginUser(
  dir: string,
  api: OpenApi,
  config: Config,
  secret: string,
  options: { openBrowser?: boolean; scope?: string } = {},
): Promise<UserSession> {
  if (!config.appId || !secret) {
    throw new CliError("config", "No application is configured", "Run kunlun-cli config init")
  }
  const redirect = new URL(config.redirectUrl)
  const state = newState()
  const authorizeUrl = buildAuthorizeUrl(config, state, options.scope)
  const code = await waitForCode(redirect, state, authorizeUrl, options.openBrowser !== false)
  const bundle = await exchangeAuthorizationCode(api, config, secret, code)
  const profile = await readProfile(api, bundle.accessToken)
  const session = sessionFromBundle(bundle, profile.name, profile.openId)
  saveUserSession(dir, session)
  return session
}

async function exchangeAuthorizationCode(api: OpenApi, config: Config, secret: string, code: string): Promise<TokenBundle> {
  const appToken = await requestAppAccessToken(api, config.appId, secret)
  const body = await api.call({
    method: "POST",
    path: userTokenPath(),
    token: appToken,
    body: { grant_type: "authorization_code", code },
  })
  return parseTokenBundle(body)
}

async function exchangeRefreshToken(api: OpenApi, config: Config, secret: string, refreshToken: string): Promise<TokenBundle> {
  const appToken = await requestAppAccessToken(api, config.appId, secret)
  const body = await api.call({
    method: "POST",
    path: refreshTokenPath(),
    token: appToken,
    body: { grant_type: "refresh_token", refresh_token: refreshToken },
  })
  return parseTokenBundle(body)
}

async function readProfile(api: OpenApi, token: string): Promise<{ name: string; openId: string }> {
  try {
    const body = await api.call({ method: "GET", path: userInfoPath(), token })
    const data = isRecord(body) && isRecord(body.data) ? body.data : {}
    return { name: str(data.name) ?? "", openId: str(data.open_id) ?? "" }
  } catch {
    return { name: "", openId: "" }
  }
}

function sessionFromBundle(bundle: TokenBundle, name: string, openId: string): UserSession {
  const now = Date.now()
  return {
    accessToken: bundle.accessToken,
    refreshToken: bundle.refreshToken,
    expiresAt: now + bundle.expiresIn * 1000,
    refreshExpiresAt: bundle.refreshExpiresIn > 0 ? now + bundle.refreshExpiresIn * 1000 : 0,
    openId,
    name,
    scope: bundle.scope,
  }
}

function waitForCode(redirect: URL, state: string, authorizeUrl: string, autoOpenBrowser: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      try {
        const result = parseCallback(request.url ?? "/", state, redirect.pathname)
        respond(response, 200, "Authorization complete. You can close this page and return to the terminal.")
        cleanup()
        resolve(result.code)
      } catch (err) {
        if (err instanceof CliError && err.message === "Callback path mismatch") {
          respond(response, 404, "Not found")
          return
        }
        respond(response, 400, err instanceof Error ? err.message : "Authorization failed")
        cleanup()
        reject(err)
      }
    })
    const timer = setTimeout(() => {
      cleanup()
      reject(new CliError("auth", "Timed out waiting for authorization", "Run kunlun-cli auth login again"))
    }, 180_000)
    const cleanup = () => {
      clearTimeout(timer)
      server.close()
    }
    server.on("error", (err) => {
      cleanup()
      reject(new CliError("auth", `Cannot listen for the authorization callback: ${err.message}`, configHint(redirect)))
    })
    server.listen(Number(redirect.port), redirect.hostname, () => {
      console.error("Complete Kunlun authorization in your browser.")
      console.error("If the browser did not open, visit:")
      console.error(authorizeUrl)
      if (shouldOpenBrowser(autoOpenBrowser)) {
        const opened = openBrowser(authorizeUrl)
        if (!opened) {
          console.error("[kunlun-cli] Could not open the browser. Open the URL above manually.")
        }
      } else {
        console.error("[kunlun-cli] Skipped opening the browser (--no-browser, KUNLUN_NO_BROWSER=1, or SSH).")
      }
    })
  })
}

function respond(response: ServerResponse, status: number, text: string): void {
  response.writeHead(status, { "Content-Type": "text/html; charset=utf-8" })
  response.end(`<!doctype html><meta charset="utf-8"><title>kunlun-cli</title><p>${escapeHtml(text)}</p>`)
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char)
}

function configHint(redirect: URL): string {
  return `Ensure ${redirect.origin} is not in use and ${redirect.href} is registered as a redirect URL in the Kunlun developer console`
}
