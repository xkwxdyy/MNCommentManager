# CHANGELOG

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
