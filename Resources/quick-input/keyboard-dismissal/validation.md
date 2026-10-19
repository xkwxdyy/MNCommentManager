# 快速输入框层级与键盘收起修复

日期：2026-10-13。用户已确认仅修改 MN Comment Manager，反馈中的 MN4、MN5 指同一应用中的界面切换。此次未修改 MNPinner。

## 改动与接口

快速输入框依据脑图与阅读内容所属的直接子视图定位，插入到内容上方，保留宿主覆盖视图的顺序；首次打开和重复打开不再强制置顶。打开与显示完成时记录输入视图、父视图链及同级视图的 alpha、图层透明度、zPosition 和 frame。日志不包含评论正文。

原生控制器监听 UIKeyboardWillShowNotification、UIKeyboardWillHideNotification 与 UIKeyboardDidHideNotification。软键盘必须属于当前窗口、当前屏幕和输入 WebView；前端再次检查输入与会话归属。旋转引起的尺寸变化、其他窗口、窗口失焦、普通控件焦点切换以及仅外接键盘附加栏不会直接关闭输入框。

现有 closeQuickComment 请求可携带 reason: "keyboard"、eventId 和 reducedMotion。原生层校验当前键盘事件，使用通知中的剩余动画时长、曲线及经过坐标转换的下移量；无法取得位移或启用减少动态效果时，使用渐隐。前端关闭快照保留中文组词正文与 Markdown 模式，关闭期间冻结布局；失败时恢复原编辑状态。保存成功继续执行原有退场，保存结果待核对时保留提交记录。旧通知和重复事件不能关闭新窗口，控制器关闭与插件停用时移除监听。

## 基线与文件位置

原工作目录存在同步冲突，快速输入原生测试因正式设置模块缺少 getQuickCommentMarkdown 而无法启动。为保护无关内容，独立工作目录以已发布 v0.1.26 的提交 6a2dde2f0eb64953508ac6ea046c92ccdad5f064 为基线；完整原生基线测试已通过。

源码保存在当前聊天所附工作目录：

`/Users/xiakangwei/.codex/worktrees/quick-input-keyboard/mncommentmanager`

修改包含 src/QuickCommentController.js、web/src/QuickComment.jsx、web/src/QuickComment.test.jsx 与 scripts/test-quick-comment-keyboard.js。补丁另存为 implementation.patch，仅包含上述源码与测试。本次未覆盖原工作目录的业务源码、同步冲突副本或无关改动，未修改工作目录中的 src/web-dist。

## 本次验证

- 完整前端：16 个文件、220 项测试通过，快速输入专项为 37 项。
- Node 回归：工作目录中的 55 个脚本通过；要求已有打包网页的发布入口检查在隔离构建目录通过。全部 56 个脚本均已有通过证据，未将工作目录缺少生成产物误判为代码缺陷。
- 新增原生模拟：嵌套脑图与阅读内容、宿主覆盖视图、重复打开、键盘归属、其他窗口与屏幕、非本地通知、旋转、仍可见的键盘、外接键盘附加栏、重复隐藏、减少动态效果、草稿恢复、监听清理和保存退场隔离通过。
- 最终安装包内的 Chromium 与原生源码联合模拟：正常动画与减少动态效果均保留中文组词及 Markdown 模式，关闭后重开恢复，未追加评论。
- 最终安装包内的保存失败与回执丢失回归通过，覆盖同次提交重试、部分写入核对、乱序草稿及模式记忆。
- 最终安装包内的尺寸、深浅主题、低高度及减少动态效果检查通过，页面未报告脚本错误。
- 隔离构建、ZIP 完整性、35 个包内文件及 25 个 JavaScript 文件语法检查通过；快速输入原生代码中不再包含 bringSubviewToFront。

## 测试包与本机安装

测试包：`dist/mn-comment-manager-v0.1.26-quick-input-keyboard-test.mnaddon`。版本仍为 0.1.26，仅作为本次开发测试包。

本机 MarginNote 安装前已备份原插件，正常退出应用后安装测试包，35 个文件与安装包逐字节一致，应用已重新启动。第一次安装请求因自动审批未识别安装与重启授权而被拒绝；核验 AGENTS.md 第79—82行及 MEMORY/决策点.md 第4行中用户于2026-10-12给出的持续授权后，同一安装请求获准执行。未强制结束应用。

包体摘要、备份位置及进程核验分别见 package-report.json 与 local-install-report.json。浏览器联合模拟脚本已保存在 check-keyboard-browser.cjs，复验时需提供包内网页服务，默认地址为 http://127.0.0.1:18765/quick-comment.html。

## 待验收与状态

MN5 透明问题与原生视图层级存在关联，但宿主是否修改透明度尚未获得真实 iPad 证据。无法识别内容视图时保留可用入口并记录诊断，不能把降级行为视为透明问题已解决。

待在同一应用的 MN4、MN5 界面及 iPad、iPhone 验收实际可见性、输入、横竖屏、分屏、浮动键盘、外接键盘、中文组词、同步下移动画和持续打开关闭。源码、浏览器与原生模拟不替代真实宿主结果。草稿仍仅保留在当前窗口会话，应用重启不承担恢复保证。

跟踪 [层级与透明问题 #71](https://github.com/xkwxdyy/MNCommentManager/issues/71) 和 [键盘收起问题 #72](https://github.com/xkwxdyy/MNCommentManager/issues/72)，关联原退场问题 #68，问题保持开放。本次未提交、未推送、未正式发布。
