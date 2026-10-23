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
    { path: ["config", "init"], summary: "保存应用 ID、密钥和昆仑智联地址", run: initConfig },
    { path: ["config", "show"], summary: "查看当前配置，不显示密钥", run: showConfig },
  ]
}

async function initConfig(invocation: Invocation): Promise<void> {
  if (invocation.rest.length > 0) throw new CliError("usage", "config init 不接受额外参数")
  const dir = configDir()
  const current = loadEffectiveConfig(dir)
  if (invocation.flags["app-secret"] !== undefined) throw new CliError("usage", "不要通过命令行参数传入 Secret", "使用交互式 config init，或 --app-secret-stdin")
  const fromStdin = boolFlag(invocation.flags, "app-secret-stdin")
  let appId = strFlag(invocation.flags, "app-id")
  let secret: string
  if (fromStdin) {
    if (!appId) throw new CliError("usage", "--app-secret-stdin 需要同时指定 --app-id")
    secret = readFileSync(0, "utf8").trim()
  } else {
    if (!process.stdin.isTTY) throw new CliError("usage", "交互配置需要终端", "脚本使用 config init --app-id <ID> --app-secret-stdin")
    console.error("昆仑智联应用配置：依次输入 App ID 和 App Secret，按回车继续；Ctrl+C 取消。")
    appId ??= await promptValue(`请输入 App ID${current.appId ? ` [回车沿用 ${current.appId}]` : ""}: `) || current.appId
    if (!appId) throw new CliError("usage", "App ID 不能为空")
    secret = await promptValue("请输入 App Secret（输入不回显，粘贴后按回车）: ", true)
  }
  if (!secret) throw new CliError("config", "App Secret 不能为空，未保存")
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
