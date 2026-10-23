import { createInterface } from "node:readline"
import { Writable, type Readable } from "node:stream"
import { CliError } from "../errors.ts"

// Readline 仍处理输入编辑，但隐藏问题的所有终端回显都写入丢弃流。
export function promptValue(label: string, hidden = false, input: Readable = process.stdin, output: NodeJS.WritableStream = process.stderr): Promise<string> {
  return new Promise((resolve, reject) => {
    let showingPrompt = true
    const sink = hidden ? new Writable({ write(chunk, _encoding, callback) {
      if (showingPrompt) output.write(chunk)
      callback()
    } }) : output
    const rl = createInterface({ input, output: sink, terminal: true })
    let settled = false
    const finish = (value?: string) => {
      if (settled) return
      settled = true
      rl.close()
      if (hidden) { output.write("\n"); (sink as Writable).end() }
      if (value === undefined) reject(new CliError("usage", "已取消应用配置，未保存"))
      else resolve(value.trim())
    }
    rl.once("SIGINT", () => finish())
    rl.once("close", () => finish())
    // 让 readline 持有提示文字，避免输入或刷新时把外部 write 的提示擦掉。
    rl.question(label, (value) => finish(value))
    showingPrompt = false
  })
}
