import type { CallRequest, OpenApi } from "../../client/http.ts"
import { CliError } from "../../errors.ts"
import { isRecord, str } from "../../json.ts"
import { chunk, contentToBlocks, type DocBlock } from "./blocks.ts"
import { inspectBlocks } from "./read.ts"

const batchSize = 50

export interface CreatedDocument {
  documentId: string
  title: string
  blockCount: number
}

export async function createDocument(
  api: OpenApi,
  token: string,
  input: { title: string; content: string; folderToken?: string },
): Promise<CreatedDocument> {
  const body: Record<string, string> = { title: input.title }
  if (input.folderToken) body.folder_token = input.folderToken
  const created = await api.call({
    method: "POST",
    path: "/open-apis/docx/v1/documents",
    token,
    body,
  })
  const documentId = documentIdOf(created)
  if (!documentId) throw new CliError("api", "The document was created, but the response is missing document_id", undefined, { upstream: created })
  const blocks = contentToBlocks(input.content)
  if (blocks.length > 0) {
    try {
      await appendBlocks(api, token, documentId, blocks)
    } catch (err) {
      if (err instanceof CliError) {
        throw new CliError(err.type, `The document was created, but writing its content failed: ${err.message}`, err.hint, {
          ...(isRecord(err.data) ? err.data : {}),
          document_id: documentId,
        })
      }
      throw err
    }
  }
  return { documentId, title: input.title, blockCount: blocks.length }
}

export async function appendDocument(api: OpenApi, token: string, documentId: string, content: string): Promise<number> {
  const blocks = contentToBlocks(content)
  if (blocks.length === 0) throw new CliError("usage", "No document content to write")
  await appendBlocks(api, token, documentId, blocks)
  return blocks.length
}

export async function readDocument(api: OpenApi, token: string, documentId: string, options: { raw?: boolean } = {}) {
  const base = `/open-apis/docx/v1/documents/${encodeURIComponent(documentId)}`
  const meta = await api.call({ method: "GET", path: base, token })
  const metaData = isRecord(meta) && isRecord(meta.data) ? meta.data : {}
  const document = isRecord(metaData.document) ? metaData.document : {}
  const revision = document.revision_id
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
    throw new CliError("api", "Cannot determine the document revision; reading was stopped", "Verify that the API returns a valid revision_id before retrying")
  }
  const items: unknown[] = []
  let pageToken = ""
  let pagesRead = 0
  const seen = new Set<string>()
  const result = (paginationComplete: boolean) => {
    const converted = inspectBlocks(items)
    return {
      markdown: converted.markdown, blockCount: items.length, revision,
      pagination_complete: paginationComplete, content_complete: converted.diagnostics.length === 0,
      complete: paginationComplete && converted.diagnostics.length === 0,
      pages_read: pagesRead, diagnostics: converted.diagnostics, blocks: converted.blocks,
      ...(options.raw ? { raw_blocks: items } : {}),
    }
  }
  const incomplete = (reason: string, cause?: unknown) => {
    const { blockCount, ...partial } = result(false)
    return new CliError("incomplete", "The document was not fully read; do not treat the result as the full document",
      cause instanceof CliError && cause.hint ? cause.hint : "Use only the returned partial content. Do not delete or rebuild the document, or assume that missing content does not exist.", {
        ...partial, block_count: blockCount, document_id: documentId, reason,
        ...(cause instanceof CliError ? { cause: { type: cause.type, message: cause.message } } : {}),
      })
  }
  for (let page = 0; page < 20; page++) {
    const query: Record<string, string> = { page_size: "500", document_revision_id: String(revision) }
    if (pageToken) query.page_token = pageToken
    let body: unknown
    try {
      body = await api.call({ method: "GET", path: `${base}/blocks`, token, query })
    } catch (err) {
      if (pagesRead === 0) throw err
      throw incomplete("request_failed", err)
    }
    const data = isRecord(body) && isRecord(body.data) ? body.data : {}
    if (!Array.isArray(data.items) || typeof data.has_more !== "boolean") throw incomplete("invalid_page")
    items.push(...data.items)
    pagesRead++
    if (!data.has_more) return result(true)
    const next = str(data.page_token)?.trim()
    if (!next) throw incomplete("missing_page_token")
    if (seen.has(next)) throw incomplete("repeated_page_token")
    seen.add(next)
    pageToken = next
  }
  throw incomplete("page_limit")
}

async function appendBlocks(api: OpenApi, token: string, documentId: string, blocks: DocBlock[]): Promise<void> {
  let index = await childCount(api, token, documentId)
  for (const batch of chunk(blocks, batchSize)) {
    const request: CallRequest = {
      method: "POST",
      path: `/open-apis/docx/v1/documents/${encodeURIComponent(documentId)}/blocks/${encodeURIComponent(documentId)}/children`,
      token,
      query: { document_revision_id: "-1" },
      body: { children: batch, index },
    }
    await api.call(request)
    index += batch.length
  }
}

async function childCount(api: OpenApi, token: string, documentId: string): Promise<number> {
  const body = await api.call({
    method: "GET",
    path: `/open-apis/docx/v1/documents/${encodeURIComponent(documentId)}/blocks/${encodeURIComponent(documentId)}`,
    token,
  })
  const data = isRecord(body) && isRecord(body.data) ? body.data : {}
  const block = isRecord(data.block) ? data.block : {}
  return Array.isArray(block.children) ? block.children.length : 0
}

export function documentIdOf(body: unknown): string | undefined {
  const root = isRecord(body) ? body : {}
  const data = isRecord(root.data) ? root.data : root
  const document = isRecord(data.document) ? data.document : {}
  return str(document.document_id) || str(data.document_id)
}

export function documentIdFromInput(input: string): string {
  const trimmed = input.trim()
  try {
    const url = new URL(trimmed)
    const parts = url.pathname.split("/").filter(Boolean)
    const marker = parts.indexOf("docx")
    if (marker >= 0 && parts[marker + 1]) return parts[marker + 1] ?? trimmed
    return parts[parts.length - 1] || trimmed
  } catch {
    return trimmed
  }
}
