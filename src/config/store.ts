import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { CliError } from "../errors.ts"

export interface Config {
  appId: string
  openBaseUrl: string
  accountsBaseUrl: string
  redirectUrl: string
  webBaseUrl: string
}

export const defaultConfig: Config = {
  appId: "",
  openBaseUrl: "https://open.fklzl.cnpc.com.cn",
  accountsBaseUrl: "https://accounts.fklzl.cnpc.com.cn",
  redirectUrl: "http://127.0.0.1:19876/callback",
  webBaseUrl: "",
}

export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.KUNLUN_CONFIG_DIR || path.join(homedir(), ".kunlun-cli")
}

export function readConfigFile(dir: string): Partial<Config> {
  const file = path.join(dir, "config.json")
  if (!existsSync(file)) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"))
  } catch {
    throw new CliError("config", "Cannot parse config.json", file)
  }
  if (!parsed || typeof parsed !== "object") {
    throw new CliError("config", "Invalid config.json format", file)
  }
  const raw = parsed as Record<string, unknown>
  const result: Partial<Config> = {}
  if (typeof raw.appId === "string") result.appId = raw.appId
  if (typeof raw.openBaseUrl === "string") result.openBaseUrl = raw.openBaseUrl
  if (typeof raw.accountsBaseUrl === "string") result.accountsBaseUrl = raw.accountsBaseUrl
  if (typeof raw.redirectUrl === "string") result.redirectUrl = raw.redirectUrl
  if (typeof raw.webBaseUrl === "string") result.webBaseUrl = raw.webBaseUrl
  return result
}

export function loadEffectiveConfig(dir: string, env: NodeJS.ProcessEnv = process.env): Config {
  const file = readConfigFile(dir)
  const defaults = defaultConfig
  const merged: Config = {
    appId: env.KUNLUN_APP_ID || file.appId || defaults.appId,
    openBaseUrl: env.KUNLUN_OPEN_BASE_URL || file.openBaseUrl || defaults.openBaseUrl,
    accountsBaseUrl: env.KUNLUN_ACCOUNTS_BASE_URL || file.accountsBaseUrl || defaults.accountsBaseUrl,
    redirectUrl: env.KUNLUN_REDIRECT_URL || file.redirectUrl || defaults.redirectUrl,
    webBaseUrl: env.KUNLUN_WEB_BASE_URL ?? file.webBaseUrl ?? defaults.webBaseUrl,
  }
  return normalizeConfig(merged)
}

export function saveConfig(dir: string, config: Config): void {
  const normalized = normalizeConfig(config)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, "config.json"), `${JSON.stringify(normalized, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  })
}

export function loadSecret(dir: string, env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.KUNLUN_APP_SECRET?.trim()
  if (fromEnv) return fromEnv
  const file = path.join(dir, "app-secret")
  if (existsSync(file)) return readFileSync(file, "utf8").trim()
  return ""
}

export function saveSecret(dir: string, secret: string): void {
  const trimmed = secret.trim()
  if (!trimmed) throw new CliError("config", "App Secret must not be empty")
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, "app-secret"), trimmed, { encoding: "utf8", mode: 0o600 })
}

export function secretSource(dir: string, env: NodeJS.ProcessEnv = process.env): "env" | "file" | "missing" {
  if (env.KUNLUN_APP_SECRET?.trim()) return "env"
  if (existsSync(path.join(dir, "app-secret"))) return "file"
  return "missing"
}

export function normalizeConfig(config: Config): Config {
  return {
    appId: config.appId.trim(),
    openBaseUrl: httpsOrigin(config.openBaseUrl, "open_base_url"),
    accountsBaseUrl: httpsOrigin(config.accountsBaseUrl, "accounts_base_url"),
    redirectUrl: loopbackRedirect(config.redirectUrl),
    webBaseUrl: config.webBaseUrl.trim() ? httpsOrigin(config.webBaseUrl, "web_base_url") : "",
  }
}

export function httpsOrigin(raw: string, name: string): string {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new CliError("config", `${name} must be a valid URL`)
  }
  if (url.protocol !== "https:") throw new CliError("config", `${name} must use HTTPS`)
  if (url.username || url.password || url.search || url.hash) {
    throw new CliError("config", `${name} must be an origin without credentials, query parameters, or fragments`)
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new CliError("config", `${name} must not include a path`)
  }
  return url.origin
}

export function loopbackRedirect(raw: string): string {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new CliError("config", "redirect_url must be a valid URL")
  }
  if (url.protocol !== "http:") throw new CliError("config", "redirect_url must use HTTP for the local authorization callback")
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new CliError("config", "redirect_url must point to 127.0.0.1 or localhost")
  }
  if (!url.port) throw new CliError("config", "redirect_url must include a port, for example http://127.0.0.1:19876/callback")
  if (url.username || url.password || url.search || url.hash) {
    throw new CliError("config", "redirect_url must not include credentials, query parameters, or fragments")
  }
  return url.toString()
}

