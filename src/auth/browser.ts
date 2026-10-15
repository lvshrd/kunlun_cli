import { spawn, type ChildProcess } from "node:child_process"

export function shouldOpenBrowser(openBrowserFlag = true): boolean {
  if (!openBrowserFlag) return false
  if (process.env.KUNLUN_NO_BROWSER === "1") return false
  if (process.env.SSH_CONNECTION || process.env.SSH_TTY) return false
  return true
}

/** Windows：用 rundll32 把完整 URL 交给系统默认浏览器，不会被 cmd/ps 截断 &。 */
export function windowsBrowserSpawn(url: string): { command: string; args: string[] } {
  return { command: "rundll32.exe", args: ["url.dll,FileProtocolHandler", url] }
}

export function spawnDetached(command: string, args: string[]): ChildProcess {
  return spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true })
}

export function openBrowser(url: string): boolean {
  try {
    if (process.platform === "win32") {
      const { command, args } = windowsBrowserSpawn(url)
      spawnDetached(command, args).unref()
      return true
    }
    const command = process.platform === "darwin" ? "open" : "xdg-open"
    spawnDetached(command, [url]).unref()
    return true
  } catch {
    return false
  }
}
