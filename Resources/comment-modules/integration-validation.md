# 模块化正式接入验证

日期：2026-10-11。当前阶段已完成模块化及双指滑动的正式面板源码接入，真实 iPad 与 MarginNote 验收留待后续；iPad 连接排障仍暂缓。

## 已实现行为

- 顶栏新增模块划分图标。配置窗口支持 HTML、Markdown、HtmlMD、嵌套与指定文本方案，匹配方式、标题级别、全局默认、单卡片覆盖与恢复默认。
- 完整评论列表先计算边界，再进行搜索与类型筛选。未分组、空模块、重复标题与子模块保留独立结构；原有评论编辑与内容渲染入口保留。
- 文件夹仅控制当前页面的模块显隐；整组选择包含子级及筛选隐藏成员。仅正文模式排除当前模块和全部子模块的结构标题。
- 模块全选后，复选框前出现评论折叠箭头。混合状态先统一折叠，全部折叠时统一展开，模块外选区保持原样。沿用宿主每次最多 200 条批注的限制。
- 同级模块移动包含标题和子模块。正文移动到其他模块末尾，并保持正文原有顺序。提取支持复制或移除原内容，并提供结果定位入口。
- 插件侧保存 `comment-modules.json`，采用原子写入和回读校验。配置损坏时保留原文件并阻止覆盖；设置保存失败时保留界面草稿。
- 移动和提取前，插件侧重新计算结构并校验配置版本及评论内容摘要。过期操作被拒绝，面板重新读取卡片。

- 双指纵向滑动选择当前呈现的评论，包含实际评论标题卡片，但不触发模块容器的整组选择。起点未选时增选，起点已选时取消选择；范围回缩依据开始前的选区计算，范围外选择和原生摘录选择保留。
- 双指中心纵向位移达到 12 像素且超过横向位移后识别手势，边缘 36 像素区域自动滚动。单指保留原生滚动；捏合、额外触点、系统接管、弹窗打开或列表变化取消手势，卡片切换不恢复旧卡片的评论序号。支持按 Escape 取消活动手势。
- Markdown 正文与折叠摘要缓存完整渲染对象，使选区更新保持触摸节点连接。演示和正式页面复用同一手势实现。

## 验证证据

模块规则、原生 JSON 模拟与操作校验的 14 项 Node 测试通过；前端完整 158 项测试通过，其中模块交互专项 15 项、正式手势专项 15 项。独立演示的 31 项 Node 测试、15 项 React 测试与 25 项浏览器回归通过，其中共用手势规则测试为 16 项。模块原生模拟和演示合并共 45 项 Node 测试通过。既有原生折叠、工作流配置、工作流未保存草稿、异步操作生命周期、Bridge 错误关联、运行时依赖、摘录转换与 Markdown 回归检查在此前接入阶段通过，本次审查未重新运行上述原生检查。

正式网页隔离构建和 Safari 11 目标的 IIFE 隔离构建通过。普通构建仍提示既有主资源超过 500 kB，未修改构建资源或生成安装包。

Chromium 使用生产构建资源及独立模拟 Bridge，完成桌面、窄屏、短窗口、长列表、固定底部操作区、配置切换、评论折叠、模块显隐、键盘关闭与焦点恢复，以及深色显示检查，页面无脚本错误。尺寸覆盖 1200×800、935×609、600×360、375×480、320×360；375×480 另外检查深色模式。985×1000 另外使用触屏环境检查。正式浏览器共完成 7 组尺寸与主题检查，以及 12 项可信多点触摸模拟检查，覆盖增选、取消选择、范围回缩、捏合、列表外额外触点、弹窗和卡片切换中断、边缘自动滚动、单指滚动、筛选可见项、系统取消、抬手后的键盘选择，以及顶栏选区操作结束当前手势。结果与截图位于 `dist/comment-modules-integration-checks/`。

## 本次审查与修复

- 手势现通过文档捕获结束和取消事件；窗口失焦、页面隐藏及页面离开恢复原有选区并停止边缘滚动。动画帧和抬手时检查禁用状态及列表连接状态，避免缺少后续移动事件时仍保留临时选区。
- 取消后的触点必须全部抬起后才能重新开始。抬手阶段核对触点身份；丢失释放事件后，新的单指接触可以恢复识别。
- 顶栏或键盘明确修改选区时结束手势，后续移动、动画帧、抬手和取消不覆盖新选区。手势后的模拟点击拦截保留，键盘激活恢复可用。
- 模块配置回执在成功提示和快照处理之前校验。保存标识必须为布尔值 `true`，配置版本和完整内容必须符合提交结果；异常保留草稿并显示错误。

手势中断与选区覆盖跟踪 [Issue #60](https://github.com/xkwxdyy/MNCommentManager/issues/60)，保存回执提示跟踪 [Issue #61](https://github.com/xkwxdyy/MNCommentManager/issues/61)。问题正文副本分别为 `gesture-hardening-issue.md` 和 `settings-receipt-issue.md`。生命周期事件由自动测试模拟，可信多点触摸由 Chromium 输入模拟；真实设备及宿主验收仍待完成。

## 复验命令

```sh
npm run test:comment-modules
npm run test:comment-gesture
node node_modules/vitest/vitest.mjs run web/src
node node_modules/vite/bin/vite.js build --config web/vite.config.js --outDir /tmp/mncommentmanager-module-integration
node node_modules/vite/bin/vite.js build --config web/vite.release.config.js --outDir /tmp/mncommentmanager-module-release
MN_MODULE_DEMO_PLAYWRIGHT=/Users/xiakangwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright node scripts/check-comment-module-panel.mjs
```

修改共享规则 `web/src/lib/commentModules.mjs` 后，运行 `node scripts/sync-comment-module-rules.mjs` 更新原生对应文件。测试命令检查生成结果是否一致。

Markdown 触摸中断已记录为 [Issue #59](https://github.com/xkwxdyy/MNCommentManager/issues/59)，真机验收前保持开放。

## 待宿主验收

真实 MarginNote 尚未验收模块配置保存后重开与重启、引用卡评论归属、同级移动及正文移动、提取后定位，以及评论修改的撤销和重做。双指选择的真机识别、系统滚动接管、捏合冲突与 MarginNote 宿主手势仍待验收。原生模拟和浏览器检查不能替代宿主结论。

本阶段未提交、推送或发版。既有独立演示保留原入口和模拟数据服务，启动说明位于 `web/demos/comment-modules/README.md`。
