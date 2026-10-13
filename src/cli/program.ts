import { CliError } from "../errors.ts"
import { printErr } from "../output/envelope.ts"
import { boolFlag, parseArgs } from "./args.ts"
import type { Route } from "./route.ts"
import { allRoutes } from "./routes.ts"
import { version } from "../version.ts"

export async function run(argv: string[]): Promise<number> {
  try {
    const parsed = parseArgs(argv)
    const routes = allRoutes()
    if (parsed.positionals.length === 0 || parsed.positionals[0] === "help" || boolFlag(parsed.flags, "help")) {
      process.stdout.write(formatHelp(routes))
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
      throw new CliError("usage", `未知命令：${prefix}`, "运行 kunlun help 查看命令")
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
    `kunlun ${version}`,
    "",
    "用法：node src/main.ts <命令> [参数]",
    "",
    ...routes.map((route) => `  ${route.path.join(" ").padEnd(width)}  ${route.summary}`),
    "",
    "示例：",
    "  node src/main.ts config init --app-id cli_xxx --app-secret-stdin",
    "  node src/main.ts auth login",
    "  node src/main.ts docs create --title 周报 --file .\\周报.md",
    "  node src/main.ts docs read --document <document_id>",
    "",
    "新增办公能力时，在 src/domain 实现接口，在 src/cli/commands 增加命令，并注册到 src/cli/routes.ts。",
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
