# Markdown 类型切换与背景淡出

日期：2026-10-12。

## 当前行为

输入框底部新增 Markdown 图标开关；没有历史偏好时默认为关闭，之后沿用最近一次选择。关闭时调用原生 appendTextComment，开启时调用原生 appendMarkdownComment。输入仍采用普通文本框，切换类型不会修改正文，也不加载富文本编辑器。

Markdown 偏好通过原生 NSUserDefaults 保存，成功提交、切换卡片及重新打开输入框后沿用最近一次选择。重新打开已有可编辑草稿时保留正文，并采用最新偏好；结果不明确的提交继续使用原类型。此行为替代此前新会话恢复为纯文本的规则。偏好记忆的验证与新测试包见 `remember-markdown.md`。

背景遮罩采用独立图层，通过透明度关键帧与输入框同时退场。定向动画持续 680 毫秒，无效目标采用 420 毫秒，减少动态效果采用 120 毫秒。保存失败不会播放退场动画。

保存成功后的“评论已添加”浮层提示已经移除。失败提示和关闭失败恢复继续保留。

## 数据保护

提交记录固定正文、Markdown 标识和提交标识。相同提交标识不能用于不同正文或类型；保存结果不明确时锁定开关与正文，重试继续使用原记录。

原生保存完成后回读正文及 Markdown 标识，前端再核验回执类型。类型不符时保留正文并提供核对入口；宿主缺少 Markdown 追加接口时，在写入前报告失败，不替换为纯文本。

正文和类型共用草稿版本，旧版本回写不覆盖最新选择，关闭快照包含正文与类型。

## 类型切换与背景淡出阶段验证

- 完整前端测试：16 个文件、211 项通过，快速输入专项为 28 项。
- 原生快速输入、评论编辑刷新、运行时隔离及浮动按钮模拟检查通过。
- 纯文本和 Markdown 的原生追加、类型回读、接口缺失、同次重试、非法参数及草稿恢复检查通过。
- 开发页面及最终生产页面的背景逐帧检查通过，桌面、手机及深色布局各记录 43 帧。生产页面遮罩透明度从 1 连续下降，中段约为 0.475，结束时为 0。
- 浏览器与原生源码联合模拟通过纯文本、Markdown 的未送达重试、成功回执丢失重试、保存失败后的核对，各场景仅追加一条评论。乱序草稿回写后重开保留最终正文与 Markdown 选择。
- 最终生产页面布局覆盖手机、平板、桌面、低高度、深浅主题和减少动态效果，按钮触摸区域检查通过。
- 隔离生产构建通过；安装包压缩完整性、25 个 JavaScript 文件语法、源码一致性、Markdown 接口及成功提示移除检查通过。

记录保存在 `markdown-and-backdrop-review/`。测试安装包为 `dist/mn-comment-manager-v0.1.25-quick-input-markdown-preview.mnaddon`，包体 647798 字节，SHA-256 为 `164dea3a207356b939d102878f171449a3d8975f66a5bb7a486515689c6a4d4c`。版本保留 0.1.25，未提交、未推送、未发布。

## 接口依据与待验收

本轮通过可用文档工具读取 [MbBookNote](https://mn-docs.museday.top/reference/marginnote/mb-book-note/) 和 [NoteComment](https://mn-docs.museday.top/reference/marginnote/note-comment/)，并核对本地 Frameworks/JSBMbBookNote.h。纯文本和 Markdown 都属于 TextNote，Markdown 通过 markdown: true 标识。

[Issue #68](https://github.com/xkwxdyy/MNCommentManager/issues/68) 已追加背景淡出与成功提示移除记录；[Issue #69](https://github.com/xkwxdyy/MNCommentManager/issues/69) 跟踪评论类型切换。问题保持开放，真实 MarginNote 的 Markdown 渲染、保存后重开、撤销与重做、键盘交互及背景合成仍待设备验收。
