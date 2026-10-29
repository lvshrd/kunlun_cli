import { CliError } from "../../errors.ts"
import { writeFileSync } from "node:fs"
import path from "node:path"
import { printOk } from "../../output/envelope.ts"
import { getBotToken } from "../../auth/tenant.ts"
import { getUserToken } from "../../auth/user.ts"
import { contentToBlocks } from "../../domain/docs/blocks.ts"
import { appendDocument, createDocument, documentIdFromInput, readDocument } from "../../domain/docs/service.ts"
import { editDocument } from "../../domain/docs/edit.ts"
import { documentTemplate } from "../../domain/docs/template.ts"
import { resolveDocumentByName, searchDocuments, validateSearchInput } from "../../domain/docs/search.ts"
import { requireApp } from "../../runtime.ts"
import { boolFlag, strFlag } from "../args.ts"
import { readBody } from "../content.ts"
import { identityOf } from "./api.ts"
import type { Invocation, Route } from "../route.ts"

export function docsRoutes(): Route[] {
  return [
    { path: ["docs", "template"], summary: "生成本地 UTF-8 操作文档模板，不访问云端、不覆盖文件", run: template },
    { path: ["docs", "create"], summary: "创建云文档，并把 Markdown 标题和段落写进去", run: create },
    { path: ["docs", "append"], summary: "向已有云文档末尾追加正文", run: append },
    { path: ["docs", "search"], summary: "按关键词搜索本人可见的文档；--query [--limit 20] [--offset 0]", run: search },
    { path: ["docs", "read"], summary: "读取文档及完整性诊断；--document <ID或链接> 或 --name <完整标题>；--raw 返回原始块", run: read },
    { path: ["docs", "edit"], summary: "唯一匹配普通段落文本后替换；--find --replace --dry-run [--revision]", run: edit },
  ]
}

async function edit(invocation: Invocation): Promise<void> {
  const document = strFlag(invocation.flags, "document")
  const find = strFlag(invocation.flags, "find")
  const replacement = strFlag(invocation.flags, "replace")
  if (!document || !find || !replacement || invocation.rest.length) throw new CliError("usage", "用法：kunlun docs edit --document <ID> --find <原文> --replace <新文> [--dry-run] [--revision <版本>]")
  const revisionValue = strFlag(invocation.flags, "revision")
  const revision = revisionValue === undefined ? undefined : Number(revisionValue)
  if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 0)) throw new CliError("usage", "--revision 必须是非负整数")
  const app = requireApp()
  const identity = identityOf(invocation)
  printOk({ identity, ...await editDocument(app.client, await tokenFor(app, identity), documentIdFromInput(document), {
    find, replacement, revision, dryRun: boolFlag(invocation.flags, "dry-run"),
  }) })
}

async function template(invocation: Invocation): Promise<void> {
  if (invocation.rest.length > 0) throw new CliError("usage", "docs template 不接受位置参数")
  const output = strFlag(invocation.flags, "output")
  if (!output) throw new CliError("usage", "缺少 --output", "例如 kunlun docs template --output ./操作文档.md")
  const file = path.resolve(output)
  try {
    writeFileSync(file, documentTemplate, { encoding: "utf8", flag: "wx" })
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "EEXIST") throw new CliError("usage", "目标文件已存在，未覆盖", "换一个 --output 文件名")
    throw new CliError("usage", `无法生成模板：${err instanceof Error ? err.message : String(err)}`, "确认目标目录存在且可写")
  }
  printOk({ file, encoding: "utf8" })
}

async function create(invocation: Invocation): Promise<void> {
  const title = strFlag(invocation.flags, "title")
  if (!title) throw new CliError("usage", "缺少 --title")
  if (invocation.rest.length > 0) throw new CliError("usage", "docs create 不接受位置参数")
  const content = readBody(invocation.flags)
  const identity = identityOf(invocation)
  if (boolFlag(invocation.flags, "dry-run")) {
    printOk({
      dry_run: true,
      identity,
      title,
      block_count: contentToBlocks(content).length,
      folder_token: strFlag(invocation.flags, "folder") ?? "",
    })
    return
  }
  const app = requireApp()
  const token = await tokenFor(app, identity)
  const created = await createDocument(app.client, token, {
    title,
    content,
    folderToken: strFlag(invocation.flags, "folder"),
  })
  printOk({
    identity,
    document_id: created.documentId,
    title: created.title,
    block_count: created.blockCount,
    url: documentUrl(app.config.webBaseUrl, created.documentId),
  })
}

