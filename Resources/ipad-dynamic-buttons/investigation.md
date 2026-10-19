# iPad 动态按钮调查（2026-10-18）

本次跟进 [Issue #67 的设备反馈](https://github.com/xkwxdyy/MNCommentManager/issues/67#issuecomment-6248506228)，目标是在确认设备原因后修复。

## 安装包定位

下载目录存在 `MNCommentManager-v0.1.28-comment-picker.mnaddon`，包内版本为 0.1.28，插件标识为 `marginnote.extension.mncommentmanager`。该包包含管理、添加和移动按钮，以及原生评论选择器和移动滑轨，功能与评论描述相符。

候选包 SHA-256：`789ebe81a822b64d51f973eed5d46343dac59fceb8ae6abfd59036f06305361d`。原包已按字节存档为 `original-comment-picker.mnaddon`；下载目录原文件保留。

当前仓库仍为双按钮源码。检索当前仓库、登记工作树、本地临时构建目录及当日 Codex 产物后，尚未定位三按钮包的原始源码；`readable/` 仅为包内脚本的格式化版本。GitHub 评论未附安装包、摘要或设备日志，当前用户也无法确认实际测试包。候选包身份尚未与故障设备核对，不能称为已经找到实际测试版本。

## 可复现条件

`check-package.cjs` 直接执行候选包的生产脚本，在同一组模拟环境中分别检查原包和诊断脚本：

- 正常视图结构：管理、添加及移动按钮均显示，按钮组宽度为 140 点。
- 宿主中加入 300 个可见、非交互的普通视图：窗口、卡片和锚点仍有效，显示请求被接受，但扫描超过 256 项后返回空布局，按钮组不显示。
- 窗口不匹配：请求在显示前被拒绝。
- 缺少锚点：上下文解析失败。
- 可用宽度不足：布局返回空值。
- 按钮创建抛出异常：原包的定时回调静默捕获，按钮不显示；诊断脚本记录异常。
- 其他插件已加载共享布局实例：候选包继续复用该实例，诊断脚本记录复用状态。

原包与诊断脚本在上述场景中的显示结果一致。该结果为 Node VM 模拟，证明代码具有对应失败路径；尚无故障 iPad 的视图结构或运行日志，不能据此认定扫描上限就是设备根因。

## 诊断包

`MNCommentManager-v0.1.28-ipad-diagnostic.mnaddon` 仅增加日志。事件覆盖模块加载、共享布局复用、通知到达、窗口校验、扩展卡片过滤、上下文解析、布局扫描超限、候选位置、显示结果和定时回调异常。日志前缀为 `[MNCM iPad diagnostic]`，构建标识为 `comment-picker-ipad-diag-1`，不记录评论正文，不写业务数据。

诊断包只调整 `main.js` 的诊断模块导入及原生脚本中的日志位置，并新增 `IPadButtonDiagnostic.js`。其余资源与候选包逐字节一致，包括网页、评论操作和撤销逻辑。完整资源差异、摘要及 ZIP 与 JavaScript 语法检查见 `package-report.json`。生产源码尚未修改。

生成与复验命令：

```sh
node Resources/ipad-dynamic-buttons/build-diagnostic.cjs
node Resources/ipad-dynamic-buttons/check-package.cjs
python3 Resources/ipad-dynamic-buttons/package-diagnostic.py
```

本轮没有安装或重启本机 MarginNote。另一个活动聊天正在同一应用中验收网页按钮，候选三按钮包与该安装内容也不一致，直接替换会干扰该验收。故障 iPad 尚未建立连接。

## 待取得的证据

先由反馈方核对实际测试包文件或摘要；在可复现的 iPad 中使用对应版本的诊断脚本，点击有多条可移动评论的普通卡片，并提供同一次操作的日志。若现有测试包与候选包不同，需先取得实际安装包，再按同样方式加入诊断，不直接替换为候选包。

- 出现 `layout.scan-incomplete`：确认扫描预算耗尽，再针对扫描范围实施修复，并保持完整避让检查。
- `popup.notification` 中的 `windowMatch` 为 false：继续核对通知所属窗口和原生对象身份，不能直接删除窗口保护。
- 通知到达但没有 `popup.handler`：检查扩展卡片过滤和通知入口中的异常。
- `context.result.resolved` 为 false：核对通知字段、卡片读取及锚点来源。
- 布局已得到位置但按钮仍不可见：继续读取父视图、透明度和层级证据。

本次尚未确认设备根因，未实施推测性修复，Issue 保持开放。

调查评论首次被自动审批拒绝；用户随后明确授权发布该具体草稿。评论已发布并核对[GitHub 回执](https://github.com/xkwxdyy/MNCommentManager/issues/67#issuecomment-6249192321)，未上传附件、未关闭 Issue。
