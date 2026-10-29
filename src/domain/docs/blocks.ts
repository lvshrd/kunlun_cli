import { inspectBlocks } from "./read.ts"

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
  return inspectBlocks(blocks).markdown
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
