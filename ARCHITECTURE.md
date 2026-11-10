# 架构

本机 Agent 通过 Shell 调用 kunlun-cli；CLI 管理配置、凭证和业务动作，以 JSON 返回结果。用户身份与 bot 身份分开，业务默认本人身份。当前没有“小惠”聊天执行入口或多用户托管服务。

```text
Agent + 已安装的 Skill
        ↓ Shell / JSON
src/cli → src/domain → src/client → 昆仑开放平台
                 ↘ src/auth + src/config
```

| 目录 | 职责 |
| --- | --- |
| src/cli | 路由、参数、帮助和 stdout 信封 |
| src/domain/docs | 搜索、读取、块转换、三类表格创建/嵌入及原生单元格文字读写 |
| src/domain/sheets、src/domain/bitable | 电子表格及 Base 适配器；复用 table-common 的分页和写入结果不明处理 |
| src/client | 同源 HTTP、超时、上游错误翻译 |
| src/auth、src/config | 身份授权、scope、刷新及本机配置 |
| skills | 随程序分发的文档、表格及共享鉴权 Agent Skill 源码；安装到 Agent 的实际发现目录 |
| scripts | 构建、包白名单、交付物、Windows 安装及离线验收 |
| docs | 开发、路线、接口依据和验收；archive 保留早期探活分析 |
| dist、release | 编译 JS / 交付目录，均为忽略的生成物 |

源码为 TypeScript；build 清理 dist、编译并重写相对导入扩展名，排除测试。bin 指向 dist/main.js。CLI 从仓库或已安装包根目录的 skills 读取技能，默认安装拒绝覆盖。

程序安装与本机配置独立。默认配置 ~/.kunlun-cli，KUNLUN_CONFIG_DIR 可隔离多应用；环境变量优先。更换应用或端点清理旧 session。应用 Secret 与用户 token 均不参与打包；当前文件存储尚未使用系统密钥链。

scope 集合由 src/auth/scopes.ts 随版本维护；登录前校验，错误提示不能扩大授权。应用权限、本人授权和资源权限分别生效；本地权限目录不代表后台实时状态。原始 api 目前仍可执行，限制为开发者模式是待办。

新增能力在 domain 封装，在 cli/commands 注册并更新 Skill；不让 domain 打印传输信封。后续薄 MCP 复用业务层和鉴权。

构建、包内容、人工试用和发布步骤统一见 [开发指南](docs/DEVELOPMENT.md)。
