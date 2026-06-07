# CHANGELOG

## 0.1.6（2026-06-07）

### 优化

- **提取评论为子卡片 — 链接迁移**：提取时自动将其他卡片中指向原卡片的 LinkNote 评论和 Markdown 行内链接，改为指向新建子卡片，避免提取后出现失效链接

## 0.1.5（2026-06-06）

### 优化

- **UndoGroupingHelper**：新增独立模块，封装带操作名称和 note 上下文的 undo 分组，`CommentMutations` 所有操作均通过此模块执行
- **PopupMenuOnNote 按需注册**：`PopupMenuOnNote` 观察者改为随评论面板开/关动态注册与注销；面板未打开时不再响应卡片弹窗事件，命令状态查询不再触发面板同步
- **MNUtils：`refreshAfterDBChanged` trailing debounce**：连续调用改为 trailing debounce + schedule ID 去重，上次刷新 500ms 内的请求延迟 500ms 合并，减少制卡链路中的重复 DB refresh（同步 vendor）
- **MNUtils：`undoGrouping` 嵌套深度计数**：嵌套调用只由最外层触发 `refreshAfterDBChanged`，避免多层嵌套时多次刷新数据库（同步 vendor）

## 0.1.4（2026-06-06，性能补丁）

### 优化

- 同步 MNUtils vendor 的数据库刷新防抖：连续 `refreshAfterDBChanged` 请求改为 trailing debounce，嵌套 `undoGrouping` 由最外层统一刷新，减少被 KnowledgeBase/Toolbar 制卡链路调用时的重复 DB refresh。
- 重新生成 `mn-comment-manager-v0.1.4.mnaddon`，包内 `vendor/mnutils.js` 已包含本次防抖修复。
- `PopupMenuOnNote` 生命周期只在评论管理 HTML 面板打开期间注册；面板未打开时不再监听卡片弹窗，也不会因命令状态查询或普通点卡片触发同步。

## 0.1.4（2026-06-06）

### 新功能

- **HTML 评论转 Markdown**：单卡评论列表新增「转为 Markdown」操作，选中 HTML 评论后可一键将其转换为纯文本 Markdown 评论；批量菜单同步新增「转换 HTML 为 Markdown」，支持多卡片批量处理，转换前显示受影响卡片数和可转换评论数

## 0.1.3（2026-06-03）

### 新功能

- **在线更新清单**：新增 stable-only 远端更新清单生成流程，支持在上传 `.mnaddon` 到 123 网盘直链根目录后生成 `mncommentmanager.json`，供 MNUtils 插件商店按 manifest 自动读取最新版
- **商店更新日志 JSON**：新增 `mncommentmanager_changelog.json` fallback，提供结构化双语更新日志，方便 MNUtils 将日志接入历史版本页
- **批量清空所有评论**：批量菜单新增「清空所有评论」选项，操作前显示受影响卡片数和待删除评论总数，确认后用 `undoGrouping` 批量删除，跳过无评论卡片
- **批量清空所有标题**：批量菜单新增「清空所有标题」选项，操作前显示有标题/无标题卡片数，确认后批量置空 `noteTitle`，跳过已无标题的卡片

### 优化

- **MNUtils 交接文档**：补充 123 网盘直链、`manifestUrl`、`changelogUrl` 和历史日志合并规则，移除 GitHub Releases 作为商店更新源的方案
- **Markdown 行内链接定位支持长按浮窗**：行内链接列表的「⌖ 定位」按钮改为与卡片链接定位一致的长按交互——点按在脑图定位，按住在浮窗定位；新增 `startMarkdownLinkFocusPress` / `finishMarkdownLinkFocusPress` / `cancelMarkdownLinkFocusPress` 三组事件处理，复用 `linkFocusTimers` / `linkFocusLongPressFired` 机制，按键 key 格式为 `markdown:<commentIndex>:<linkIndex>:<startIndex>`
- `.quick-action-btn` 改用 `inline-flex` 布局，`line-height` 改为 `0`，修复图标垂直居中不准的问题
- `.locate-action` 字号提升至 15px，图标视觉尺寸更一致
- `.markdown-link-actions` 新增 `user-select: none` / `-webkit-touch-callout: none`，防止长按触发系统菜单

## 0.1.2（2026-06-03）

### 新功能

