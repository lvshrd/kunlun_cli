import { randomUUID } from "node:crypto"
import type { OpenApi } from "../../client/http.ts"
import { CliError } from "../../errors.ts"
import { isRecord, str } from "../../json.ts"
import { dataOf, identifier, objectOf, pagination, readPages, resourceToken, writeFailure, type PageOptions } from "../table-common.ts"

function base(app: string) { return `/open-apis/bitable/v1/apps/${encodeURIComponent(resourceToken(app, "base"))}` }
function table(app: string, id: string) { return `${base(app)}/tables/${encodeURIComponent(identifier(id, "table ID"))}` }

export async function baseInfo(api: OpenApi, token: string, app: string) {
  return objectOf(dataOf(await api.call({ method: "GET", path: base(app), token })).app, "app")
}

export async function listTables(api: OpenApi, token: string, app: string, page: PageOptions = {}) {
  const path = `${base(app)}/tables`
  return readPages(query => api.call({ method: "GET", path, token, query }), page, 100)
}

export async function listFields(api: OpenApi, token: string, app: string, tableId: string, page: PageOptions = {}) {
  const path = `${table(app, tableId)}/fields`
  return readPages(query => api.call({ method: "GET", path, token, query }), page, 100)
}

export function validateSearch(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new CliError("usage", "Search input must be a JSON object")
  for (const key of Object.keys(value)) if (!["view_id", "field_names", "sort", "filter", "automatic_fields"].includes(key)) throw new CliError("usage", `Unsupported search property: ${key}`)
  if (value.view_id !== undefined && typeof value.view_id !== "string") throw new CliError("usage", "view_id must be a string")
  if (value.field_names !== undefined && (!Array.isArray(value.field_names) || value.field_names.some(v => typeof v !== "string"))) throw new CliError("usage", "field_names must be an array of strings")
  if (value.filter !== undefined && !isRecord(value.filter)) throw new CliError("usage", "filter must be an object")
  if (value.sort !== undefined && (!Array.isArray(value.sort) || value.sort.some(v => !isRecord(v) || typeof v.field_name !== "string" || typeof v.desc !== "boolean"))) throw new CliError("usage", "sort must contain field_name and desc entries")
  if (value.automatic_fields !== undefined && typeof value.automatic_fields !== "boolean") throw new CliError("usage", "automatic_fields must be boolean")
  return value
}

export async function searchRecords(api: OpenApi, token: string, app: string, tableId: string, input: unknown, page: PageOptions = {}) {
  const body = validateSearch(input), path = `${table(app, tableId)}/records/search`
  pagination(page, 500)
  return readPages(query => api.call({ method: "POST", path, token, body, query: { ...query, user_id_type: "open_id" } }), page, 500)
}

export async function getRecord(api: OpenApi, token: string, app: string, tableId: string, recordId: string) {
  const path = `${table(app, tableId)}/records/${encodeURIComponent(identifier(recordId, "record ID"))}`
  const record = objectOf(dataOf(await api.call({ method: "GET", path, token, query: { user_id_type: "open_id" } })).record, "record")
  if (record.record_id !== recordId || !isRecord(record.fields)) throw new CliError("api", "Invalid record response")
  return record
}

function contains(actual: unknown, expected: unknown): boolean {
  // Accept text-only rich-text runs when returned by an API representation;
  // never flatten mentions, links or ID arrays into plain strings.
  if (typeof expected === "string" && Array.isArray(actual) && actual.every(run => isRecord(run) && run.type === "text" && typeof run.text === "string")) return actual.map(run => run.text).join("") === expected
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((v, i) => contains(actual[i], v))
  if (isRecord(expected)) return isRecord(actual) && Object.keys(expected).every(k => Object.hasOwn(actual, k) && contains(actual[k], expected[k]))
  return Object.is(actual, expected)
}

