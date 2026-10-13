export interface TextBody {
  elements: Array<{ text_run: { content: string } }>
}

export interface DocBlock {
  block_type: number
  text?: TextBody
  heading1?: TextBody
  heading2?: TextBody
  heading3?: TextBody
}

const headingKeys = [
  { hashes: 1, field: "heading1", blockType: 3, prefix: "# " },
  { hashes: 2, field: "heading2", blockType: 4, prefix: "## " },
  { hashes: 3, field: "heading3", blockType: 5, prefix: "### " },
] as const

export function contentToBlocks(content: string): DocBlock[] {
  const blocks: DocBlock[] = []
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const heading = /^(#{1,3})\s+(\S.*)$/.exec(line)
    if (heading) {
      blocks.push(headingBlock(heading[1]?.length ?? 1, heading[2] ?? ""))
      continue
    }
    blocks.push({ block_type: 2, text: textBody(line) })
  }
  return blocks
}

export function blocksToMarkdown(blocks: unknown[]): string {
  const lines: string[] = []
  for (const block of blocks) {
    const line = blockToLine(block)
    if (line) lines.push(line)
  }
  return lines.join("\n")
}

export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error("批次大小必须大于 0")
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size))
  return batches
}

function textBody(content: string): TextBody {
  return { elements: [{ text_run: { content } }] }
}

function headingBlock(level: number, content: string): DocBlock {
  const body = textBody(content)
  if (level === 1) return { block_type: 3, heading1: body }
  if (level === 2) return { block_type: 4, heading2: body }
  return { block_type: 5, heading3: body }
}

function blockToLine(block: unknown): string | undefined {
  if (!block || typeof block !== "object") return undefined
  const record = block as Record<string, unknown>
  for (const spec of headingKeys) {
    const text = elementText(record[spec.field])
    if (text) return `${spec.prefix}${text}`
  }
  const page = elementText(record.page)
  if (page) return `# ${page}`
  const text = elementText(record.text)
  if (text) return text
  return undefined
}

function elementText(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined
  const elements = (value as { elements?: unknown }).elements
  if (!Array.isArray(elements)) return undefined
  const parts: string[] = []
  for (const element of elements) {
    if (!element || typeof element !== "object") continue
    const content = (element as { text_run?: { content?: unknown } }).text_run?.content
    if (typeof content === "string" && content) parts.push(content)
  }
  const joined = parts.join("")
  return joined || undefined
}
