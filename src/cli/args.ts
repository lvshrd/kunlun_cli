import { CliError } from "../errors.ts"
import type { Flags } from "./route.ts"

const BOOLEAN_FLAGS = new Set(["stdin", "dry-run", "app-secret-stdin", "help", "version", "no-browser", "force", "raw", "all", "exact"])

export interface ParsedArgs {
  positionals: string[]
  flags: Flags
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = []
  const flags: Flags = {}
  for (let i = 0; i < argv.length; i++) {
    let token = argv[i] ?? ""
    if (token === "--") {
      positionals.push(...argv.slice(i + 1))
      break
    }
    if (token === "-v") token = "--version"
    else if (token === "-h") token = "--help"
    else if (/^-[^-]/.test(token)) {
      throw new CliError("usage", `Unsupported short option: ${token}`, "Use -v / --version for the version or -h / --help for help. Use --content=<text> for content that looks like an option.")
    }
    if (!token.startsWith("--")) {
      positionals.push(token)
      continue
    }
    const eq = token.indexOf("=")
    const name = eq === -1 ? token.slice(2) : token.slice(2, eq)
    const inline = eq === -1 ? undefined : token.slice(eq + 1)
    if (!name) throw new CliError("usage", "Option names must not be empty")
    if (Object.hasOwn(flags, name)) throw new CliError("usage", `Option --${name} must not be repeated`, "Pass multiple scopes in a single --scope value, separated by spaces.")
    if (BOOLEAN_FLAGS.has(name)) {
      if (inline !== undefined && inline !== "true" && inline !== "false") {
        throw new CliError("usage", `--${name} is a boolean option; invalid value: ${inline}`)
      }
      flags[name] = inline !== "false"
      continue
    }
    let value = inline
    if (value === undefined) {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("--")) {
        throw new CliError("usage", `--${name} requires a value`)
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
