import { readFileSync, existsSync, rmSync } from "node:fs"
import path from "node:path"
import { CliError } from "../../errors.ts"
import { printOk } from "../../output/envelope.ts"
import {
  configDir,
  loadEffectiveConfig,
  saveConfig,
  saveSecret,
  secretSource,
  type Config,
} from "../../config/store.ts"
import { boolFlag, strFlag } from "../args.ts"
import { promptValue } from "../prompt.ts"
import type { Invocation, Route } from "../route.ts"

export function configRoutes(): Route[] {
  return [
    { path: ["config", "init"], summary: "Save the application ID, secret, and Kunlun endpoints", run: initConfig },
    { path: ["config", "show"], summary: "Show the current configuration without exposing the secret", run: showConfig },
  ]
}

async function initConfig(invocation: Invocation): Promise<void> {
  if (invocation.rest.length > 0) throw new CliError("usage", "config init does not accept additional parameters")
  const dir = configDir()
  const current = loadEffectiveConfig(dir)
  if (invocation.flags["app-secret"] !== undefined) throw new CliError("usage", "Do not pass App Secret as a command-line argument", "Use interactive config init or --app-secret-stdin")
  const fromStdin = boolFlag(invocation.flags, "app-secret-stdin")
  let appId = strFlag(invocation.flags, "app-id")
  let secret: string
  if (fromStdin) {
    if (!appId) throw new CliError("usage", "--app-secret-stdin requires --app-id to be specified")
    secret = readFileSync(0, "utf8").trim()
  } else {
    if (!process.stdin.isTTY) throw new CliError("usage", "Interactive configuration requires a terminal", "For scripts, use config init --app-id <ID> --app-secret-stdin")
    console.error("Kunlun application setup: enter App ID and App Secret. Press Enter to continue or Ctrl+C to cancel.")
    appId ??= await promptValue(`Enter App ID${current.appId ? ` [press Enter to use ${current.appId}]` : ""}: `) || current.appId
    if (!appId) throw new CliError("usage", "App ID cannot be empty")
    secret = await promptValue("Enter App Secret (hidden; paste and press Enter): ", true)
  }
  if (!secret) throw new CliError("config", "App Secret must not be empty; nothing was saved")
  const next: Config = {
    appId,
    openBaseUrl: strFlag(invocation.flags, "open-base-url") || current.openBaseUrl,
    accountsBaseUrl: strFlag(invocation.flags, "accounts-base-url") || current.accountsBaseUrl,
    redirectUrl: strFlag(invocation.flags, "redirect-url") || current.redirectUrl,
    webBaseUrl: strFlag(invocation.flags, "web-base-url") ?? current.webBaseUrl,
  }
  saveConfig(dir, next)
  saveSecret(dir, secret)
  // 更换应用或开放平台时不能复用旧应用的用户与 bot 凭证。
  if (current.appId !== next.appId || current.openBaseUrl !== next.openBaseUrl || current.accountsBaseUrl !== next.accountsBaseUrl) {
    for (const name of ["user-session.json", "bot-token.json"]) {
      const file = path.join(dir, name)
      if (existsSync(file)) rmSync(file)
    }
  }
  printOk({
    config_dir: dir,
    app_id: appId,
    open_base_url: next.openBaseUrl,
    accounts_base_url: next.accountsBaseUrl,
    redirect_url: next.redirectUrl,
    web_base_url: next.webBaseUrl,
    secret_configured: true,
  })
}

async function showConfig(invocation: Invocation): Promise<void> {
  if (invocation.rest.length > 0) throw new CliError("usage", "config show does not accept additional parameters")
  const dir = configDir()
  const config = loadEffectiveConfig(dir)
  printOk({
    config_dir: dir,
    app_id: config.appId,
    open_base_url: config.openBaseUrl,
    accounts_base_url: config.accountsBaseUrl,
    redirect_url: config.redirectUrl,
    web_base_url: config.webBaseUrl,
    secret_source: secretSource(dir),
  })
}
