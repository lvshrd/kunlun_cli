import { CliError } from "../errors.ts"
import { isRecord, num, str } from "../json.ts"
import { supportedUserScopes } from "../auth/scopes.ts"

export interface CallRequest {
  method: string
  path: string
  token?: string
  query?: Record<string, string>
  body?: unknown
}

export interface OpenApi {
  call(request: CallRequest): Promise<unknown>
}

export class KunlunClient implements OpenApi {
  private readonly openBaseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(openBaseUrl: string, fetchImpl: typeof fetch = fetch) {
    this.openBaseUrl = openBaseUrl
    this.fetchImpl = fetchImpl
  }

  async call(request: CallRequest): Promise<unknown> {
    const url = this.resolve(request.path, request.query)
    const headers: Record<string, string> = { "User-Agent": "kunlun-cli/0.1" }
    if (request.token) headers.Authorization = `Bearer ${request.token}`
    let body: string | undefined
    if (request.body !== undefined) {
      headers["Content-Type"] = "application/json; charset=utf-8"
      body = JSON.stringify(request.body)
    }
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: request.method,
        headers,
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new CliError("network", `请求昆仑智联失败：${message}`, url.origin + url.pathname)
    }
    const text = await response.text()
    const parsed = parseBody(text)
    const failure = failureOf(response.status, parsed)
    if (failure) {
      throw new CliError("api", failure, permissionHint(parsed), {
        http_status: response.status,
        path: url.pathname,
        upstream: parsed ?? text.slice(0, 500),
      })
    }
    return parsed
  }

  private resolve(apiPath: string, query?: Record<string, string>): URL {
    if (!apiPath.startsWith("/") || apiPath.startsWith("//")) {
      throw new CliError("usage", "接口路径必须以 / 开头", "例如 /open-apis/docx/v1/documents")
    }
    const url = new URL(apiPath, this.openBaseUrl)
    if (url.origin !== new URL(this.openBaseUrl).origin) {
      throw new CliError("usage", "接口路径不能跳到其它主机")
    }
    if (query) {
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
    }
    return url
  }
}

function permissionHint(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined
  if (body.code === 99991679) {
    const error = isRecord(body.error) ? body.error : {}
    const violations = Array.isArray(error.permission_violations) ? error.permission_violations : []
    const scopes = [...new Set(violations
      .filter((item) => isRecord(item) && item.type === "action_privilege_required")
      .map((item) => isRecord(item) ? str(item.subject) : undefined)
      .filter((scope): scope is string => Boolean(scope && /^[a-zA-Z0-9_:.-]+$/.test(scope))))]
    if (scopes.some((scope) => supportedUserScopes.includes(scope))) {
      return "用户授权不足，接口返回的候选权限包含本版本支持项。确认应用后台的用户身份权限已生效后，可运行 kunlun auth login 按本版本固定权限重新授权；若仍失败，停止重试并联系维护者核实权限组合。不要照抄上游 scope 扩大授权，刷新 token 不会自动增加授权范围。"
    }
    return "无法从接口返回的权限中确认本版本支持项。运行 kunlun auth scopes 查看版本权限，联系维护者核实接口及权限并在需要时发布新版；不要猜测 scope 或反复重新授权。"
  }
  if (body.code === 99991672) {
    return "应用缺少接口权限。请由维护者在昆仑开发者后台检查当前调用身份对应的权限，并确认权限已生效；需审核的权限须发布版本并审核通过。需要新增权限时同步更新 CLI release，生效后再运行 kunlun auth login；不要临时追加 scope 或反复重试授权。"
  }
  return undefined
}

function parseBody(text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function failureOf(status: number, body: unknown): string | undefined {
  if (isRecord(body)) {
    if (typeof body.code === "number" && body.code !== 0) {
      return str(body.msg) || str(body.message) || `昆仑智联返回错误码 ${body.code}`
    }
    if (num(body.code) === undefined && typeof body.error === "string" && body.error) {
      return str(body.error_description) || body.error
    }
  }
  if (status >= 400) return `昆仑智联返回 HTTP ${status}`
  return undefined
}
