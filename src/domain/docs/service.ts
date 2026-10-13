import type { CallRequest, OpenApi } from "../../client/http.ts"
import { CliError } from "../../errors.ts"
import { isRecord, str } from "../../json.ts"
import { blocksToMarkdown, chunk, contentToBlocks, type DocBlock } from "./blocks.ts"

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
  if (!documentId) throw new CliError("api", "创建文档成功但响应里没有 document_id", undefined, { upstream: created })
  const blocks = contentToBlocks(input.content)
  if (blocks.length > 0) {
    try {
      await appendBlocks(api, token, documentId, blocks)
    } catch (err) {
      if (err instanceof CliError) {
        throw new CliError(err.type, `文档已创建，但写入正文失败：${err.message}`, err.hint, {
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
  if (blocks.length === 0) throw new CliError("usage", "没有可写入的正文")
  await appendBlocks(api, token, documentId, blocks)
  return blocks.length
}

export async function readDocument(api: OpenApi, token: string, documentId: string): Promise<{ markdown: string; blockCount: number }> {
  const items: unknown[] = []
  let pageToken = ""
  for (let page = 0; page < 20; page++) {
    const query: Record<string, string> = { page_size: "500" }
    if (pageToken) query.page_token = pageToken
    const body = await api.call({
      method: "GET",
      path: `/open-apis/docx/v1/documents/${encodeURIComponent(documentId)}/blocks`,
      token,
      query,
    })
    const data = isRecord(body) && isRecord(body.data) ? body.data : {}
    if (Array.isArray(data.items)) items.push(...data.items)
    if (data.has_more !== true || !str(data.page_token)) break
    pageToken = str(data.page_token) ?? ""
  }
  return { markdown: blocksToMarkdown(items), blockCount: items.length }
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
