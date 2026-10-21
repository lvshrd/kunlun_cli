import { CliError } from "../errors.ts"
import { isRecord, num, str } from "../json.ts"

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
    const next = scopes[0]
      ? `例如 kunlun auth login --scope "${scopes[0]}"（具体权限组合以接口文档为准）`
      : '运行 kunlun auth login --scope "<接口所需权限>"'
    return `用户尚未授予接口所需权限。先确认应用后台已开通相应的「用户身份权限」并已生效，再在浏览器补充授权；${next}。刷新 token 不会自动增加授权范围。`
  }
  if (body.code === 99991672) {
    return "应用缺少接口权限。请在昆仑开发者后台检查当前调用身份对应的权限，并确认权限已生效；需审核的权限须发布版本并审核通过。用户身份调用还需通过 auth login --scope 补充用户授权。"
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
