const app = "cli_aa477531ab78d366"
const redirect = "http://127.0.0.1:19876/callback"
const start = `https://open.fklzl.cnpc.com.cn/open-apis/authen/v1/index?app_id=${app}&redirect_uri=${encodeURIComponent(redirect)}&state=abc`
let url = start
const seen = []
for (let i = 0; i < 6; i++) {
  const response = await fetch(url, { redirect: "manual" })
  const location = response.headers.get("location")
  const text = await response.text()
  seen.push({ status: response.status, url, location, snippet: text.replace(/\s+/g, " ").slice(0, 500) })
  if (!location || response.status < 300 || response.status >= 400) break
  url = new URL(location, url).toString()
}
console.log(JSON.stringify(seen, null, 2))
