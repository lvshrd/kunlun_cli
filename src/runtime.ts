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
      "No Kunlun application is configured",
      "Run kunlun-cli config init",
    )
  }
  return { dir, config, secret, client: new KunlunClient(config.openBaseUrl) }
}
