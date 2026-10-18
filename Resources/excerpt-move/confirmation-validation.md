# 摘录移动确认流程的修复与验证

日期：2026-10-18。来源：当前聊天的明确纠正及本轮工具输出。

## 修改与原因

旧实现先发送移动请求，再显示转换完成说明。当前实现把说明调整为移动前确认：点击摘录箭头或包含摘录的选区移动后，先解释必须转为非摘录版；点击“转换并移动”才执行，取消保持原内容。

“不再提示”及设置恢复入口继续使用原生偏好。保存失败不移动；关闭窗口、切换卡片和迟到响应不能继续旧移动。移动请求发出前关闭确认窗口，防止部分转换后的旧选区重试。普通评论移动和插件层转换事务保持原样。

## 本轮验证

- 修改前专项用例出现 15 项失败，证明旧实现不符合移动前确认语义。
- 修改后完整前端 255 项通过，包含摘录移动专项 22 项。覆盖文本、图片、取消、Escape、遮罩关闭、设置失败和重试、设置回执丢失、切卡、关闭过程中的迟到回执、普通评论及混合选区。报告见 [confirmation-frontend-report.json](confirmation-frontend-report.json)。
- 原生转换、评论移动刷新、原生设置及确认焦点检查通过，对应脚本为 test-batch-no-excerpt-conversion.js、test-comment-move-refresh.js、test-comment-action-settings.js 和 test-text-dialog-confirmation-focus.js。
- 隔离完整构建通过，压缩后的全部 JavaScript 语法检查与 ZIP 完整性检查通过。源码目录 src/web-dist/ 未修改。
- 最终安装包的生产脚本在 JSDOM 中通过文本及图片摘录交互模拟：确认前无移动请求，取消后仍无移动请求，确认后仅发送一次请求，完成后没有说明弹窗。报告见 [confirmation-packed-ui-report.json](confirmation-packed-ui-report.json)。该验证不包含真实浏览器布局或原生卡片操作。
- 修改后的源码已人工复读，差异空白检查通过。

## 测试包与恢复

测试包为 dist/excerpt-move/mn-comment-manager-v0.1.25-excerpt-confirm.mnaddon。最终包基于当前安装资源，仅替换 web-dist/assets/app.js；其余资源逐字节保持一致，避免带入工作目录中尚未安装的跟随按钮改动。隔离完整构建摘要另存 [confirmation-full-build-report.json](confirmation-full-build-report.json)，最终测试包摘要见 [confirmation-package-report.json](confirmation-package-report.json)。

最终测试包已完整备份安装，MarginNote 5 已正常退出并重新启动；37 个安装文件与包内资源逐字节一致，重启进程已确认。安装结果、旧插件备份路径及 SHA-256 见 [confirmation-local-install-report.json](confirmation-local-install-report.json)。恢复时先正常退出 MarginNote，再使用备份 ZIP 还原对应插件目录并重新启动。

本轮未操作真实摘录卡片。MarginNote 中的实际确认与取消、文本和图片摘录移动、链接迁移、撤销和重做，以及 iPad 和 iPhone 操作仍待验收。本轮未提交、推送或正式发布。[Issue #37](https://github.com/xkwxdyy/MNCommentManager/issues/37)保持开放。
