import { CliError } from "../errors.ts"
import { printErr, printOk } from "../output/envelope.ts"
import { boolFlag, parseArgs } from "./args.ts"
import type { Route } from "./route.ts"
import { allRoutes } from "./routes.ts"
import { version } from "../version.ts"

export async function run(argv: string[]): Promise<number> {
  try {
    const parsed = parseArgs(argv)
    if (boolFlag(parsed.flags, "version")) {
      printOk({ version })
      return 0
    }
    const routes = allRoutes()
    if (parsed.positionals.length === 0 || parsed.positionals[0] === "help" || boolFlag(parsed.flags, "help")) {
      const prefix = (parsed.positionals[0] === "help" ? parsed.positionals.slice(1) : parsed.positionals).join(" ")
      const related = routes.filter((route) => route.path.join(" ") === prefix || route.path.join(" ").startsWith(`${prefix} `))
      if (prefix && related.length === 0) throw new CliError("usage", `Unknown command: ${prefix}`, "Run kunlun-cli --help to view commands")
      process.stdout.write(formatHelp(prefix ? related : routes))
      return 0
    }
    const matched = matchRoute(routes, parsed.positionals)
    if (!matched) {
      const prefix = parsed.positionals.join(" ")
      const related = routes.filter((route) => route.path.join(" ").startsWith(`${prefix} `) || route.path.join(" ") === prefix)
      const shorter = related.some((route) => route.path.length > parsed.positionals.length)
      if (related.length > 0 && shorter) {
        process.stdout.write(formatHelp(related))
        return 0
      }
      throw new CliError("usage", `Unknown command: ${prefix}`, "Run kunlun-cli help to view commands")
    }
    await matched.route.run({ flags: parsed.flags, rest: matched.rest })
    return 0
  } catch (err) {
    printErr(err)
    return err instanceof CliError ? err.exitCode : 1
  }
}

export function formatHelp(routes: Route[]): string {
  const width = Math.max(...routes.map((route) => route.path.join(" ").length))
  const lines = [
    `kunlun-cli ${version}`,
    "",
    "Usage:",
    "  kunlun-cli <command> [arguments]",
    "",
    "Commands:",
    ...routes.map((route) => `  ${route.path.join(" ").padEnd(width)}  ${route.summary}`),
    "",
    "Examples:",
    "  kunlun-cli skills install --dir .cursor/skills",
    "  kunlun-cli config init",
    "  kunlun-cli auth scopes",
    "  kunlun-cli auth login",
    "  kunlun-cli docs template --output ./procedure.md",
    '  kunlun-cli docs create --title "Procedure" --file ./procedure.md --dry-run',
    '  kunlun-cli docs create --title "Procedure" --file ./procedure.md',
    "  kunlun-cli docs read --document <document_id>",
    '  kunlun-cli docs search --query "Procedure"',
    '  kunlun-cli docs read --name "Exact document title"',
    "  kunlun-cli sheets read --spreadsheet <token> --range <sheet-id!A1:C20>",
    "  kunlun-cli bitable tables --app <token> --all",
    "",
    "Flags:",
    "  -h, --help       Show help",
    "  -v, --version    Show the version",
    "",
    "Notes:",
    "  Use help [command] for command help, or version to show the version.",
    "  Pass long content through a UTF-8 file with --file.",
    "  Document and table writes modify cloud data unless --dry-run is set.",
    "  Configuration and sessions are stored in ~/.kunlun-cli by default.",
    "  Business commands use --as user by default; --as bot selects application identity explicitly.",
    "",
  ]
  return lines.join("\n")
}

function matchRoute(routes: Route[], positionals: string[]): { route: Route; rest: string[] } | undefined {
  const ranked = [...routes].sort((a, b) => b.path.length - a.path.length)
  for (const route of ranked) {
    if (route.path.every((segment, index) => positionals[index] === segment)) {
      return { route, rest: positionals.slice(route.path.length) }
    }
  }
  return undefined
}