export function validateRecordFields(fields: unknown): Record<string, unknown> {
  if (!isRecord(fields) || !Object.keys(fields).length || Object.keys(fields).some(k => !k.trim())) throw new CliError("usage", "fields must be a nonempty object keyed by exact field names")
  return fields
}

export function validateClientToken(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new CliError("usage", "--client-token must be a UUIDv4")
  return value
}

export async function writeRecord(api: OpenApi, token: string, app: string, tableId: string, fields: unknown, options: { recordId?: string; clientToken?: string; dryRun?: boolean } = {}) {
  const root = table(app, tableId)
  fields = validateRecordFields(fields)
  const id = options.recordId === undefined ? undefined : identifier(options.recordId, "record ID")
  if (id && options.clientToken) throw new CliError("usage", "--client-token is only supported for record creation")
  const clientToken = id ? undefined : options.clientToken ?? randomUUID()
  if (clientToken) validateClientToken(clientToken)
  const target = { app_token: resourceToken(app, "base"), table_id: tableId, record_id: id, client_token: clientToken }
  if (options.dryRun) return { ...target, dry_run: true, fields, permission_check: "pending", schema_check: "pending", required_scope: "bitable:app" }
  const before = id ? await getRecord(api, token, app, tableId, id) : undefined
  let result: Record<string, unknown>
  try {
    result = objectOf(dataOf(await api.call({ method: id ? "PUT" : "POST", path: id ? `${root}/records/${encodeURIComponent(id)}` : `${root}/records`, token,
      query: { user_id_type: "open_id", ...(clientToken ? { client_token: clientToken } : {}) }, body: { fields } })).record, "record")
  } catch (err) { return writeFailure(err, target, "write") }
  let readBack: Record<string, unknown> = {}
  const numericNormalizations: string[] = []
  try {
    const recordId = str(result.record_id)
    if (!recordId || (id && id !== recordId)) throw new CliError("api", "The write response has an invalid record_id")
    readBack = await getRecord(api, token, app, tableId, recordId)
    if (!contains(readBack.fields, fields)) {
      const schema = await listFields(api, token, app, tableId, { all: true })
      const actual = { ...objectOf(readBack.fields, "record fields") }
      for (const [name, expected] of Object.entries(fields as Record<string, unknown>)) {
        const field = schema.items.find(item => isRecord(item) && item.field_name === name)
        const value = actual[name]
        if (isRecord(field) && field.type === 2 && typeof expected === "number" && typeof value === "string" && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) && Number.isFinite(Number(value))) {
          actual[name] = Number(value)
          numericNormalizations.push(name)
        }
      }
      if (!contains(actual, fields)) throw new CliError("verification", "Read-back fields differ from the requested fields")
    }
  } catch (err) { return writeFailure(err, { ...target, record_id: result.record_id, result, read_back: readBack }, "verify") }
  return { ...target, record_id: result.record_id, dry_run: false, verified: true, verification_scope: "requested_fields", numeric_normalizations: numericNormalizations, concurrency_protected: false, before, result, read_back: readBack }
}

export function validateField(input: unknown): Record<string, unknown> {
  if (!isRecord(input) || typeof input.field_name !== "string" || !input.field_name.trim() || !Number.isSafeInteger(input.type) || Number(input.type) < 1) throw new CliError("usage", "Field input requires field_name and a positive integer type")
  for (const k of Object.keys(input)) if (!["field_name", "type", "property", "description"].includes(k)) throw new CliError("usage", `Unsupported field property: ${k}`)
  if (input.property !== undefined && !isRecord(input.property)) throw new CliError("usage", "Field property must be an object")
  if (input.description !== undefined && (!isRecord(input.description) || Object.keys(input.description).some(k => !["text", "disable_sync"].includes(k)) || (input.description.text !== undefined && typeof input.description.text !== "string") || (input.description.disable_sync !== undefined && typeof input.description.disable_sync !== "boolean"))) throw new CliError("usage", "description must be an object with optional text and disable_sync")
  return input
}