- **Markdown 行内链接编辑**：评论体下方展示当前评论中所有 Markdown 行内链接（`[text](url)` 格式），每条链接提供「定位」（⌖）和「编辑」（✎）两个快捷操作；编辑弹窗支持独立修改显示文本与链接地址，实时预览最终 Markdown 语法，Cmd+Enter 确认，Esc 取消
- **快速导航条提升为顶级 bar**：原「快速定位」侧栏区块升级为独立的水平导航条（`quick-nav`），位于状态栏下方，常驻可见；按钮可横向滚动，显示字段分组及条数角标；「批量选择」按钮迁入顶栏 actions 区域，侧栏批量选择区块移除

### 优化

- **批量评论按钮**：
  - 兼容 Native NSArray 类型的 `selViewLst` 和 `focusNotes`，新增 `toArrayLike()` 统一转换
  - 按钮尺寸从 36×36 改为 54×36，文字从「批」改为「评论」
  - 新增 `collectMNPinnerFollowButtonRects()` 自动检测 MNPinner 跟随按钮位置，避让布局冲突
  - `resolveButtonFrame` 位置打分算法纳入与相邻按钮的重叠面积惩罚，新增更多候选位置
  - 底部工具栏关闭时不再直接隐藏按钮，改为 `keepVisibleIfStillMultipleSelection` 重新检测多选状态，保持按钮可见
  - 移除 4 秒自动隐藏逻辑，按钮生命周期完全由多选状态决定
- **`replaceCommentText` 修复**：针对 `LinkNote` 类型评论使用 `comment.type` 判断而非 `"q_htext" in rawComment`，增加空内容保护
- **UI 自适应**：过滤器 tab 仅显示计数 > 0 的类型；移动/处理区块无可用操作时自动隐藏；当前 filter 对应类型清空时自动重置为「全部」；insertMode 无可插入位置时自动退出
- **长按态样式修复**：`comment-inline-actions` 及 `quick-action-btn` 新增 `user-select: none` / `touch-action: none`，阻止长按触发系统文字选择；`.pressing` 类应用到行内定位按钮

### 样式

- `comment-manager` grid 增加一行用于 `quick-nav`
- 顶栏（`.topbar`）支持 `flex-wrap`，高度改为弹性 `min-height`，适配按钮换行
- 新增 `.topbar-title`，限制标题区域宽度并隐藏溢出
- `topbar-actions` 按钮最小尺寸减小（58px/32px），移动端进一步压缩（46px/30px）
- 新增 `.quick-nav` / `.quick-nav-track` / `.quick-nav-item` 完整样式组，含横向滚动、hover 高亮、条数 pill 角标
- 新增 `.markdown-link-list` / `.markdown-link-item` / `.markdown-link-text` / `.markdown-link-actions` 行内链接列表样式
- 新增 `.markdown-link-edit-grid` / `.markdown-link-preview` 编辑弹窗专属样式
- `.link-focus-action` 补充 `touch-action: none` 和 `-webkit-tap-highlight-color: transparent`

## 0.1.1（2026-06-03）

### 新功能

- **批量评论处理**：新增 `BatchCommentActions` 模块，支持多选卡片后触发浮动「批」按钮；当前提供「只保留第一条内容」操作，有摘录的卡片清空所有评论，无摘录的保留第一条，操作前显示影响预览确认弹窗
- **多选事件监听**：插件注册 `mindmapViewOnMultipleSelection` 和 `mindmapViewBottomToolbarClosed` 两个观察者，多选结束或底部工具栏关闭时自动隐藏批处理按钮
- **提取子卡片时可选删除原评论**：`extractCommentsToChildNote` 新增 `removeOriginal` 参数；Web UI 对话框增加复选框「同时删除原卡片中的所选评论」，勾选后提取并同步清理原卡片对应评论

### 优化

- `keepFirstContentForNotes` 内部新增 `noteHasExcerpt` 辅助函数，统一判断卡片摘录是否存在（含代理卡 `note.note` 层）
- 提取子卡片的对话框说明文案精简，去掉「原卡片不会被修改」等过期描述，补充不清理反向链接的提示

### 样式

- 新增 `.dialog-check` 复选框组件样式：grid 布局对齐 checkbox 与说明文字，支持标题（`strong`）+ 描述（`small`）两行结构，使用 `accent-color` 适配系统强调色

## 0.1.0（2026-06-02）[4]

### 样式重构

