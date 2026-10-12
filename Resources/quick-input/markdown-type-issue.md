## 用户反馈

快速输入只能追加纯文本评论，缺少 Markdown 类型切换入口。用户要求关闭开关时追加原生 Text 评论，开启时追加 Markdown 评论。

## 原因与实现

此前快速输入按已确认的纯文本范围实现，追加路径固定使用 appendTextComment。本轮需求明确扩展为可切换保存类型，不增加富文本编辑器。

原生文档及本地 Frameworks 头文件确认 appendMarkdownComment 接口；评论结构仍为 TextNote，Markdown 由 markdown: true 标识。

- 输入框底部加入带无障碍名称的 Markdown 图标开关，默认关闭。
- 原生提交记录固定正文、类型与提交标识。相同标识不能复用于不同正文或类型。
- 开关与正文共用草稿版本，关闭重开同一卡片可以恢复类型；迟到的旧版本不会覆盖新版本。
- 保存后回读正文和 markdown 标识；类型不符时保留正文并锁定原提交，禁止自动再次追加。
- 宿主缺少 Markdown 接口时，在追加前失败，保留正文，不静默保存为纯文本。
- 未提交、未推送、未发布；当前属于本地实现与验证。

## 本轮验证

- 完整前端 211 项测试通过，快速输入专项 28 项通过。
- 原生模拟通过纯文本、Markdown、接口缺失、类型回读错误、同次重试、非法类型参数和草稿类型恢复。
- 开发页面与原生源码联合模拟通过纯文本及 Markdown 的回执丢失重试、保存失败后核对；各场景仅追加一条评论。
- 真实 MarginNote 的 Markdown 渲染、保存后重开、撤销与重做和键盘交互仍待设备验收。

源码：src/QuickCommentController.js、src/CommentMutations.js、web/src/QuickComment.jsx。
