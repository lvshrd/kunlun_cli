import type { OpenApi } from "../../client/http.ts"
import { CliError } from "../../errors.ts"
import { isRecord, str } from "../../json.ts"
import { dataOf, identifier, objectOf, resourceToken, writeFailure } from "../table-common.ts"

export function parseRange(input: string) {
  const m = /^([A-Za-z0-9_-]+)!([A-Za-z]+)([1-9]\d*)(?::([A-Za-z]+)([1-9]\d*))?$/.exec(input)
  if (!m) throw new CliError("usage", "Use a bounded A1 range: <sheet-id>!A1:B2")
  const col = (s: string) => [...s.toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0)
  const startCol = col(m[2]!), endCol = col(m[4] ?? m[2]!)
  const startRow = Number(m[3]), endRow = Number(m[5] ?? m[3])
  if (![startCol, endCol, startRow, endRow].every(Number.isSafeInteger) || endCol < startCol || endRow < startRow || endCol - startCol >= 100 || endRow - startRow >= 5000) {
    throw new CliError("usage", "Ranges must be forward, bounded, and no larger than 5000 rows by 100 columns")
  }
  return { sheet: m[1]!, range: `${m[1]}!${m[2]!.toUpperCase()}${startRow}:${(m[4] ?? m[2])!.toUpperCase()}${endRow}`, rows: endRow - startRow + 1, columns: endCol - startCol + 1 }
}

export type SheetCell = string | number | boolean | null | { type: "formula"; text: string }

export function validateValues(value: unknown): SheetCell[][] {
  if (!Array.isArray(value) || !value.length || value.length > 5000 || !Array.isArray(value[0]) || !value[0].length || value[0].length > 100) throw new CliError("usage", "values must be a nonempty rectangular matrix, at most 5000 rows by 100 columns")
  const width = value[0].length
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== width) throw new CliError("usage", "values must be rectangular")
    for (const cell of row) {
      const formula = isRecord(cell) && cell.type === "formula" && typeof cell.text === "string" && cell.text.startsWith("=") && cell.text.length <= 50000 && Object.keys(cell).every(k => k === "type" || k === "text")
      if (!(formula || cell === null || typeof cell === "boolean" || (typeof cell === "number" && Number.isFinite(cell)) || (typeof cell === "string" && cell.length <= 50000))) throw new CliError("usage", "Cells must be strings (at most 50000 characters), finite numbers, booleans, null, or {type:formula,text:=...}; other rich cells require a future adapter")
    }
  }
  return value
}

function base(input: string) { return `/open-apis/sheets/v3/spreadsheets/${encodeURIComponent(resourceToken(input, "sheets"))}` }

export async function spreadsheetInfo(api: OpenApi, token: string, input: string) {
  return objectOf(dataOf(await api.call({ method: "GET", path: base(input), token })).spreadsheet, "spreadsheet")
}

export async function listSheets(api: OpenApi, token: string, input: string) {
  const data = dataOf(await api.call({ method: "GET", path: `${base(input)}/sheets/query`, token }))
  if (!Array.isArray(data.sheets) || data.sheets.some(s => !isRecord(s) || !str(s.sheet_id) || !str(s.resource_type))) throw new CliError("api", "Invalid sheet metadata response")
  return { sheets: data.sheets }
}

async function requireGrid(api: OpenApi, token: string, input: string, sheet: string) {
  const data = dataOf(await api.call({ method: "GET", path: `${base(input)}/sheets/${encodeURIComponent(identifier(sheet, "sheet ID"))}`, token }))
  const meta = objectOf(data.sheet, "sheet")
  if (meta.resource_type !== "sheet") throw new CliError("unsupported", "This worksheet is not a supported sheet grid", "Inspect resource_type. Use the bitable adapter for confirmed Base resources; do not guess token conversions.", { sheet: meta })
  return meta
}

