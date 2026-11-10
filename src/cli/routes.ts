import { printOk } from "../output/envelope.ts"
import { version } from "../version.ts"
import { apiRoutes } from "./commands/api.ts"
import { authRoutes } from "./commands/auth.ts"
import { configRoutes } from "./commands/config.ts"
import { doctorRoutes } from "./commands/doctor.ts"
import { docsRoutes } from "./commands/docs.ts"
import { skillsRoutes } from "./commands/skills.ts"
import type { Route } from "./route.ts"
import { CliError } from "../errors.ts"

export function allRoutes(): Route[] {
  return [
    ...configRoutes(),
    ...authRoutes(),
    ...doctorRoutes(),
    ...apiRoutes(),
    ...docsRoutes(),
    ...skillsRoutes(),
    {
      path: ["version"],
      summary: "显示版本",
      run: async (invocation) => {
        if (invocation.rest.length || Object.keys(invocation.flags).length) throw new CliError("usage", "version 不接受额外参数", "运行 kunlun-cli -v 或 kunlun-cli --version 查看版本")
        printOk({ version })
      },
    },
  ]
}
