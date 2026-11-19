import { isDeepStrictEqual } from "node:util"
import type { OpenApi } from "../../client/http.ts"
import { CliError } from "../../errors.ts"
import { isRecord } from "../../json.ts"
import { dataOf, writeFailure } from "../table-common.ts"

const progressPath = "/open-apis/okr/v1/progress_records"
const query = { user_id_type: "open_id" }

function isOkrId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d*$/.test(value)
}

export function okrId(value: string, label: string): string {
  if (!isOkrId(value)) throw new CliError("usage", `Invalid ${label}; use the decimal ID returned by the OKR API`)
  return value
}

function hasFormatting(style: unknown): boolean {
  return style != null && (!isRecord(style) || Object.values(style).some(value => value != null && value !== false))
}

function plainText(content: unknown, checkFormatting = false): string | undefined {
  if (!isRecord(content) || !Array.isArray(content.blocks)) return undefined
  const lines: string[] = []
  for (const block of content.blocks) {
    if (!isRecord(block) || block.type !== "paragraph" || !isRecord(block.paragraph) || !Array.isArray(block.paragraph.elements)) return undefined
    if (checkFormatting && hasFormatting(block.paragraph.style)) return undefined
    let line = ""
    for (const element of block.paragraph.elements) {
      if (!isRecord(element) || element.type !== "textRun" || !isRecord(element.textRun) || typeof element.textRun.text !== "string") return undefined
      if (checkFormatting && hasFormatting(element.textRun.style)) return undefined
      line += element.textRun.text
    }
    lines.push(line)
  }
  return lines.join("\n").replace(/\r\n?/g, "\n")
}

export async function getProgress(api: OpenApi, token: string, id: string): Promise<Record<string, unknown> & { text: string | undefined }> {
  const path = `${progressPath}/${okrId(id, "progress ID")}`
  const progress = dataOf(await api.call({ method: "GET", path, token, query }))
  if (progress.progress_id !== id || !isRecord(progress.content)) throw new CliError("api", "Invalid OKR progress response")
  return { ...progress, text: plainText(progress.content) }
}

export type ProgressTarget =
  | { action: "create"; targetId: string; targetType: string; sourceTitle: string; sourceUrl: string }
  | { action: "update"; progressId: string }

export function prepareProgress(target: ProgressTarget, value: string) {
  const text = value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")
  if (!text.trim()) throw new CliError("usage", "Provide nonempty progress text via --content, --file or --stdin")
  const content = { blocks: text.split("\n").map(line => ({
    type: "paragraph", paragraph: { elements: [{ type: "textRun", textRun: { text: line } }] },
  })) }
  if (target.action === "update") {
    const progressId = okrId(target.progressId, "progress ID")
    return { action: target.action, location: { progress_id: progressId }, text, request: { method: "PUT", path: `${progressPath}/${progressId}`, body: { content } } }
  }
  const targetId = okrId(target.targetId, "objective or key result ID")
  const type = target.targetType
  if (type !== "objective" && type !== "key-result") throw new CliError("usage", "--target-type must be objective or key-result")
  let url: URL
  try { url = new URL(target.sourceUrl) }
  catch { throw new CliError("usage", "--source-url must be a valid HTTP or HTTPS URL") }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new CliError("usage", "--source-url must be an HTTP or HTTPS URL without embedded credentials")
  }
  if (!target.sourceTitle.trim()) throw new CliError("usage", "--source-title must not be empty")
  const location = { target_id: targetId, target_type: type, source_title: target.sourceTitle, source_url: url.href }
  return { action: target.action, location, text, request: { method: "POST", path: progressPath, body: { ...location, target_type: type === "objective" ? 2 : 3, content } } }
}

export async function writeProgress(api: OpenApi, token: string, plan: ReturnType<typeof prepareProgress>) {
  const { action, location, text, request } = plan
  let id = action === "update" ? location.progress_id : undefined
  const previous = id ? await getProgress(api, token, id) : undefined
  if (previous?.text === text) return { ...location, action: "unchanged", written: false, verified: true }
  if (previous && plainText(previous.content, true) === undefined) {
    throw new CliError("unsupported", "The existing progress contains content or formatting that cannot be safely replaced as plain text", undefined, location)
  }
  let response: unknown
  try { response = await api.call({ ...request, token, query }) }
  catch (error) { return writeFailure(error, { ...location, action }, "write") }

  try {
    const acknowledged = dataOf(response).progress_id
    if (!isOkrId(acknowledged) || (id && acknowledged !== id)) throw new CliError("api", "The write response returned an invalid progress ID")
    id = acknowledged
    const readBack = await getProgress(api, token, id)
    if (readBack.text !== text) throw new CliError("verification", "Read-back progress differs from the requested text")
    if (previous?.progress_rate != null && !isDeepStrictEqual(previous.progress_rate, readBack.progress_rate)) {
      throw new CliError("verification", "The progress rate changed during the text update")
    }
    return { ...location, progress_id: id, action, written: true, verified: true, modify_time: readBack.modify_time, text: readBack.text }
  } catch (error) {
    return writeFailure(error, { ...location, progress_id: id, action }, "verify")
  }
}
