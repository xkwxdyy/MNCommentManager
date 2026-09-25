# MarginNote 插件开发规则（AI 必读）

## 总则

- 本目录是 MarginNote 插件开发项目。除 `web/` 目录外，运行环境与前端 / Node 不同，不要按浏览器假设做实现。
- 保持谨慎：把每次输出当作“尝试”，先验证再扩展；优先小步改动、可回滚。

## 文档查阅与证据

- 仅在本次改动涉及不确定的 MarginNote 原生 API 或 JavaScriptCore 行为时查阅对应文档；纯文案、CSS、普通 WebView 逻辑和规则文本维护不触发原生文档加载。
- 先检查相关本地实现、`Frameworks` 头文件和现有测试；需要文档时使用可用的 mn-docs MCP，或查阅 https://mn-docs.museday.top 的相关章节。已核实且未变化的内容在同一任务中复用，无需固定先读两篇概览。
- MCP 缺失不阻塞已有证据支持的工作；仅在任务确实需要且其他证据不足时处理文档接入。
- 不猜测未知 API 的形状或副作用。查证后仍缺少决定性证据时，只暂停依赖它的部分，继续独立工作，并向用户提出一个具体问题。

## 运行时与能力差异（不要按前端思维）

- 插件运行在 JavaScriptCore 环境：没有浏览器的 `window`、`document`、`fetch`、`localStorage`、`setTimeout`、`setInterval` 等。
- 网络请求不要用 `fetch`：按文档使用系统导出的网络 API（如 NSURLConnection 相关）与回调，响应体常见为 `NSData`。
- 环境无 Base64 解码等常用工具；涉及 `NSData` 转文本或 JSON 时，严格按文档做，不要自行臆断可用 API。

## 结构与加载规则（强制）

- `main.js` 只做入口与导入：只允许在 `main.js` 调用 `JSB.require(...)`，且只允许使用 `JSB.require(...)`，不得使用 `require` 或 `import`。`JSB.require(...)` 的引入进入全局作用域，作用于所有脚本。
- 不要在 `main.js` 里定义业务函数或方法；所有实现放到独立文件，再由 `main.js` 通过 `JSB.require(...)` 导入。
- 除 `main.js` 外，任何文件禁止调用 `JSB.require(...)`，避免重复或污染全局导入行为。
- 优先用 ES6 语法（除非与运行时不兼容）；保持文件职责单一，不要把 UI、数据、命令处理混在一起。
- MarginNote 插件共享同一全局上下文，所有可能暴露到全局的标识符必须使用插件级前缀，或放入 IIFE 闭包避免泄漏。

## 全局与入口对象要点

- 入口通常是 `JSB.newAddon=function(mainPath){...}`，并返回插件实例。
- `self` 仅在实例方法内可用，代表当前插件实例；不要在模块顶层假设 `self` 存在。
- 常用全局注入对象以文档为准：`JSB`、`Application`、`Database`、`Note`、`UndoManager` 等；不确定就先查文档再用。

## 需求澄清

- 先从上下文、现有入口、配置和代码推断需求。明确且可逆的局部任务直接执行。
- 仅当无法推断的信息会实质改变产物、范围或安全性时，先问一个关键问题；回答后简短复述并继续，不追加确认回合。
- 已授权按假设继续时说明假设即可；外部写入、发布、破坏性操作仍需相应授权。

## 调试与验证

- 日志统一用 `console.log`，不要用 `JSB.log`。
- 构建无语法校验功能；改动后至少做一次人工检查（重新阅读代码）。

## Web 页面

- `web/` 目录下是 React 项目，通过 Vite 构建，作为面板嵌入 MarginNote。
- `web/` 里的代码运行在浏览器 WebView 环境中，可以使用 React、DOM、`window`、`document` 等前端能力；`src/` 里的插件代码运行在 JavaScriptCore 环境中，不要混用两边 API。
- 前端页面与插件层通过 bridge 通信，前端统一从 `web/src/lib/mnBridge.js` 引入 `MNBridge` 并调用 `MNBridge.send(command, payload)`。
- 新增 bridge 命令时：
  - 前端页面只负责按约定发送 `command`
  - 插件侧在 `src/WebBridgeCommands.js` 中添加同名命令函数
- 不要在前端页面里直接假设可以访问 MarginNote 原生对象，如 `Application`、`Database`、`Note`、`JSB`；这类能力只能在 `src/` 里的插件脚本中使用。
- 不要修改 `src/web-dist/`，而应当修改 `web/` 目录下的文件。

## Web 持久化规则（强制）

- WebView 前端不是业务数据真源；用户数据、插件配置、导入导出预设、API Key、任务/收藏/映射关系等持久化数据必须通过 bridge 交给 `src/` 插件层保存。
- 在 MarginNote WebView 中，`localStorage` 不能作为长期存储。它可能在某些加载方式下跨页面保留，但受 origin、文件路径、WebView 生命周期、插件更新或重装影响，不能承担长期可信的数据边界。
- `web/` 中禁止把业务数据写入 `localStorage`、`sessionStorage`、`indexedDB`、`CacheStorage` 或 Service Worker 缓存；这些最多用于可丢失的 UI 状态，如当前 tab、折叠状态、搜索草稿。
- 小型开关、面板显示状态、窗口 frame、最近模式优先用 `NSUserDefaults`，key 必须带插件级前缀。
- 结构化数据、列表、导出预设、用户生成内容优先保存到 `Application.sharedInstance().documentPath + "/<AddonId>/"` 下的 JSON 文件。
- 临时上传、分块传输、中间文件放到 `Application.sharedInstance().tempPath + "/<AddonId>/"`，完成后校验并移动到 `documentPath`。
- JSON 文件读写优先使用 `NSJSONSerialization` + `NSData.writeToFileAtomically(path, true)`；读取时处理空文件、非法 JSON、schema 版本迁移和默认值兜底。
- 写 `NSUserDefaults` 时不要传 `undefined`、`null`、函数、循环对象或未验证的 Native 对象；结构化小对象优先 `JSON.stringify` 后保存字符串，读取时 `JSON.parse` 兜底。
- 新增 Web 持久化需求时，先在 `src/WebBridgeCommands.js` 增加命令，再在插件侧存储模块实现读写，Web 侧只能调用 `MNBridge.send(command, payload)`。
- 如果历史版本已经使用 `localStorage` 保存业务数据，只允许做一次性迁移：读取 allowlist key，发 bridge 写入 Native，成功后清理旧 key；迁移后不得继续双写。

## Bug Issue 自动跟踪

- Bug 反馈、回归和修复默认创建或复用 GitHub Issue，并记录根因、改动、验证与待验收项；用户已给予持续授权，无需逐次确认。
- 本目录是独立仓库 `xkwxdyy/MNCommentManager`。先查本仓库及父仓库 `xkwxdyy/MN-Addons` 的相关历史，已有跨插件 Issue 优先关联，不重复建单。
- 在当前 MNAddon 工作区使用 `../.agents/skills/github-issue-tracker/SKILL.md`；独立检出时沿用本节规则并使用 gh。推送、发布与其他外部沟通不在自动 Bug 跟踪授权中。
- 收尾提供 Issue 链接；网络失败保存草稿并明确报告。历史测试与本次测试分开，未完成真机验收保持开放，关闭需对应授权与完整证据。