- **CSS 变量体系全面重命名**：将旧语义变量（`--bg`、`--panel`、`--text`、`--muted`、`--brand` 等）替换为新的分层命名体系（`--bg-app`、`--bg-sidebar`、`--bg-panel`、`--text-primary`、`--text-secondary`、`--accent-blue` 等），亮暗模式均同步更新
- **评论卡片左边框色块**：移除旧 `border-left: 4px solid` 方案，改用 `::before` 伪元素实现，并新增 `comment-kind-*` 类（`image`、`link`、`html`）按评论类型显示不同颜色
- **选中/锚点卡片样式**：`selected` 改用 `--accent-blue-soft` 背景，`range-anchor` 改用橙色系背景，移除旧品牌色描边
- **按钮体系简化**：合并 `.secondary` 与默认按钮样式（均为中性），`.primary`/`.active` 统一为蓝色实心，`.danger` 改为文字色 + 悬停变实心，新增 `.pressing` 轻触态
- **左侧导航栏重构**：使用 `--bg-sidebar` 背景，新增 `::before` 伪元素显示标题「MN Comments」，移除原 h1 标题节点；分段按钮（`.segmented`）和导航项（`.nav-item`）统一为透明底样式，数量角标改为 pill 样式
- **右侧面板重构**：样式变量全部更新；`selection-summary` 改为独立卡片样式；`danger-zone` 标题变红色
- **顶栏 / 状态栏**：改为半透明毛玻璃背景（`rgba + backdrop-filter`）；标题字号从 18px 降为 15px；状态栏字号降为 12px；第三列状态 span 默认隐藏
- **布局网格**：`.workspace` 新增 `grid-template-areas`（`nav main inspector`）；`.comment-manager` 高度改用 `100%` 而非 `100vh`
- **响应式断点调整**：主断点从 979px 上调至 1180px；右侧面板在折叠态改用 flex+滚动，最大高度 38vh；操作区在折叠态按 delete→move→process 顺序重排（`order`）
- **过渡动画统一**：全局 transition 统一为 `--transition`（0.2s spring）变量，移除旧 `--transition-fast`/`--transition-spring`
- **图片样式**：`comment-body img` 从 `.link-summary` 块中移出，作为独立规则，边框颜色改用 `--border-light`

### 新增功能

- **启动错误页**：`main.jsx` 新增全局 `error` / `unhandledrejection` 监听，捕获启动异常后渲染 `.startup-error` 错误页，防止白屏无提示

### 优化

- 面板区段新增语义 class（`move-section`、`process-section`、`delete-section`），支持响应式重排
- `body` 新增 `overflow: hidden`，配合 `html/body/#root` 的 `width/height: 100%` 彻底修复滚动溢出
- `.comment-card` 新增 `contain: layout paint` 提升渲染性能，移除 `will-change: transform`
- `.search-box span` 改为屏幕外隐藏（无障碍标签），输入框去除显式边框，改用背景色区分

---

## 0.1.0（2026-06-02）[3]

### 新功能

- **链接评论摘要展示**：链接类型评论的 comment-body 区域现在展示卡片标题和链接 URL，替代原来仅显示原始文本的方式；新增 `getLinkedNoteDisplay()` 函数统一提取展示数据
- **定位按钮改为符号图标**：行内链接定位按钮从文字「定位」改为符号 `⌖`，并迁移到 `comment-inline-actions` 快捷操作区，新增 `aria-label` 包含目标卡片标题

### 样式

- 按钮默认样式重构：默认按钮改为中性色（`--control-bg` / `--control-text`），原品牌色主色调提取为 `.primary` 类；新增 `--control-bg`、`--control-bg-hover`、`--control-text` CSS 变量并支持暗色模式
- `.button-grid`、`.stack`、`.nav-item` 等容器内按钮统一高度 38px、字号 14px
- 移动控制区（`.move-controls`）按钮独立配色，使用中性色方案
- 禁用按钮样式细化：改用 `--muted` 文字色 + 中性背景，替代简单 `opacity`
- 对话框确认按钮统一加 `.primary` 类，与取消按钮视觉层次更明确
- 新增 `.link-summary` 样式：卡片标题 15px 加粗，URL 以等宽小字（11px）展示
- `.locate-action` 样式重构：品牌色 + 柔色背景，悬停改为内嵌描边效果，移除旧 `.text-action` 类
- 右侧面板（`.right-pane .pane-section`）底部间距调整为 20px
- 危险区按钮最小高度增加到 42px
- 顶栏操作按钮（`.topbar-actions button`）独立规定最小尺寸和字号
- 插入目标按钮（`.insert-target`）字号缩小为 13px，高度调整为 34px

