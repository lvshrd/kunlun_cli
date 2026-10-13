import { printOk } from "../output/envelope.ts"
import { version } from "../version.ts"
import { apiRoutes } from "./commands/api.ts"
import { authRoutes } from "./commands/auth.ts"
import { configRoutes } from "./commands/config.ts"
import { doctorRoutes } from "./commands/doctor.ts"
import { docsRoutes } from "./commands/docs.ts"
import type { Route } from "./route.ts"

export function allRoutes(): Route[] {
  return [
    ...configRoutes(),
    ...authRoutes(),
    ...doctorRoutes(),
    ...apiRoutes(),
    ...docsRoutes(),
    {
      path: ["version"],
      summary: "显示版本",
      run: async () => {
        printOk({ version })
      },
    },
  ]
}
