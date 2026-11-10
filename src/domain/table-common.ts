import { CliError } from "../errors.ts"
import { isRecord, str } from "../json.ts"

export function identifier(value: string, name: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new CliError("usage", `Invalid ${name}`)
  return value
}

export function resourceToken(input: string, kind: "sheets" | "base" | "docx"): string {
  if (!input.includes("://")) return identifier(input, `${kind} token`)
  let url: URL
  try { url = new URL(input) } catch { throw new CliError("usage", "Invalid resource URL") }
  const parts = url.pathname.split("/").filter(Boolean)
  if (url.protocol !== "https:" || parts.length !== 2 || parts[0] !== kind) {
    throw new CliError("unsupported", `Expected a /${kind}/ URL or a raw token`, "Resolve wiki links or discover embedded DocX resources before using their tokens.")
  }
  return identifier(parts[1]!, `${kind} token`)
}

export function dataOf(body: unknown): Record<string, unknown> {
  if (!isRecord(body) || !isRecord(body.data)) throw new CliError("api", "The API response is missing data")
  return body.data
}

export function objectOf(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) throw new CliError("api", `The API response is missing ${name}`)
  return value
}

export interface PageOptions { pageSize?: number; pageToken?: string; all?: boolean }

export function pagination(options: PageOptions, max: number) {
  const size = options.pageSize ?? Math.min(100, max)
  if (!Number.isSafeInteger(size) || size < 1 || size > max) throw new CliError("usage", `--page-size must be an integer from 1 to ${max}`)
  if (options.all && options.pageToken) throw new CliError("usage", "--all cannot be combined with --page-token")
  return { size, token: options.pageToken ?? "" }
}

export async function readPages(fetchPage: (query: Record<string, string>) => Promise<unknown>, options: PageOptions, max: number) {
  const { size, token } = pagination(options, max)
  const items: unknown[] = []
  const seen = new Set<string>(token ? [token] : [])
  let cursor = token
  let pages = 0
  const partial = (reason: string, cause?: unknown): never => {
    throw new CliError("incomplete", "Pagination did not complete; do not treat the result as a full snapshot", "Use the partial items only; narrow the query or retry the read before planning writes.", {
      items, complete: false, pages_read: pages, reason,
      ...(cause instanceof CliError ? { cause: { type: cause.type, message: cause.message } } : {}),
    })
  }
  for (let page = 0; page < 50; page++) {
    let data: Record<string, unknown>
    try { data = dataOf(await fetchPage({ page_size: String(size), ...(cursor ? { page_token: cursor } : {}) })) }
    catch (err) { if (pages === 0) throw err; return partial("request_failed", err) }
    if (!Array.isArray(data.items) || data.items.some(item => !isRecord(item)) || typeof data.has_more !== "boolean") return partial("invalid_page")
    items.push(...data.items)
    pages++
    const next = str(data.page_token)?.trim()
    if (data.has_more && !next) return partial("missing_page_token")
    if (data.has_more && seen.has(next!)) return partial("repeated_page_token")
    if (!data.has_more || !options.all) return { items, has_more: data.has_more, next_page_token: data.has_more ? next : null, complete: !data.has_more && !token, pages_read: pages }
    seen.add(next!)
    cursor = next!
  }
  return partial("page_limit")
}

export function writeFailure(err: unknown, target: Record<string, unknown>, stage: "write" | "verify"): never {
  throw new CliError(stage === "write" ? "write_unknown" : "verification", stage === "write"
    ? "The write failed; its outcome may be unknown"
    : "The write completed, but read-back verification failed", "Inspect the target before retrying. No automatic retry or rollback was performed.", {
      ...target, write_completed: stage === "verify", outcome_unknown: stage === "write",
      ...(err instanceof CliError ? { cause: { type: err.type, message: err.message, hint: err.hint, data: err.data } } : {}),
    })
}
