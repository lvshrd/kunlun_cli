import { CliError } from "../errors.ts"
import { isRecord, num, str } from "../json.ts"
import { supportedUserScopes } from "../auth/scopes.ts"
import { version } from "../version.ts"

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
    const headers: Record<string, string> = { "User-Agent": `kunlun-cli/${version}` }
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
      throw new CliError("network", `Kunlun request failed: ${message}`, url.origin + url.pathname)
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
      throw new CliError("usage", "API paths must start with /", "For example: /open-apis/docx/v1/documents")
    }
    const url = new URL(apiPath, this.openBaseUrl)
    if (url.origin !== new URL(this.openBaseUrl).origin) {
      throw new CliError("usage", "API paths must stay on the configured origin")
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
      return "User authorization is insufficient; the API lists scopes supported by this release. Confirm that the application has the required user permissions, then run kunlun-cli auth login to authorize the fixed release scopes. If the request still fails, stop retrying and contact the maintainer. Do not add scopes from upstream errors; refreshing a token does not expand authorization."
    }
    return "The API did not identify a scope supported by this release. Run kunlun-cli auth scopes and contact the maintainer to verify the API and permissions. A new release may be required; do not guess scopes or repeatedly authorize."
  }
  if (body.code === 99991672) {
    return "The application lacks API permissions. Ask the maintainer to verify permissions for the current identity in the Kunlun developer console and complete any required review. New scopes must be included in a CLI release before running kunlun-cli auth login again. Do not add ad hoc scopes or repeatedly authorize."
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
      return str(body.msg) || str(body.message) || `Kunlun returned error code ${body.code}`
    }
    if (num(body.code) === undefined && typeof body.error === "string" && body.error) {
      return str(body.error_description) || body.error
    }
  }
  if (status >= 400) return `Kunlun returned HTTP ${status}`
  return undefined
}