---

## 0.1.0（2026-06-02）[2]

### 新功能

- **长按浮窗定位**：行内链接按钮和底部「定位链接卡片」按钮均支持长按（520ms），在浮窗脑图中定位目标卡片；短按仍在主脑图中定位。文案从「打开」更新为「定位」
- **单条评论长按双向删除**：每条评论的 ×删除按钮支持长按（560ms），触发确认弹窗，同时清理目标卡片中的反向链接
- **导航栏「底部」按钮**：新增一键滚动到评论列表底部的快捷按钮

### 优化

- 监听 `PopupMenuOnNote` 事件，右键菜单弹出时自动同步面板内容，避免面板数据过期
- 快照推送引入序列号防抖机制，快速连续触发时只执行最后一次，消除竞态
- 插件标题改回英文「MN Comment Manager」（上一版改为中文后回滚）

### 样式

- 按住定位/删除按钮时显示 `pressing` 视觉反馈（边框高亮 + 轻微缩放）
- 窄屏布局（≤720px）右侧面板不再隐藏，改为折叠到左侧面板正下方

---

## 0.1.0（2026-06-02）

### 新功能

- **生成行内链接**：新增「生成行内链接」功能，支持将连续选中的文本评论和卡片链接评论，通过可视化编辑器合并为一条带行内链接的 Markdown 评论。

### 交互优化

- 插件标题从英文 "MN Comment Manager" 统一改为中文「评论管理器」（面板标题、导航栏、页面 title、mnaddon.json 均已更新）
- 状态栏消息支持更新动画（`pulseStatus`），每次操作完成后消息有轻微脉冲提示
- 所有错误和操作提示文案改为更自然的中文表达，去掉生硬的"请……"句式
- 「置顶」/「置底」按钮更名为「移到最上方」/「移到最下方」，语义更清晰
- 「原样提取」更名为「提取为子卡片」，对话框文案同步更新
- 「定位链接」更名为「打开链接卡片」，评论行内的「定位」按钮同步改为「打开」
- 「合并文本评论」对话框标题更名为「合并为一条评论」
- 筛选区块标题「筛选」改为「查找」，选择区块「选择」改为「批量选择」
- 字段目录区块「字段目录」改为「快速定位」
- 右侧操作区「编辑」改为「处理」
- 清空选中按钮「清空」改为「取消选择」，范围选择按钮「范围」改为「选范围」
- 空列表提示区分「当前卡片还没有评论」和「没有匹配的评论」两种状态
- 评论卡片的「层」标签（stage-pill）已移除，减少视觉噪音
- 图片评论改用 `loading="lazy"` 延迟加载
- 类型标签「图片手写」→「图片+手写」，「合并图片手写」→「合并图片+手写」

### 样式升级

- 新增暗色模式支持（`@media (prefers-color-scheme: dark)`），色板参考 Apple HIG 暗色规范
- 新增 `prefers-reduced-motion` 支持，禁用所有动效
- 引入统一动效系统：`fadeIn`、`slideUp`（评论卡片入场）、`pulseStatus`（状态栏）
- 按钮新增悬停上浮（`translateY(-1px)`）和点击下压（`translateY(1px) scale(0.98)`）反馈
- 评论卡片悬停新增阴影和轻微上浮效果，选中状态改用焦点光晕（`box-shadow: 0 0 0 2px var(--focus)`）
- 类型标签和方向标签统一改为胶囊形（`border-radius: 999px`），字号降至 11px
- 新增 720px 断点，窄屏隐藏右侧操作面板；优化 979px 响应式布局为三栏保持模式
- 工作区列宽改用 `clamp()` 自适应缩放
- 区块标题新增 `text-transform: uppercase` + `letter-spacing`
- 搜索框、对话框输入框新增聚焦高亮（品牌色边框 + 柔色光晕）
- 对话框背景新增毛玻璃效果（`backdrop-filter: blur(8px)`）
- 快捷移动按钮（上/下箭头）改为轮廓样式，悬停时缩放变色
- `Button` 组件支持透传 `...props`，增加扩展性
