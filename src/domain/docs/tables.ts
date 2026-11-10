import { randomUUID } from "node:crypto"
import type { OpenApi } from "../../client/http.ts"
import { CliError } from "../../errors.ts"
import { isRecord, str } from "../../json.ts"
import { dataOf, identifier, objectOf, resourceToken, writeFailure } from "../table-common.ts"
import { readRange } from "../sheets/service.ts"
import { baseInfo, listFields, validateClientToken } from "../bitable/service.ts"
import { readDocument } from "./service.ts"

export type TableKind = "native" | "sheet" | "bitable"
export interface CreateTableInput { type: TableKind; rows?: number; columns?: number; values?: unknown; title?: string; clientToken?: string; dryRun?: boolean }

export function nativeValues(value: unknown): string[][] {
  if (!Array.isArray(value) || !value.length || value.length > 9 || !Array.isArray(value[0]) || !value[0].length || value[0].length > 9) throw new CliError("usage", "Native table values must be a nonempty rectangular matrix, at most 9 rows by 9 columns")
  const columns = value[0].length
  return value.map(row => {
    if (!Array.isArray(row) || row.length !== columns) throw new CliError("usage", "Native table values must be rectangular")
    return row.map(cell => {
      if (!(cell === null || typeof cell === "boolean" || (typeof cell === "number" && Number.isFinite(cell)) || (typeof cell === "string" && cell.length <= 10000))) throw new CliError("usage", "Native table cells must be plain strings (at most 10000 characters), finite numbers, booleans, or null")
      return cell === null ? "" : String(cell)
    })
  })
}

export function nativeWriteValues(value: unknown): string[][] {
  const values = nativeValues(value)
  if (values.length * values[0]!.length > 50) throw new CliError("usage", "Native writes support at most 50 cells per request")
  return values
}

export function planTable(input: CreateTableInput) {
  if (!["native", "sheet", "bitable"].includes(input.type)) throw new CliError("usage", "--type must be native, sheet, or bitable")
  if (input.title !== undefined && (!input.title.trim() || input.title.length > 200)) throw new CliError("usage", "--title must contain 1 to 200 characters")
  if (input.clientToken !== undefined) validateClientToken(input.clientToken)
  if (input.type === "bitable") {
    if (input.rows !== undefined || input.columns !== undefined || input.values !== undefined) throw new CliError("usage", "Base creation does not accept rows, columns or values; use bitable fields/records commands after creation")
    return { type: input.type, rows: undefined, columns: undefined, values: undefined, title: input.title }
  }
  if (input.type !== "native" && input.values !== undefined) throw new CliError("usage", "Initial values are only accepted for native tables; fill a new sheet with sheets write using the returned IDs")
  const values = input.values === undefined ? undefined : nativeValues(input.values)
  const rows = input.rows ?? values?.length ?? 2, columns = input.columns ?? values?.[0]?.length ?? 2
  if (![rows, columns].every(n => Number.isSafeInteger(n) && n >= 1 && n <= 9)) throw new CliError("usage", "New embedded tables support 1 to 9 initial rows and columns")
  if (values && (values.length !== rows || values[0]!.length !== columns)) throw new CliError("usage", "Initial values must match --rows and --columns")
  return { type: input.type, rows, columns, values: input.type === "native" ? values ?? Array.from({ length: rows }, () => Array<string>(columns).fill("")) : undefined, title: input.title }
}

const text = (content: string) => ({ elements: [{ text_run: { content } }] })