async function valuesOf(api: OpenApi, token: string, spreadsheet: string, range: string) {
  const data = dataOf(await api.call({ method: "GET", path: `/open-apis/sheets/v2/spreadsheets/${encodeURIComponent(spreadsheet)}/values/${encodeURIComponent(range)}`, token,
    query: { valueRenderOption: "Formula", user_id_type: "open_id" } }))
  const valueRange = objectOf(data.valueRange, "valueRange")
  if (valueRange.range === "" && valueRange.values === undefined) valueRange.values = []
  if (!Array.isArray(valueRange.values) || valueRange.values.some(row => !Array.isArray(row)) || typeof valueRange.range !== "string") throw new CliError("api", "Invalid range response")
  return { spreadsheet_token: spreadsheet, revision: data.revision ?? valueRange.revision, range: valueRange.range, values: valueRange.values as unknown[][] }
}

export async function readRange(api: OpenApi, token: string, input: string, range: string) {
  const spreadsheet = resourceToken(input, "sheets"), parsed = parseRange(range)
  await requireGrid(api, token, spreadsheet, parsed.sheet)
  return { ...await valuesOf(api, token, spreadsheet, parsed.range), requested_range: parsed.range, value_render_option: "Formula", complete: true, completeness_scope: "requested_range" }
}

export async function writeRange(api: OpenApi, token: string, input: string, range: string, raw: unknown, action: "write" | "append", dryRun = false) {
  const spreadsheet = resourceToken(input, "sheets"), parsed = parseRange(range), values = validateValues(raw)
  if (values.length > parsed.rows || values[0]!.length !== parsed.columns || (action === "write" && values.length !== parsed.rows)) throw new CliError("usage", "Matrix dimensions must match the write range; append permits fewer rows within the bounded range")
  const request = { method: action === "write" ? "PUT" : "POST", path: `/open-apis/sheets/v2/spreadsheets/${encodeURIComponent(spreadsheet)}/${action === "write" ? "values" : "values_append"}`, token,
    ...(action === "append" ? { query: { insertDataOption: "INSERT_ROWS" } } : {}), body: { valueRange: { range: parsed.range, values } } }
  const target = { spreadsheet_token: spreadsheet, range: parsed.range, action }
  if (dryRun) return { ...target, dry_run: true, values, resource_type_check: "pending", permission_check: "pending", required_scope: "sheets:spreadsheet" }
  await requireGrid(api, token, spreadsheet, parsed.sheet)
  const before = action === "write" ? await valuesOf(api, token, spreadsheet, parsed.range) : undefined
  let written: Record<string, unknown>
  try { written = dataOf(await api.call(request)) } catch (err) { return writeFailure(err, target, "write") }
  let verified: Awaited<ReturnType<typeof valuesOf>>
  try {
    const actualRange = action === "append" ? str(objectOf(written.updates, "updates").updatedRange) : str(written.updatedRange)
    if (!actualRange) throw new CliError("api", "The write response is missing updatedRange")
    const actual = parseRange(actualRange)
    if (actual.sheet !== parsed.sheet || actual.rows !== values.length || actual.columns !== values[0]!.length) throw new CliError("api", "The updated range does not match the requested matrix")
    if (action === "write" && actual.range !== parsed.range) throw new CliError("api", "The write response points to a different range")
    verified = await valuesOf(api, token, spreadsheet, actual.range)
    const normalized = values.map((row, i) => row.map((_, j) => verified.values[i]?.[j] ?? null))
    const expected = values.map(row => row.map(cell => isRecord(cell) ? cell.text : cell))
    if (JSON.stringify(normalized) !== JSON.stringify(expected)) throw new CliError("verification", "Read-back values differ from the requested values")
  } catch (err) { return writeFailure(err, { ...target, result: written }, "verify") }
  return { ...target, dry_run: false, verified: true, concurrency_protected: false, before: before?.values, result: written, read_back: verified }
}