async function append(invocation: Invocation): Promise<void> {
  const document = strFlag(invocation.flags, "document")
  if (!document) throw new CliError("usage", "缺少 --document")
  if (invocation.rest.length > 0) throw new CliError("usage", "docs append 不接受位置参数")
  const content = readBody(invocation.flags)
  const identity = identityOf(invocation)
  const documentId = documentIdFromInput(document)
  if (boolFlag(invocation.flags, "dry-run")) {
    printOk({ dry_run: true, identity, document_id: documentId, block_count: contentToBlocks(content).length })
    return
  }
  const app = requireApp()
  const count = await appendDocument(app.client, await tokenFor(app, identity), documentId, content)
  printOk({ identity, document_id: documentId, block_count: count, url: documentUrl(app.config.webBaseUrl, documentId) })
}

async function read(invocation: Invocation): Promise<void> {
  validateFlags(invocation, ["document", "name", "as"], ["raw"])
  const document = strFlag(invocation.flags, "document")
  const name = strFlag(invocation.flags, "name")
  if (invocation.flags.document !== undefined && invocation.flags.name !== undefined) throw new CliError("usage", "--document 与 --name 只能选一个")
  if (!document && !name) throw new CliError("usage", "提供 --document <ID或docx链接> 或 --name <完整标题>")
  if (invocation.rest.length > 0) throw new CliError("usage", "docs read 不接受位置参数")
  const identity = identityOf(invocation)
  if (name) requireUserSearch(identity)
  const app = requireApp()
  const token = await tokenFor(app, identity)
  const located = name ? await resolveDocumentByName(app.client, token, name) : undefined
  const documentId = located ? located.document_id : documentIdFromInput(document!)
  const { blockCount, ...result } = await readDocument(app.client, token, documentId, { raw: boolFlag(invocation.flags, "raw") })
  printOk({
    identity,
    document_id: documentId,
    ...(located ? { title: located.title, located_by: "name" } : {}),
    block_count: blockCount,
    ...result,
    url: documentUrl(app.config.webBaseUrl, documentId),
  })
}

async function search(invocation: Invocation): Promise<void> {
  validateFlags(invocation, ["query", "limit", "offset", "as"])
  if (invocation.rest.length > 0) throw new CliError("usage", "docs search 不接受位置参数")
  const input = validateSearchInput({
    query: strFlag(invocation.flags, "query") ?? "",
    limit: invocation.flags.limit === undefined ? undefined : Number(strFlag(invocation.flags, "limit") ?? NaN),
    offset: invocation.flags.offset === undefined ? undefined : Number(strFlag(invocation.flags, "offset") ?? NaN),
  })
  const identity = identityOf(invocation)
  requireUserSearch(identity)
  const app = requireApp()
  const result = await searchDocuments(app.client, await tokenFor(app, identity), input)
  printOk({ identity, ...result, items: result.items.map(item => ({
    ...item,
    ...(item.document_id ? { url: documentUrl(app.config.webBaseUrl, item.document_id) } : {}),
  })) })
}

function requireUserSearch(identity: "user" | "bot"): void {
  if (identity !== "user") throw new CliError("usage", "昆仑搜索接口仅支持用户身份；--as 只能为 user", "使用本人授权，不自动切换为 bot。")
}

function validateFlags(invocation: Invocation, allowed: string[], switches: string[] = []): void {
  for (const [name, value] of Object.entries(invocation.flags)) {
    if (switches.includes(name)) {
      if (typeof value !== "boolean") throw new CliError("usage", `--${name} 是开关`)
      continue
    }
    if (!allowed.includes(name)) throw new CliError("usage", `不支持参数 --${name}`)
    if (typeof value !== "string") throw new CliError("usage", `--${name} 需要一个值`)
  }
}

async function tokenFor(app: ReturnType<typeof requireApp>, identity: "user" | "bot"): Promise<string> {
  if (identity === "bot") return getBotToken(app.dir, app.client, app.config.appId, app.secret)
  return getUserToken(app.dir, app.client, app.config, app.secret)
}

function documentUrl(webBaseUrl: string, documentId: string): string | undefined {
  if (!webBaseUrl) return undefined
  return `${webBaseUrl}/docx/${documentId}`
}
