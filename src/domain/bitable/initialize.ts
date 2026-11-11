import type { OpenApi } from "../../client/http.ts"
import { CliError } from "../../errors.ts"
import { isRecord } from "../../json.ts"
import { getRecord, listFields, searchRecords, writeField, writeRecord, validateRecordFields } from "./service.ts"

export interface BaseInput { fields: Array<{ field_name: string; type: number }>; records: Array<{ fields: Record<string, unknown> }> }
export function validateBaseInput(raw: unknown): BaseInput {
  if (!isRecord(raw) || Object.keys(raw).some(k => !["fields", "records"].includes(k)) || !Array.isArray(raw.fields) || !raw.fields.length || raw.fields.length > 20 || !Array.isArray(raw.records) || raw.records.length > 100) throw new CliError("usage", "Base JSON requires 1-20 fields and 0-100 records")
  const fields = raw.fields.map(f => {
    if (!isRecord(f) || Object.keys(f).some(k => !["field_name", "type"].includes(k)) || typeof f.field_name !== "string" || !f.field_name.trim() || ![1, 2].includes(Number(f.type)) || typeof f.type !== "number") throw new CliError("usage", "Base initialization fields require field_name and type 1 (text) or 2 (number)")
    return { field_name: f.field_name, type: f.type }
  })
  if (fields[0]!.type !== 1 || new Set(fields.map(f => f.field_name)).size !== fields.length) throw new CliError("usage", "Base initialization requires a text primary field first and unique field names")
  const records = raw.records.map(r => {
    if (!isRecord(r) || Object.keys(r).length !== 1 || !Object.hasOwn(r, "fields")) throw new CliError("usage", "Each initial record must contain only fields; existing record IDs are not accepted")
    const values = validateRecordFields(r.fields)
    for (const [name, value] of Object.entries(values)) {
      const field = fields.find(f => f.field_name === name)
      if (!field || !(field.type === 1 ? typeof value === "string" : typeof value === "number" && Number.isFinite(value))) throw new CliError("usage", `Invalid initial value or undeclared field: ${name}; omit unset fields instead of using null`)
    }
    if (Object.values(values).every(v => v === null || v === "")) throw new CliError("usage", "Initial records must contain at least one nonempty business value")
    return { fields: values }
  })
  return { fields, records }
}

export function emptyRecord(record: unknown): boolean {
  return isRecord(record) && isRecord(record.fields) && Object.values(record.fields).every(v => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0))
}

// Only called for the resource just created by docs tables create. It is not an
// overwrite/upsert operation for an existing user table.
export async function initializeNewBase(api: OpenApi, token: string, app: string, table: string, raw: unknown) {
  const input = validateBaseInput(raw)
  const progress: { fields: unknown[]; records: unknown[] } = { fields: [], records: [] }
  let stage = "read_initial_state"
  try {
    const schema = await listFields(api, token, app, table, { all: true })
    const initial = await searchRecords(api, token, app, table, {}, { all: true })
    if (initial.items.some(r => !emptyRecord(r))) throw new CliError("conflict", "The new Base already contains business data; initialization was stopped to avoid duplicate or overwritten records")
    const candidates = initial.items.filter(emptyRecord)
    if (candidates.some(r => !isRecord(r) || typeof r.record_id !== "string")) throw new CliError("api", "An initial record is missing its ID")
    const primary = schema.items.find(f => isRecord(f) && f.is_primary === true)
    if (!isRecord(primary) || typeof primary.field_id !== "string" || primary.type !== 1) throw new CliError("unsupported", "Cannot identify a text primary field for initialization")
    stage = "initialize_fields"
    for (const [i, field] of input.fields.entries()) {
      const existing = i === 0 ? primary : schema.items.find(f => isRecord(f) && f.field_name === field.field_name)
      if (isRecord(existing) && (i !== 0 || existing.field_name === field.field_name)) {
        if (existing.type !== field.type) throw new CliError("conflict", `Existing field type differs: ${field.field_name}`)
        progress.fields.push(existing)
      } else progress.fields.push(await writeField(api, token, app, table, field, i === 0 ? { fieldId: primary.field_id as string } : {}))
    }
    stage = "initialize_records"
    for (const [i, record] of input.records.entries()) {
      const candidate = candidates[i]
      if (isRecord(candidate)) {
        // Re-read immediately before reuse; never overwrite a row that acquired
        // business data since the initial query.
        if (!emptyRecord(await getRecord(api, token, app, table, String(candidate.record_id)))) throw new CliError("conflict", "An initial blank record changed; initialization was stopped")
      }
      progress.records.push(await writeRecord(api, token, app, table, record.fields, isRecord(candidate) ? { recordId: String(candidate.record_id) } : {}))
    }
    stage = "verify_table"
    const final = await searchRecords(api, token, app, table, {}, { all: true })
    const ids = progress.records.map(r => (r as { record_id: string }).record_id)
    if (!ids.every(id => final.items.some(r => isRecord(r) && r.record_id === id))) throw new CliError("verification", "Initialized records are missing from the final table query")
    return { verified: true, records_written: ids.length, records_reused: Math.min(candidates.length, ids.length), records_created: Math.max(0, ids.length - candidates.length), remaining_blank_records: final.items.filter(emptyRecord).length, total_records: final.items.length, record_ids: ids, progress, concurrency_protected: false }
  } catch (err) {
    throw new CliError("partial_write", "The Base exists, but JSON initialization did not finish", "Inspect the returned resource IDs and progress. Do not repeat table creation or automatically retry initialization.", { app_token: app, table_id: table, stage, progress, cause: err instanceof CliError ? { type: err.type, message: err.message, data: err.data } : { message: String(err) } })
  }
}
