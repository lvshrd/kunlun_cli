import { CliError } from "../../errors.ts"
import { isRecord } from "../../json.ts"
import { printOk } from "../../output/envelope.ts"
import { getBotToken } from "../../auth/tenant.ts"
import { getUserToken } from "../../auth/user.ts"
import { requireApp } from "../../runtime.ts"
import { boolFlag, strFlag } from "../args.ts"
import type { Invocation, Route } from "../route.ts"

export function apiRoutes(): Route[] {
  return [
    { path: ["api"], summary: "调用任意昆仑智联开放平台接口", run: callApi },
  ]
}

async function callApi(invocation: Invocation): Promise<void> {
  const method = invocation.rest[0]?.toUpperCase()
  const apiPath = invocation.rest[1]
  if (!method || !apiPath || invocation.rest.length !== 2) {
    throw new CliError("usage", "用法：kunlun api <METHOD> <path>", "例如 kunlun api GET /open-apis/authen/v1/user_info")
  }
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    throw new CliError("usage", `不支持的 HTTP 方法 ${method}`)
  }
  const app = requireApp()
  const identity = identityOf(invocation)
  const query = jsonObjectFlag(invocation, "params")
  const body = invocation.flags.data === undefined ? undefined : jsonValueFlag(invocation, "data")
  const url = new URL(apiPath, app.config.openBaseUrl)
  if (boolFlag(invocation.flags, "dry-run")) {
    printOk({
      dry_run: true,
      identity,
      method,
      url: url.toString(),
      params: query ?? {},
      data: body ?? null,
    })
    return
  }
  const token = identity === "bot"
    ? await getBotToken(app.dir, app.client, app.config.appId, app.secret)
    : await getUserToken(app.dir, app.client, app.config, app.secret)
  const response = await app.client.call({ method, path: apiPath, token, query, body })
  printOk({ identity, response })
}

function identityOf(invocation: Invocation): "user" | "bot" {
  const value = strFlag(invocation.flags, "as") ?? "user"
  if (value !== "user" && value !== "bot") throw new CliError("usage", "--as 只能是 user 或 bot")
  return value
}

function jsonObjectFlag(invocation: Invocation, name: string): Record<string, string> | undefined {
  const value = jsonValueFlag(invocation, name)
  if (value === undefined) return undefined
  if (!isRecord(value)) throw new CliError("usage", `--${name} 必须是 JSON 对象`)
  const query: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      query[key] = String(item)
      continue
    }
    throw new CliError("usage", `--${name} 的值只能是字符串、数字或布尔`)
  }
  return query
}

function jsonValueFlag(invocation: Invocation, name: string): unknown {
  const raw = strFlag(invocation.flags, name)
  if (raw === undefined) return undefined
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new CliError("usage", `--${name} 不是合法 JSON`)
  }
}

export { identityOf }