export async function writeField(api: OpenApi, token: string, app: string, tableId: string, input: unknown, options: { fieldId?: string; dryRun?: boolean } = {}) {
  const body = validateField(input), root = `${table(app, tableId)}/fields`
  const id = options.fieldId === undefined ? undefined : identifier(options.fieldId, "field ID")
  if (options.dryRun) return { dry_run: true, app_token: resourceToken(app, "base"), table_id: tableId, field_id: id, field: body, required_scope: "bitable:app", permission_check: "pending" }
  const target = { app_token: resourceToken(app, "base"), table_id: tableId, field_id: id }
  let result: Record<string, unknown>
  try { result = objectOf(dataOf(await api.call({ method: id ? "PUT" : "POST", path: id ? `${root}/${encodeURIComponent(id)}` : root, token, body })).field, "field") }
  catch (err) { return writeFailure(err, target, "write") }
  try {
    if (!str(result.field_id) || (id && result.field_id !== id)) throw new CliError("api", "Invalid field_id in write response")
    const page = await listFields(api, token, app, tableId, { all: true })
    const field = page.items.find(f => isRecord(f) && f.field_id === result.field_id)
    if (!isRecord(field) || field.field_name !== body.field_name || field.type !== body.type) throw new CliError("verification", "Field read-back did not match name and type")
    return { ...target, field_id: result.field_id, dry_run: false, result, read_back: field, verified: true, verification_scope: "field_name_and_type" }
  } catch (err) { return writeFailure(err, { ...target, result }, "verify") }
}

export async function deleteResource(api: OpenApi, token: string, app: string, tableId: string, kind: "records" | "fields", resourceId: string, dryRun = false) {
  const root = table(app, tableId), id = identifier(resourceId, kind === "records" ? "record ID" : "field ID")
  const key = kind === "records" ? "record_id" : "field_id"
  const target = { app_token: resourceToken(app, "base"), table_id: tableId, [key]: id, action: "delete" }
  if (dryRun) return { ...target, dry_run: true, required_scope: "bitable:app", permission_check: "pending", resource_check: "pending" }
  let before: Record<string, unknown>
  if (kind === "records") before = await getRecord(api, token, app, tableId, id)
  else {
    const fields = await listFields(api, token, app, tableId, { all: true })
    const field = fields.items.find(item => isRecord(item) && item.field_id === id)
    if (!isRecord(field)) throw new CliError("not_found", "The field was not found; deletion was stopped")
    if (field.is_primary === true) throw new CliError("usage", "The primary field cannot be deleted")
    before = field
  }
  let result: Record<string, unknown>
  try { result = dataOf(await api.call({ method: "DELETE", path: `${root}/${kind}/${encodeURIComponent(id)}`, token })) }
  catch (err) { return writeFailure(err, target, "write") }
  try {
    if (result.deleted !== true || result[key] !== id) throw new CliError("verification", "The API did not confirm deletion of the requested resource")
    if (kind === "fields") {
      const fields = await listFields(api, token, app, tableId, { all: true })
      if (fields.items.some(item => isRecord(item) && item.field_id === id)) throw new CliError("verification", "The deleted field is still present")
    } else {
      let absent = false
      try { await getRecord(api, token, app, tableId, id) }
      catch (err) {
        const data = err instanceof CliError && isRecord(err.data) ? err.data : {}
        const upstream = isRecord(data.upstream) ? data.upstream : {}
        if (err instanceof CliError && err.type === "api" && upstream.code === 1254043) absent = true
        else throw err
      }
      if (!absent) throw new CliError("verification", "The deleted record is still readable")
    }
  } catch (err) { return writeFailure(err, { ...target, result, before }, "verify") }
  return { ...target, dry_run: false, deleted: true, verified: true, verification_scope: kind === "records" ? "record_not_found" : "field_absent", concurrency_protected: false, before, result }
}
