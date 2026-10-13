import { CliError } from "../../errors.ts"
import { printOk } from "../../output/envelope.ts"
import { getBotToken } from "../../auth/tenant.ts"
import { getUserToken } from "../../auth/user.ts"
import { contentToBlocks } from "../../domain/docs/blocks.ts"
import { appendDocument, createDocument, documentIdFromInput, readDocument } from "../../domain/docs/service.ts"
import { requireApp } from "../../runtime.ts"
import { boolFlag, strFlag } from "../args.ts"
import { readBody } from "../content.ts"
import { identityOf } from "./api.ts"
import type { Invocation, Route } from "../route.ts"

export function docsRoutes(): Route[] {
  return [
    { path: ["docs", "create"], summary: "创建云文档，并把 Markdown 标题和段落写进去", run: create },
    { path: ["docs", "append"], summary: "向已有云文档末尾追加正文", run: append },
    { path: ["docs", "read"], summary: "把云文档读成 Markdown 文本", run: read },
  ]
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
  const document = strFlag(invocation.flags, "document")
  if (!document) throw new CliError("usage", "缺少 --document")
  if (invocation.rest.length > 0) throw new CliError("usage", "docs read 不接受位置参数")
  const app = requireApp()
  const identity = identityOf(invocation)
  const documentId = documentIdFromInput(document)
  const result = await readDocument(app.client, await tokenFor(app, identity), documentId)
  printOk({
    identity,
    document_id: documentId,
    block_count: result.blockCount,
    markdown: result.markdown,
    url: documentUrl(app.config.webBaseUrl, documentId),
  })
}

async function tokenFor(app: ReturnType<typeof requireApp>, identity: "user" | "bot"): Promise<string> {
  if (identity === "bot") return getBotToken(app.dir, app.client, app.config.appId, app.secret)
  return getUserToken(app.dir, app.client, app.config, app.secret)
}

function documentUrl(webBaseUrl: string, documentId: string): string | undefined {
  if (!webBaseUrl) return undefined
  return `${webBaseUrl}/docx/${documentId}`
}
