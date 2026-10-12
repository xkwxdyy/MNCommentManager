# 视频反馈与原生覆盖层渐隐

日期：2026-10-12。来源：用户提供的 MarginNote 录屏，时长约 11.47 秒，分辨率为 1024×768，帧率为每秒 60 帧。

## 视频确认的问题

逐帧画面显示，网页背景从灰色逐渐变为白色，输入面板缩小并淡出后，白色仍覆盖整个窗口。原生脑图直到输入窗口关闭才重新出现。此前浏览器演示的背景属于同一网页，背景透明度下降能够露出网页内的模拟卡片；该结果没有验证网页画布与原生脑图之间的合成。此前仅调整遮罩曲线的方案不足以解决视频中的现象。

原始录屏未修改。抽帧见 `video-review/contact-01.png` 和 `video-review/exit-frames.png`，未上传录屏或画面。

## 本轮改动

新增 `setQuickCommentExit` 命令。前端严格确认保存回执后发送退场请求；原生层再次检查当前会话、当前提交标识、保存状态和 persisted 布尔值。原生 UIView 覆盖层采用约 520 毫秒的 ease-in-out 渐隐，从而覆盖网页画布可能保留的白底。网页中的定向收缩仍持续 680 毫秒。

目标失效时原生渐隐采用 320 毫秒，减少动态效果采用 120 毫秒。动画异常不改变保存结果。相同退场请求不会重复启动动画，也不会追加评论。关闭失败时前端恢复可见状态并请求原生层恢复透明度；原生层还设置恢复定时器，关闭请求未送达时不永久保留透明窗口。正文与原提交保持锁定，恢复过程不允许重复追加。

本轮没有改动已有评论、持久化草稿或按钮动作配置，也没有为宿主验证写入测试评论。

## 证据与边界

本地 Frameworks 的 UIView 头文件明确导出 alpha、animateWithDurationDelayOptionsAnimationsCompletion；CALayer 头文件明确导出 removeAllAnimations。

- 原生模拟验证：保存前拒绝渐隐、错误提交标识拒绝渐隐、相同请求只播放一次、减少动态效果、关闭未送达恢复透明度、动画接口异常恢复可见且不追加评论。
- 快速输入前端 28 项测试和运行时隔离检查通过；验证未确认的回执不会调用渐隐命令，关闭失败会请求恢复原生可见状态。
- 最终生产页面的布局与减少动态效果检查通过。生产页面与原生源码联合模拟验证纯文本和 Markdown 的重复提交、回执丢失、部分保存失败、草稿恢复与类型记忆，各保存场景仅追加一次。
- 完整构建、ZIP 与包内命令资源检查通过。测试包已安装，35 个文件与包内资源逐字节一致，旧文件已备份，MarginNote 已正常启动。
- 宿主界面复查确认评论管理器能够打开，按钮动作配置正确；快速输入入口的自动化点击未稳定打开窗口。本轮未取得新版本实际退场录屏，因此不能据模拟测试认定宿主动画已经验收。

当前包：`dist/mn-comment-manager-v0.1.25-quick-input-native-canvas.mnaddon`。

部署与回归证据：`native-canvas-review/package-report.json`、`native-canvas-review/local-install-report.json`、`native-canvas-review/failures/failure-report.json`、`native-canvas-review/layouts/report.json`。

[Issue #68](https://github.com/xkwxdyy/MNCommentManager/issues/68) 保持开放。当前工作区未提交、未推送、未发布。

后续反馈：用户已确认退场明显改善，打开过程的进一步调整见 [平缓入场记录](smooth-opening.md)。
