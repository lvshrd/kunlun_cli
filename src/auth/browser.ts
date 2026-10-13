import { spawn } from "node:child_process"

export function openBrowser(url: string): void {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref()
    return
  }
  const command = process.platform === "darwin" ? "open" : "xdg-open"
  spawn(command, [url], { detached: true, stdio: "ignore" }).unref()
}
