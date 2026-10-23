import { KunlunClient } from "./client/http.ts"
import { configDir, loadEffectiveConfig, loadSecret, type Config } from "./config/store.ts"
import { CliError } from "./errors.ts"

export interface AppContext {
  dir: string
  config: Config
  secret: string
  client: KunlunClient
}

export function requireApp(): AppContext {
  const dir = configDir()
  const config = loadEffectiveConfig(dir)
  const secret = loadSecret(dir)
  if (!config.appId || !secret) {
    throw new CliError(
      "config",
      "尚未配置昆仑智联应用",
      "运行 kunlun config init",
    )
  }
  return { dir, config, secret, client: new KunlunClient(config.openBaseUrl) }
}
