import { CliError } from "../../errors.ts"
import { printOk } from "../../output/envelope.ts"
import { buildAuthorizeUrl } from "../../auth/endpoints.ts"
import { getBotToken } from "../../auth/tenant.ts"
import { configDir, loadEffectiveConfig, loadSecret, secretSource } from "../../config/store.ts"
import { loadUserSession, publicUser } from "../../auth/session.ts"
import { KunlunClient } from "../../client/http.ts"
import type { Invocation, Route } from "../route.ts"

export function doctorRoutes(): Route[] {
  return [
    { path: ["doctor"], summary: "Check platform endpoints, application credentials, and the user session", run: doctor },
  ]
}

async function doctor(invocation: Invocation): Promise<void> {
  if (invocation.rest.length > 0) throw new CliError("usage", "doctor does not accept additional arguments")
  const dir = configDir()
  const config = loadEffectiveConfig(dir)
  const secret = loadSecret(dir)
  const open = await probe(config.openBaseUrl)
  const accounts = await probe(`${config.accountsBaseUrl}/open-apis/authen/v1/authorize`)
  let authorizeReady = false
  if (config.appId) {
    try {
      buildAuthorizeUrl(config, "state")
      authorizeReady = true
    } catch {
      authorizeReady = false
    }
  }
  let bot: Record<string, unknown> = { configured: Boolean(config.appId && secret) }
  if (config.appId && secret) {
    try {
      await getBotToken(dir, new KunlunClient(config.openBaseUrl), config.appId, secret)
      bot = { configured: true, ok: true }
    } catch (err) {
      bot = { configured: true, ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  }
  printOk({
    open,
    accounts,
    app_id: config.appId,
    secret_source: secretSource(dir),
    authorize_url_ready: authorizeReady,
    redirect_url: config.redirectUrl,
    bot,
    user: publicUser(loadUserSession(dir)),
  })
}

async function probe(url: string): Promise<{ url: string; ok: boolean; status: number; message?: string }> {
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000) })
    return { url, ok: response.status > 0 && response.status < 500, status: response.status }
  } catch (err) {
    return { url, ok: false, status: 0, message: err instanceof Error ? err.message : String(err) }
  }
}
