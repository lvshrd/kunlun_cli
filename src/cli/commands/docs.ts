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
    { path: ["docs", "template"], summary: "Create a local UTF-8 procedure template without network access or overwriting files", run: template },
    { path: ["docs", "create"], summary: "Create a cloud document from Markdown headings and paragraphs", run: create },
    { path: ["docs", "append"], summary: "Append content to an existing cloud document", run: append },
    { path: ["docs", "search"], summary: "Search documents visible to the current user; --query [--limit 20] [--offset 0]", run: search },
    { path: ["docs", "read"], summary: "Read a document with completeness diagnostics; --document <ID-or-URL> or --name <exact-title>; --raw includes raw blocks", run: read },
    { path: ["docs", "edit"], summary: "Replace a unique text match; --find --replace --dry-run [--revision]", run: edit },
  ]
}

async function edit(invocation: Invocation): Promise<void> {
  const document = strFlag(invocation.flags, "document")
  const find = strFlag(invocation.flags, "find")
  const replacement = strFlag(invocation.flags, "replace")
  if (!document || !find || !replacement || invocation.rest.length) throw new CliError("usage", "Usage: kunlun-cli docs edit --document <ID> --find <text> --replace <replacement> [--dry-run] [--revision <revision>]")
  const revisionValue = strFlag(invocation.flags, "revision")
  const revision = revisionValue === undefined ? undefined : Number(revisionValue)
  if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 0)) throw new CliError("usage", "--revision must be a nonnegative integer")
  const app = requireApp()
  const identity = identityOf(invocation)
  printOk({ identity, ...await editDocument(app.client, await tokenFor(app, identity), documentIdFromInput(document), {
    find, replacement, revision, dryRun: boolFlag(invocation.flags, "dry-run"),
  }) })
}

async function template(invocation: Invocation): Promise<void> {
  if (invocation.rest.length > 0) throw new CliError("usage", "docs template does not accept positional arguments")
  const output = strFlag(invocation.flags, "output")
  if (!output) throw new CliError("usage", "Missing --output", "For example: kunlun-cli docs template --output ./procedure.md")
  const file = path.resolve(output)
  try {
    writeFileSync(file, documentTemplate, { encoding: "utf8", flag: "wx" })
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "EEXIST") throw new CliError("usage", "The output file already exists; it was not overwritten", "Choose a different --output filename")
    throw new CliError("usage", `Cannot create the template: ${err instanceof Error ? err.message : String(err)}`, "Ensure the output directory exists and is writable")
  }
  printOk({ file, encoding: "utf8" })
}

async function create(invocation: Invocation): Promise<void> {
  const title = strFlag(invocation.flags, "title")
  if (!title) throw new CliError("usage", "Missing --title")
  if (invocation.rest.length > 0) throw new CliError("usage", "docs create does not accept positional arguments")
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
  if (!document) throw new CliError("usage", "Missing --document")
  if (invocation.rest.length > 0) throw new CliError("usage", "docs append does not accept positional arguments")
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
  if (invocation.flags.document !== undefined && invocation.flags.name !== undefined) throw new CliError("usage", "Use only one of --document or --name")
  if (!document && !name) throw new CliError("usage", "Provide --document <ID-or-docx-URL> or --name <exact-title>")
  if (invocation.rest.length > 0) throw new CliError("usage", "docs read does not accept positional arguments")
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
  if (invocation.rest.length > 0) throw new CliError("usage", "docs search does not accept positional arguments")
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
  if (identity !== "user") throw new CliError("usage", "Kunlun search only supports user identity; --as must be user", "Use your own user authorization; do not switch to bot identity automatically.")
}

function validateFlags(invocation: Invocation, allowed: string[], switches: string[] = []): void {
  for (const [name, value] of Object.entries(invocation.flags)) {
    if (switches.includes(name)) {
      if (typeof value !== "boolean") throw new CliError("usage", `--${name} is a boolean option`)
      continue
    }
    if (!allowed.includes(name)) throw new CliError("usage", `Unsupported option: --${name}`)
    if (typeof value !== "string") throw new CliError("usage", `--${name} requires a value`)
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
