import type { OpenApi } from "../../client/http.ts"
import { CliError } from "../../errors.ts"
import { isRecord, str } from "../../json.ts"

// 昆仑搜索接口请求枚举；doc 同时包含 doc 和 docx。
export const searchTypes = ["doc", "sheet", "bitable", "file", "slides", "mindnote"] as const

export interface SearchInput {
  query: string
  limit?: number
  offset?: number
  types?: string[]
  exact?: boolean
}

export interface SearchItem {
  token: string
  type: string
  title: string
  owner_id?: string
  document_id?: string
  app_token?: string
  spreadsheet_token?: string
  file_token?: string
}

export interface SearchResult {
  query: string
  items: SearchItem[]
  total: number
  offset: number
  limit: number
  has_more: boolean
  next_offset: number | null
  next_limit: number | null
  search_window_exhausted: boolean
  types: string[]
  exact: boolean
  scanned_count: number
  returned_count: number
}

// 昆仑文档：/document/ukTMukTMukTM/ugDM4UjL4ADO14COwgTN
// docs_types 的 doc 同时包含 doc/docx；仅 user_access_token；offset + count < 200。
export function validateSearchInput(input: SearchInput): Required<SearchInput> {
  const query = input.query.trim()
  const limit = input.limit ?? 20
  const offset = input.offset ?? 0
  const types = [...new Set(input.types ?? searchTypes)]
  const exact = input.exact ?? false
  if (!types.length || types.some(type => !searchTypes.includes(type as typeof searchTypes[number]))) {
    throw new CliError("usage", `--type must be a comma-separated list of: ${searchTypes.join(", ")}`, "Use bitable for Base; doc includes both doc and docx. Omit --type to search all supported types.")
  }
  if (typeof exact !== "boolean") throw new CliError("usage", "--exact must be a boolean")
  if (!query) throw new CliError("usage", "The search query must not be empty")
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw new CliError("usage", "--limit must be an integer from 1 to 50")
  }
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + limit >= 200) {
    throw new CliError("usage", "--offset must be a nonnegative integer, and offset + limit must be less than 200", "Narrow the search query; this API cannot enumerate results at offset 200 or beyond.")
  }
  return { query, limit, offset, types, exact }
}

export async function searchDocuments(api: OpenApi, token: string, input: SearchInput): Promise<SearchResult> {
  const { query, limit, offset, types, exact } = validateSearchInput(input)
  const response = await api.call({
    method: "POST",
    path: "/open-apis/suite/docs-api/search/object",
    token,
    body: { search_key: query, count: limit, offset, docs_types: types },
  })
  const data = isRecord(response) && isRecord(response.data) ? response.data : undefined
  if (!data || !Array.isArray(data.docs_entities) || typeof data.has_more !== "boolean"
    || typeof data.total !== "number" || !Number.isSafeInteger(data.total) || data.total < 0) {
    throw invalidResponse()
  }
  if (data.docs_entities.length > limit || (data.has_more && data.docs_entities.length === 0)) throw invalidResponse()
  const candidates = data.docs_entities.map(parseItem)
  const items = exact ? candidates.filter(item => item.title.trim() === query) : candidates
  // --exact 是本页标题过滤；游标与 total 始终基于上游未过滤结果。
  const nextOffset = offset + candidates.length
  const exhausted = data.has_more && nextOffset >= 199
  return {
    query, items, total: data.total, offset, limit, has_more: data.has_more,
    next_offset: data.has_more && !exhausted ? nextOffset : null,
    next_limit: data.has_more && !exhausted ? Math.min(limit, 199 - nextOffset) : null,
    search_window_exhausted: exhausted,
    types, exact, scanned_count: candidates.length, returned_count: items.length,
  }
}

export async function resolveDocumentByName(api: OpenApi, token: string, name: string): Promise<SearchItem & { document_id: string }> {
  const result = await searchDocuments(api, token, { query: name, limit: 50, types: ["doc"] })
  const hint = "Run kunlun-cli docs search --query <query> --type doc to inspect document candidates. Narrow the query or select a confirmed docx and use docs read --document <document_id>. For other resources, use docs search with --type bitable,sheet,file. Empty results do not prove a resource does not exist."
  // 第一页不能证明全局唯一；即使已出现一个同名结果，也不能直接选中。
  if (result.has_more) {
    throw new CliError("incomplete", "More search results are available; title uniqueness cannot be confirmed, so no document was read", hint, result)
  }
  const matches = [...new Map(result.items.filter(item => item.title.trim() === name.trim())
    .map(item => [`${item.type}:${item.token}`, item])).values()]
  if (matches.length === 0) throw new CliError("not_found", "No exact title match was found; no document was read", hint, result)
  if (matches.length > 1) throw new CliError("ambiguous", "Multiple documents have the same title; none was selected automatically", hint, result)
  const match = matches[0]!
  if (!match.document_id) {
    throw new CliError("unsupported", "The matching resource is not a confirmed docx document; its content cannot be read by docs read", hint, result)
  }
  return { ...match, document_id: match.document_id }
}

function parseItem(value: unknown): SearchItem {
  if (!isRecord(value) || !str(value.docs_token) || !str(value.docs_type) || typeof value.title !== "string") throw invalidResponse()
  const token = value.docs_token as string
  const type = value.docs_type as string
  return {
    token, type, title: value.title,
    ...(str(value.owner_id) ? { owner_id: value.owner_id as string } : {}),
    ...(type === "docx" ? { document_id: token } : {}),
    ...(type === "bitable" ? { app_token: token } : {}),
    ...(type === "sheet" ? { spreadsheet_token: token } : {}),
    ...(type === "file" ? { file_token: token } : {}),
  }
}

export function searchItemUrl(webBaseUrl: string, item: SearchItem): string | undefined {
  return item.type === "docx" ? documentUrl(webBaseUrl, item.token) : undefined
}

export function documentUrl(webBaseUrl: string, documentId: string): string | undefined {
  if (!webBaseUrl) return undefined
  return `${webBaseUrl.replace(/\/+$/, "")}/docx/${encodeURIComponent(documentId)}`
}

function invalidResponse(): CliError {
  return new CliError("api", "The search response has invalid candidates or pagination; it was not treated as an empty result", "Ask the maintainer to verify the search response for this Kunlun version; do not guess resource types or expand authorization.")
}
