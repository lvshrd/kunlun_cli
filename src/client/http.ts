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
      throw new CliError("api", failure, undefined, {
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
