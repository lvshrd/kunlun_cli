import { isRecord, str } from "../../json.ts"

export interface ReadDiagnostic {
  block_index: number
  block_id?: string
  block_type?: number
  element_index?: number
  element_type?: string
  reason: "unsupported_block" | "invalid_block" | "invalid_elements" | "unsupported_element" | "invalid_text" | "missing_child"
}

export interface BlockSummary {
  index: number
  block_id?: string
  block_type?: number
  parent_id?: string
  children: string[]
}

export interface EmbeddedResource {
  kind: "sheets" | "bitable" | "board" | "docx_table"
  block_id?: string
  token?: string
  spreadsheet_token?: string
  sheet_id?: string
  app_token?: string
  table_id?: string
  whiteboard_id?: string
}

function resourceOf(block: Record<string, unknown>): EmbeddedResource | undefined {
  const kind = block.block_type === 30 ? "sheets" : block.block_type === 18 ? "bitable" : block.block_type === 43 ? "board" : block.block_type === 31 ? "docx_table" : undefined
  if (!kind) return
  const body = block[kind === "sheets" ? "sheet" : kind === "docx_table" ? "table" : kind]
  const token = isRecord(body) ? str(body.token) : undefined
  const resource: EmbeddedResource = { kind, block_id: str(block.block_id), ...(token ? { token } : {}) }
  if (token && (kind === "sheets" || kind === "bitable")) {
    const index = token.lastIndexOf("_")
    if (index > 0 && index < token.length - 1 && /^[A-Za-z0-9_-]+$/.test(token)) {
      if (kind === "sheets") Object.assign(resource, { spreadsheet_token: token.slice(0, index), sheet_id: token.slice(index + 1) })
      else Object.assign(resource, { app_token: token.slice(0, index), table_id: token.slice(index + 1) })
    }
  }
  if (kind === "board" && token) resource.whiteboard_id = token
  return resource
}

// This is a text extraction contract, not a lossless rich-text export.
const fields = ["page", "text", "heading1", "heading2", "heading3"] as const
const prefixes = ["# ", "", "# ", "## ", "### "]

export function inspectBlocks(items: unknown[]): { markdown: string; diagnostics: ReadDiagnostic[]; blocks: BlockSummary[]; resources: EmbeddedResource[] } {
  const lines: string[] = []
  const diagnostics: ReadDiagnostic[] = []
  const blocks: BlockSummary[] = []
  const resources: EmbeddedResource[] = []
  for (const [index, item] of items.entries()) {
    const block = isRecord(item) ? item : {}
    const summary: BlockSummary = {
      index,
      ...(str(block.block_id) ? { block_id: str(block.block_id) } : {}),
      ...(typeof block.block_type === "number" ? { block_type: block.block_type } : {}),
      ...(str(block.parent_id) ? { parent_id: str(block.parent_id) } : {}),
      children: Array.isArray(block.children) ? block.children.filter((id): id is string => typeof id === "string") : [],
    }
    blocks.push(summary)
    const resource = resourceOf(block)
    if (resource) resources.push(resource)
    const report = (detail: Omit<ReadDiagnostic, "block_index" | "block_id" | "block_type">) => {
      diagnostics.push({ block_index: index, block_id: summary.block_id, block_type: summary.block_type, ...detail })
    }
    if (!isRecord(item)) { report({ reason: "invalid_block" }); continue }
    // Older test/API responses can omit block_type; never infer a known type
    // when the platform explicitly declares an unsupported block type.
    const fieldIndex = block.block_type === undefined
      ? fields.findIndex((field) => Object.hasOwn(block, field))
      : typeof block.block_type === "number" && block.block_type >= 1 && block.block_type <= 5 && Number.isInteger(block.block_type)
        ? block.block_type - 1 : -1
    if (fieldIndex === -1) { report({ reason: "unsupported_block" }); continue }
    const body = block[fields[fieldIndex]!]
    if (!isRecord(body) || !Array.isArray(body.elements)) { report({ reason: "invalid_elements" }); continue }
    const text: string[] = []
    for (const [elementIndex, element] of body.elements.entries()) {
      if (!isRecord(element) || Object.keys(element).length === 0) {
        report({ reason: "unsupported_element", element_index: elementIndex, element_type: "unknown" })
        continue
      }
      for (const key of Object.keys(element)) {
        if (key !== "text_run") report({ reason: "unsupported_element", element_index: elementIndex, element_type: key })
      }
      if (Object.hasOwn(element, "text_run")) {
        const run = element.text_run
        if (!isRecord(run) || typeof run.content !== "string") report({ reason: "invalid_text", element_index: elementIndex, element_type: "text_run" })
        else text.push(run.content)
      }
    }
    const content = text.join("")
    if (content) lines.push(prefixes[fieldIndex] + content)
  }
  const ids = new Set(blocks.map((block) => block.block_id).filter(Boolean))
  for (const block of blocks) {
    if (block.children.some((id) => !ids.has(id))) diagnostics.push({
      block_index: block.index, block_id: block.block_id, block_type: block.block_type, reason: "missing_child",
    })
  }
  return { markdown: lines.join("\n"), diagnostics, blocks, resources }
}
