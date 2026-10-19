# 转换后的撤销、重做与连续编辑验证

最新状态（2026-10-18）：实际 WebView 按钮的转换、撤销、重做及后续编辑、复制、刷新已补验通过，未观察到过期误报。最终安装与完整证据以 [实际按钮验收记录](web-click-validation.md)为准，以下内容保留此前分阶段验证记录。

日期：2026-10-18。跟踪：[Issue #77](https://github.com/xkwxdyy/MNCommentManager/issues/77)。

## 发现与修复

前轮修复仅在执行转换时更新定向编辑目标。宿主撤销与重做直接恢复原生数据库状态，不会再次运行 JavaScript 转换函数。因此，转换撤销后，编辑会话仍可能指向已移除的替代卡片。

会话现保留本次转换的原卡片与替代卡片标识。刷新和带卡片目标的命令在执行前，从原生数据库重新读取已记录卡片的合并关系，识别撤销后恢复的原卡片和重做后恢复的替代卡片，并更新包装对象的原生数据引用。未知合并目标、循环关系和已删除原卡片均拒绝继续写入。

界面若仍持有撤销前的选区或编辑草稿，请求返回 TARGET_CHANGED，前端重新读取当前卡片并清除旧选区。旧评论位置不会自动迁移到另一张卡片；未保存的编辑草稿继续保留，需要关闭旧编辑窗口并重新选择内容。相关提示不再误称编辑请求已过期。普通跨卡片写入仍受到原有校验阻挡。

原生依据来自本地 JSBUndoManager、JSBMbBookNote 头文件、MNNote 包装实现，以及 mn-docs 的 UndoManager、MbBookNote 与 MNNote 文档。沿用已核实的 groupNoteId 与 Database.getNoteById，未新增撤销事件监听或轮询生产数据。

## 自动验证

- 转换回归在修复前复现撤销转换后刷新报 TARGET_UNAVAILABLE；修改后反复模拟撤销、重做、编辑、复制和刷新通过。
- 原生对象缓存专项覆盖：撤销后已删除目标仍残留在包装缓存、重做产生新原生对象、撤销后重新转换、转换链、循环关系、未知合并目标、原卡片删除及关闭会话。
- 前端专项验证旧选区复制后的自动刷新、后续编辑与复制使用新目标、失败保存保留草稿，以及迟到恢复响应不能覆盖后打开的卡片。
- 本轮完整前端测试 274 项通过，报告见 [undo-frontend-report.json](undo-frontend-report.json)。定向编辑、导航、Bridge 生命周期、主命令生命周期与撤销分组检查通过。
- 隔离网页构建、包体 ZIP 与全部 JavaScript 语法检查通过。实际安装脚本的转换历史和缓存专项通过，源码已人工复读，差异空白检查通过。

## 真实原生验收

用户明确授权新建并保留独立测试学习集“CM 撤销重做回归 2026-10-18”，标识为 136A68FE-7EF5-4DD0-90FE-1DFD5FE0F372。测试仅创建和操作该集中的测试卡片，创建回执见 [live-test-study-set.json](live-test-study-set.json)。本机 Bridge 使用运行时 0.92 契约，未改动已有学习集内容。

界面坐标操作返回 noWindowsAvailable，实际验收改用临时插件测试模块。模块只在指定测试集处于活动状态时执行，调用真实生产命令、原生数据库、UndoManager 和剪贴板接口。模块使用独立测试会话，未通过网页按钮发起这些原生请求。剪贴板在测试前保存全部 items，结束后恢复；测试模块和临时导入仅存在于验收包，未加入源码入口。

真实宿主完成并回读了以下流程：

- 原生摘录转换、复制、编辑，随后撤销和重做编辑并核对文本。
- 撤销转换后刷新至原卡片并复制；重做转换后刷新至替代卡片并复制。
- 连续重复上述历史切换，再撤销转换并编辑恢复后的原卡片，复制结果与文本一致。

全部原生断言通过，报告 completed 为 true。完整结果见 [native-history-result.json](native-history-result.json)，验收脚本见 [NativeHistoryProbe.js](NativeHistoryProbe.js)。源卡片为 4826A309-E461-447F-8ABE-17B8B8CBDFA2，替代卡片为 42A93BF5-D172-4CD9-98C3-95C68622DC1D。

随后使用真实原生面板控制器重新执行相同流程，补验会话对象经原生属性保存后的行为。该轮 nativeController 和 completed 均为 true，全部断言通过，见 [native-controller-history-result.json](native-controller-history-result.json)。该轮源卡片为 8DF2F21E-03B2-42EF-9B63-FA5C3DA0D275，替代卡片为 D69472AB-E3F6-451D-AB7C-10777300DE33。该证据覆盖原生控制器属性保存，仍不等同于网页按钮的实际点击验收。

恢复普通修复包并重启后，通过 Bridge 再次独立回读，确认原卡片上的 native branch edit 和 native keep comment 均保留。见 [评论回读](native-history-persisted-comments.json)及[最终测试树](native-history-final-tree.json)。测试学习集和卡片按授权保留。

真实原生控制器补验结束并再次恢复普通修复包后，也已独立回读该轮测试卡片，确认编辑文本跨重启保留，见 [原生控制器测试评论回读](native-controller-persisted-comments.json)。

## 最终安装与边界

最终修复包为 dist/conversion-history/mn-comment-manager-v0.1.25-conversion-history.mnaddon，SHA-256 为 8b6e362bff2eab0e76dc5c6f0b6cef69620f4ec31075b6ec26f84c8671932987。相对前轮安装，仅更新 ExternalCardEditor.js 和 web-dist/assets/app.js。包体记录见 [undo-package-report.json](undo-package-report.json)。

临时验收模块已随完整包替换移出安装目录，最终安装文件与不含验收模块的修复包逐字节一致。MarginNote 已正常重启；最终安装报告和备份位置见 [undo-final-install-report.json](undo-final-install-report.json)。恢复时正常退出 MarginNote，将前轮修复包或对应备份 ZIP 还原到报告中的插件目录，再核对并启动。

本轮已取得 macOS 上真实原生数据与撤销重做证据；网页自动恢复由前端回归验证，未取得实际 WebView 按钮点击的完整验收。iPad、iPhone、多窗口和输入法仍待验收。Issue 保持开放，本次未提交、推送或正式发布。

## 追加：实际网页按钮检查

2026-10-18 已继续执行实际 WebView 点击。原生摘录选择、选区菜单、转换并移动及转换后刷新通过；后续白屏、无障碍点击故障与坐标定位失败使撤销重做后的整组操作未完成。系统 WebKit 崩溃证据、恢复安装包与精确验证边界见 [实际按钮验收记录](web-click-validation.md)。本次最终恢复验收前的最新普通安装包，替代前文旧路径作为当前安装依据，Issue #77 保持开放。
