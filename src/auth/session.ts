import { randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { CliError } from "../errors.ts"

export interface UserSession {
  accessToken: string
  refreshToken: string
  expiresAt: number
  refreshExpiresAt: number
  openId: string
  name: string
  scope: string
}

export interface BotSession {
  token: string
  expiresAt: number
}

const skewMs = 5 * 60 * 1000

export function isFresh(expiresAt: number, now = Date.now()): boolean {
  return expiresAt - now > skewMs
}

export function newState(): string {
  return randomBytes(16).toString("hex")
}

export function loadUserSession(dir: string): UserSession | undefined {
  return readJson(path.join(dir, "user-session.json")) as UserSession | undefined
}

export function saveUserSession(dir: string, session: UserSession): void {
  writeJson(dir, "user-session.json", session)
}

export function clearUserSession(dir: string): boolean {
  const file = path.join(dir, "user-session.json")
  if (!existsSync(file)) return false
  rmSync(file)
  return true
}

export function loadBotSession(dir: string): BotSession | undefined {
  return readJson(path.join(dir, "bot-token.json")) as BotSession | undefined
}

export function saveBotSession(dir: string, session: BotSession): void {
  writeJson(dir, "bot-token.json", session)
}

export function publicUser(session: UserSession | undefined, now = Date.now()): Record<string, unknown> {
  if (!session) return { logged_in: false }
  return {
    logged_in: true,
    name: session.name,
    open_id: session.openId,
    scope: session.scope,
    expires_at: new Date(session.expiresAt).toISOString(),
    needs_refresh: !isFresh(session.expiresAt, now),
    refresh_expired: session.refreshExpiresAt > 0 && session.refreshExpiresAt <= now,
  }
}

function readJson(file: string): unknown {
  if (!existsSync(file)) return undefined
  try {
    return JSON.parse(readFileSync(file, "utf8"))
  } catch {
    throw new CliError("auth", "本地登录态文件损坏", `删除 ${file} 后重新登录`)
  }
}

function writeJson(dir: string, name: string, value: unknown): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, name), `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 })
}
