import { readFileSync } from "node:fs"
import { CliError } from "../errors.ts"
import { boolFlag, strFlag } from "./args.ts"
import type { Flags } from "./route.ts"

export function readBody(flags: Flags): string {
  const content = strFlag(flags, "content")
  const file = strFlag(flags, "file")
  const fromStdin = boolFlag(flags, "stdin")
  const selected = [content !== undefined, file !== undefined, fromStdin].filter(Boolean).length
  if (selected > 1) {
    throw new CliError("usage", "Use only one of --content, --file, or --stdin")
  }
  if (content !== undefined) return content
  if (file !== undefined) {
    try {
      return readFileSync(file, "utf8")
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new CliError("usage", `Cannot read file: ${file}`, message)
    }
  }
  if (fromStdin) return readFileSync(0, "utf8")
  return ""
}
