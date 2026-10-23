import type { OpenApi } from "../../client/http.ts"
import { CliError } from "../../errors.ts"
import { isRecord, str } from "../../json.ts"

export async function editDocument(
  api: OpenApi, token: string, documentId: string,
  input: { find: string; replacement: string; dryRun?: boolean; revision?: number },
): Promise<{ document_id: string; block_id: string; revision: number; before: string; after: string; dry_run: boolean }> {
  if (!input.find || !input.replacement || input.find === input.replacement) throw new CliError("usage", "查找和替换文本不能为空或相同")
  const base = `/open-apis/docx/v1/documents/${encodeURIComponent(documentId)}`
  const meta = await api.call({ method: "GET", path: base, token })
  const data = isRecord(meta) && isRecord(meta.data) ? meta.data : {}
  const doc = isRecord(data.document) ? data.document : {}
  const revision = doc.revision_id
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) throw new CliError("api", "无法获取文档版本，停止修改")
  if (input.revision !== undefined && input.revision !== revision) throw new CliError("conflict", "文档版本已变化，请重新预览修改")
  const matches: Array<{ id: string; before: string; run: Record<string, unknown>; element: Record<string, unknown> }> = []
  let pageToken = ""
  for (let page = 0; page < 20; page++) {
    const result = await api.call({ method: "GET", path: `${base}/blocks`, token, query: {
      document_revision_id: String(revision), page_size: "500", ...(pageToken ? { page_token: pageToken } : {}),
    } })
    const pageData = isRecord(result) && isRecord(result.data) ? result.data : {}
    for (const block of Array.isArray(pageData.items) ? pageData.items : []) {
      if (!isRecord(block) || !str(block.block_id)) continue
      for (const field of ["text", "heading1", "heading2", "heading3"]) {
        const body = block[field]
        if (!isRecord(body) || !Array.isArray(body.elements)) continue
        // 不重建复杂富文本，避免丢失提及、多个样式段或其他非文本内容。
        if (body.elements.length !== 1 || !isRecord(body.elements[0]) || !isRecord(body.elements[0].text_run)) continue
        const element = body.elements[0]
        const run = element.text_run as Record<string, unknown>
        const before = str(run.content)
        if (!before?.includes(input.find)) continue
        const occurrences = before.split(input.find).length - 1
        for (let i = 0; i < occurrences; i++) matches.push({ id: block.block_id as string, before, run, element })
      }
    }
    if (pageData.has_more !== true) break
    pageToken = str(pageData.page_token) ?? ""
    if (!pageToken || page === 19) throw new CliError("api", "文档未完整读取，停止修改", "缩小文档范围或使用块级接口")
  }
  if (matches.length !== 1) throw new CliError("usage", `匹配到 ${matches.length} 处可编辑文本，必须唯一匹配`, "提供更完整的原段落；复杂富文本暂不支持此编辑命令")
  const match = matches[0]!
  const after = match.before.replace(input.find, () => input.replacement)
  if (!input.dryRun) {
    await api.call({ method: "PATCH", path: `${base}/blocks/batch_update`, token,
      query: { document_revision_id: String(revision) },
      body: { requests: [{ block_id: match.id, update_text_elements: {
        elements: [{ ...match.element, text_run: { ...match.run, content: after } }],
      } }] },
    })
  }
  return { document_id: documentId, block_id: match.id, revision, before: match.before, after, dry_run: Boolean(input.dryRun) }
}
