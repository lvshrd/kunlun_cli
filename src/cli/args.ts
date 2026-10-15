import { CliError } from "../errors.ts"
import type { Flags } from "./route.ts"

const BOOLEAN_FLAGS = new Set(["stdin", "dry-run", "app-secret-stdin", "help", "no-browser"])

export interface ParsedArgs {
  positionals: string[]
  flags: Flags
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = []
  const flags: Flags = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] ?? ""
    if (token === "--") {
      positionals.push(...argv.slice(i + 1))
      break
    }
    if (!token.startsWith("--")) {
      positionals.push(token)
      continue
    }
    const eq = token.indexOf("=")
    const name = eq === -1 ? token.slice(2) : token.slice(2, eq)
    const inline = eq === -1 ? undefined : token.slice(eq + 1)
    if (!name) throw new CliError("usage", "参数名不能为空")
    if (BOOLEAN_FLAGS.has(name)) {
      if (inline !== undefined && inline !== "true" && inline !== "false") {
        throw new CliError("usage", `--${name} 是开关，不能赋值 ${inline}`)
      }
      flags[name] = inline !== "false"
      continue
    }
    let value = inline
    if (value === undefined) {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("--")) {
        throw new CliError("usage", `--${name} 需要一个值`)
      }
      value = next
      i++
    }
    flags[name] = value
  }
  return { positionals, flags }
}

export function strFlag(flags: Flags, name: string): string | undefined {
  const value = flags[name]
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed === "" ? undefined : trimmed
}

export function boolFlag(flags: Flags, name: string): boolean {
  return flags[name] === true
}
