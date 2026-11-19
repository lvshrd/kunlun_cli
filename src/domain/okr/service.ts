import type { OpenApi } from "../../client/http.ts"
import { CliError } from "../../errors.ts"
import { isRecord } from "../../json.ts"
import { dataOf, identifier, readPages, type PageOptions } from "../table-common.ts"

const root = "/open-apis/okr/v1"

export async function listPeriods(api: OpenApi, token: string, page: PageOptions) {
  return readPages(query => api.call({ method: "GET", path: `${root}/periods`, token, query }), { pageSize: 10, ...page }, 100)
}

export interface OkrPageOptions { offset?: number; limit?: number; all?: boolean }

export function validateOkrPage({ offset = 0, limit = 10, all = false }: OkrPageOptions) {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new CliError("usage", "--offset must be a nonnegative integer")
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) throw new CliError("usage", "--limit must be an integer from 1 to 10")
  if (all && offset !== 0) throw new CliError("usage", "--all must start at offset 0")
  return { offset, limit, all }
}

export async function listOwnOkrs(api: OpenApi, token: string, userId: string, options: OkrPageOptions = {}) {
  const { offset, limit, all } = validateOkrPage(options)
  const path = `${root}/users/${encodeURIComponent(identifier(userId, "user open ID"))}/okrs`
  const items: Record<string, unknown>[] = []
  let cursor = offset
  let total: number | undefined
  for (let page = 0; page < 50; page++) {
    const data = dataOf(await api.call({ method: "GET", path, token, query: { user_id_type: "open_id", offset: String(cursor), limit: String(limit) } }))
    const reportedTotal = data.total
    if (typeof reportedTotal !== "number" || !Number.isSafeInteger(reportedTotal) || reportedTotal < 0) {
      throw new CliError("api", "The OKR list response is missing a valid total")
    }
    const batch = data.okr_list ?? (cursor >= reportedTotal ? [] : undefined)
    if (!Array.isArray(batch) || !batch.every(isRecord) || batch.length > Math.min(limit, Math.max(reportedTotal - cursor, 0))) {
      throw new CliError("api", "The OKR list response has an invalid page")
    }
    if ((total !== undefined && total !== reportedTotal) || (!batch.length && cursor < reportedTotal)) {
      throw new CliError("incomplete", "The OKR list changed or stopped before all pages were read", "Run the read again to confirm your OKRs.")
    }
    total = reportedTotal
    items.push(...batch)
    cursor += batch.length
    const hasMore = cursor < total
    if (!all || !hasMore) return { items, total, has_more: hasMore, next_offset: hasMore ? cursor : null, complete: offset === 0 && !hasMore }
  }
  throw new CliError("incomplete", "The OKR list exceeded the page limit")
}