export async function createTable(api: OpenApi, token: string, document: string, input: CreateTableInput) {
  const id = resourceToken(document, "docx"), plan = planTable(input), clientToken = input.clientToken ?? randomUUID()
  const target = { document_id: id, type: plan.type, client_token: clientToken }
  if (input.dryRun) return { ...target, dry_run: true, ...plan, required_scope: "docx:document", permission_check: "pending", next: plan.type === "sheet" ? "Use sheets write with the returned spreadsheet_token and sheet_id" : plan.type === "bitable" ? "Use bitable fields/records with the returned app_token and table_id" : "Plain text values will be created in native DocX cells" }
  const before = await readDocument(api, token, id)
  const root = `/open-apis/docx/v1/documents/${encodeURIComponent(id)}/blocks/${encodeURIComponent(id)}`
  let body: Record<string, unknown>
  if (plan.type === "native") {
    const cells = plan.values!.flatMap((row, r) => row.map((value, c) => ({ value, cell: `cell_${r}_${c}`, paragraph: `text_${r}_${c}` })))
    const descendants: Record<string, unknown>[] = [
      ...(plan.title ? [{ block_id: "heading", block_type: 4, heading2: text(plan.title), children: [] }] : []),
      { block_id: "table", block_type: 31, table: { property: { row_size: plan.rows, column_size: plan.columns } }, children: cells.map(c => c.cell) },
      ...cells.flatMap(c => [{ block_id: c.cell, block_type: 32, table_cell: {}, children: [c.paragraph] }, { block_id: c.paragraph, block_type: 2, text: text(c.value), children: [] }]),
    ]
    body = { index: -1, children_id: [...(plan.title ? ["heading"] : []), "table"], descendants }
  } else {
    body = { index: -1, children: [
      ...(plan.title ? [{ block_type: 4, heading2: text(plan.title) }] : []),
      plan.type === "sheet" ? { block_type: 30, sheet: { row_size: plan.rows, column_size: plan.columns } } : { block_type: 18, bitable: { view_type: 1 } },
    ] }
  }
  let result: Record<string, unknown>
  try { result = dataOf(await api.call({ method: "POST", path: `${root}/${plan.type === "native" ? "descendant" : "children"}`, token,
    query: { document_revision_id: String(before.revision), client_token: clientToken }, body })) }
  catch (err) { return writeFailure(err, target, "write") }
  let blockId: string | undefined
  try {
    const blockType = plan.type === "native" ? 31 : plan.type === "sheet" ? 30 : 18
    const created = Array.isArray(result.children) ? result.children.filter(b => isRecord(b) && b.block_type === blockType) : []
    if (created.length !== 1 || !isRecord(created[0]) || !str(created[0].block_id)) throw new CliError("api", "The creation response is missing the created table block")
    blockId = identifier(String(created[0].block_id), "block ID")
    const after = await readDocument(api, token, id)
    const resource = after.resources.find(r => r.block_id === blockId)
    if (!resource) throw new CliError("verification", "The created resource is not present in the document")
    if (plan.type === "native") {
      const readBack = await readNativeTable(api, token, id, blockId)
      if (JSON.stringify(readBack.values) !== JSON.stringify(plan.values)) throw new CliError("verification", "Native table values did not match the input")
      return { ...target, block_id: blockId, dry_run: false, creation_verified: true, verified: true, content_initialized: true, verification_scope: "native_cell_text", concurrency_protected: false, read_back: readBack }
    }
    if (plan.type === "sheet") {
      if (!resource.spreadsheet_token || !resource.sheet_id) throw new CliError("api", "The created sheet is missing its spreadsheet token or sheet ID")
      await readRange(api, token, resource.spreadsheet_token, `${resource.sheet_id}!A1:A1`)
      return { ...target, ...resource, dry_run: false, creation_verified: true, content_initialized: false, verification_scope: "embedded_resource_and_metadata", next: "Use sheets write --spreadsheet <spreadsheet_token> --range <sheet_id>!A1:B2 --file values.json" }
    }
    if (!resource.app_token || !resource.table_id) throw new CliError("api", "The created Base is missing its app token or table ID")
    const info = await baseInfo(api, token, resource.app_token)
    const fields = await listFields(api, token, resource.app_token, resource.table_id, { all: true })
    return { ...target, ...resource, dry_run: false, creation_verified: true, content_initialized: false, verification_scope: "embedded_resource_and_metadata", app: info, fields: fields.items, next: "Use bitable fields/records --app <app_token> --table <table_id> to initialize content" }
  } catch (err) { return writeFailure(err, { ...target, block_id: blockId, result }, "verify") }
}

