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
      const prefix = parsed.positionals.join(" ")
      const related = routes.filter((route) => route.path.join(" ") === prefix || route.path.join(" ").startsWith(`${prefix} `))
      process.stdout.write(formatHelp(prefix && related.length ? related : routes))
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
    "用法：kunlun <命令> [参数]",
    "",
    ...routes.map((route) => `  ${route.path.join(" ").padEnd(width)}  ${route.summary}`),
    "",
    "示例：",
    "  kunlun skills install --dir .cursor/skills",
    "  kunlun config init",
    "  kunlun auth login --scope docx:document",
    "  kunlun docs template --output .\\操作文档.md",
    "  kunlun docs create --title 操作文档 --file .\\操作文档.md --dry-run",
    "  kunlun docs create --title 操作文档 --file .\\操作文档.md",
    "  kunlun docs read --document <document_id>",
    "",
    "--version 查看版本；--help 查看帮助；长正文用 --file 传入 UTF-8 文件。",
    "写入命令去掉 --dry-run 后会真实修改云端；配置和登录态保存在当前用户的 ~/.kunlun-cli。",
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
