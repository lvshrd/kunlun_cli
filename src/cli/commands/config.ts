import { readFileSync } from "node:fs"
import { CliError } from "../../errors.ts"
import { printOk } from "../../output/envelope.ts"
import {
  configDir,
  defaultConfig,
  loadEffectiveConfig,
  readConfigFile,
  saveConfig,
  saveSecret,
  secretSource,
  type Config,
} from "../../config/store.ts"
import { boolFlag, strFlag } from "../args.ts"
import type { Invocation, Route } from "../route.ts"

export function configRoutes(): Route[] {
  return [
    { path: ["config", "init"], summary: "保存应用 ID、密钥和昆仑智联地址", run: initConfig },
    { path: ["config", "show"], summary: "查看当前配置，不显示密钥", run: showConfig },
  ]
}

async function initConfig(invocation: Invocation): Promise<void> {
  if (invocation.rest.length > 0) throw new CliError("usage", "config init 不接受额外参数")
  const appId = strFlag(invocation.flags, "app-id")
  if (!appId) throw new CliError("usage", "缺少 --app-id")
  if (!boolFlag(invocation.flags, "app-secret-stdin")) {
    throw new CliError(
      "usage",
      "请用 --app-secret-stdin 从标准输入读取 App Secret",
      "在 PowerShell 中：'密钥' | node src/main.ts config init --app-id cli_xxx --app-secret-stdin",
    )
  }
  const secret = readFileSync(0, "utf8").trim()
  if (!secret) throw new CliError("config", "没有从标准输入读到 App Secret")
  const dir = configDir()
  const current = { ...defaultConfig, ...readConfigFile(dir) }
  const next: Config = {
    appId,
    openBaseUrl: strFlag(invocation.flags, "open-base-url") || current.openBaseUrl,
    accountsBaseUrl: strFlag(invocation.flags, "accounts-base-url") || current.accountsBaseUrl,
    redirectUrl: strFlag(invocation.flags, "redirect-url") || current.redirectUrl,
    webBaseUrl: strFlag(invocation.flags, "web-base-url") ?? current.webBaseUrl,
  }
  saveConfig(dir, next)
  saveSecret(dir, secret)
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
  if (invocation.rest.length > 0) throw new CliError("usage", "config show 不接受额外参数")
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