async function nativeSnapshot(api: OpenApi, token: string, document: string, tableId: string) {
  const id = resourceToken(document, "docx"), blockId = identifier(tableId, "table block ID")
  const doc = await readDocument(api, token, id, { raw: true })
  const blocks = new Map(doc.raw_blocks!.filter(isRecord).map(b => [str(b.block_id), b]))
  const table = blocks.get(blockId)
  if (!table || table.block_type !== 31) throw new CliError("unsupported", "The block is not a native DocX table; use sheets/bitable for embedded resources")
  const body = objectOf(table.table, "native table"), property = objectOf(body.property, "table property")
  const rows = Number(property.row_size), columns = Number(property.column_size)
  if (![rows, columns].every(n => Number.isSafeInteger(n) && n > 0) || rows * columns > 81 || !Array.isArray(body.cells) || body.cells.length !== rows * columns) throw new CliError("unsupported", "This command supports complete native tables with at most 81 unmerged cells")
  if (Array.isArray(property.merge_info) && property.merge_info.some(m => !isRecord(m) || m.row_span !== 1 || m.col_span !== 1)) throw new CliError("unsupported", "Merged native tables are not supported")
  const cells = body.cells.map(cellId => {
    const cell = blocks.get(String(cellId))
    if (!cell || cell.block_type !== 32 || !Array.isArray(cell.children) || cell.children.length !== 1) throw new CliError("unsupported", "Each native cell must contain exactly one plain paragraph")
    const paragraph = blocks.get(String(cell.children[0]))
    const paragraphBody = paragraph?.text
    if (!paragraph || paragraph.block_type !== 2 || !isRecord(paragraphBody) || !Array.isArray(paragraphBody.elements) || paragraphBody.elements.some(e => !isRecord(e) || Object.keys(e).some(k => k !== "text_run") || !isRecord(e.text_run) || typeof e.text_run.content !== "string") || (Array.isArray(paragraph.children) && paragraph.children.length)) throw new CliError("unsupported", "Rich or nested native cell content is not supported")
    return { cell_id: String(cellId), paragraph_id: identifier(String(paragraph.block_id), "paragraph block ID"), paragraph, value: paragraphBody.elements.map(e => e.text_run.content).join("") }
  })
  return { document_id: id, block_id: blockId, revision: doc.revision, rows, columns, cells }
}

export async function readNativeTable(api: OpenApi, token: string, document: string, tableId: string) {
  const snapshot = await nativeSnapshot(api, token, document, tableId)
  return { document_id: snapshot.document_id, block_id: snapshot.block_id, revision: snapshot.revision, rows: snapshot.rows, columns: snapshot.columns,
    values: Array.from({ length: snapshot.rows }, (_, r) => snapshot.cells.slice(r * snapshot.columns, (r + 1) * snapshot.columns).map(c => c.value)), complete: true, completeness_scope: "native_cell_text" }
}

export async function writeNativeTable(api: OpenApi, token: string, document: string, tableId: string, raw: unknown, options: { dryRun?: boolean; revision?: number } = {}) {
  const id = resourceToken(document, "docx"), blockId = identifier(tableId, "table block ID"), values = nativeWriteValues(raw)
  const target = { document_id: id, block_id: blockId }
  if (options.revision !== undefined && (!Number.isSafeInteger(options.revision) || options.revision < 0)) throw new CliError("usage", "--revision must be a nonnegative integer")
  if (options.dryRun) return { ...target, dry_run: true, values, permission_check: "pending", resource_check: "pending", required_scope: "docx:document" }
  const snapshot = await nativeSnapshot(api, token, id, blockId)
  if (values.length !== snapshot.rows || values[0]!.length !== snapshot.columns) throw new CliError("usage", "Native values must match the existing table dimensions")
  if (options.revision !== undefined && snapshot.revision !== options.revision) throw new CliError("conflict", "The document revision changed; read the table again before writing")
  const flat = values.flat()
  const requests = snapshot.cells.map((cell, i) => {
    const elements = (cell.paragraph.text as { elements: Record<string, unknown>[] }).elements
    if (elements.length > 1) throw new CliError("unsupported", "Native writes require at most one text run per cell; no cells were changed")
    const element = elements[0]
    return { block_id: cell.paragraph_id, update_text_elements: element ? { elements: [{ ...element, text_run: { ...element.text_run as object, content: flat[i]! } }] } : text(flat[i]!) }
  })
  if (requests.length > 50) throw new CliError("unsupported", "Native writes support at most 50 cells per request; no cells were changed")
  let result: unknown
  try { result = await api.call({ method: "PATCH", path: `/open-apis/docx/v1/documents/${encodeURIComponent(id)}/blocks/batch_update`, token, query: { document_revision_id: String(snapshot.revision) }, body: { requests } }) }
  catch (err) { return writeFailure(err, target, "write") }
  try {
    const readBack = await readNativeTable(api, token, id, blockId)
    if (JSON.stringify(readBack.values) !== JSON.stringify(values)) throw new CliError("verification", "Native table read-back differs from the requested values")
    return { ...target, dry_run: false, verified: true, verification_scope: "native_cell_text", concurrency_protected: false, before: snapshot.cells.map(c => c.value), result, read_back: readBack }
  } catch (err) { return writeFailure(err, { ...target, result }, "verify") }
}
