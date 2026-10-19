# 浮动按钮修复提交与网盘准备

日期：2026-10-19。当前任务明确授权评论管理器、Pinner 与 Literature 按各自技能提交 Git 并上传 123 网盘。普通提交保留现有版本，不包含 Git 推送。

## 验证

- 评论管理器前端全量回归：20 个文件、285 项测试通过；按钮配置、144 个组合场景及移动集成专项通过。
- Pinner 共同布局、跨插件集成及严格预检通过；Literature 既有 71 个脚本的成功证据来自此前稳定显示修复阶段，本轮复用。
- 当前源码跨插件生命周期回归通过。Pinner 最终生产包中提取的 90 个跟随方法、评论管理器实际压缩脚本共同执行回归通过；该回归中的 Literature 生命周期方法来自当前源码。
- Literature 最终包 main.js 与 floatingControlLayout.js 逐字节匹配当前源码按相同生产压缩和字符伪装流程重新计算的输出。Pinner 最终包 main.js 与本轮 dist 一致，评论改动脚本与独立 Terser 输出一致。
- 本轮生产构建、ZIP 完整性、规范包名、插件身份、版本、当日 alpha 日期及 Pinner 运行时版本检查通过。
- 历史 Mac 测试仅覆盖大小卡片和连续点选结束时的显示；iPad/iPhone、高频逐帧连续性及显示耗时仍待验收。本轮没有重新安装或重启。

## 网盘冲突

当前同名包已完整下载并检查 ZIP。新旧摘要均有记录，覆盖前保留双方包体。以下“待上传”不代表已经上传。

| 目录 | 包名 | 旧包 SHA-256 | 待上传 SHA-256 |
| --- | --- | --- | --- |
| MNPinner_dev | mnpinner_v5_10_alpha1019.mnaddon | 25252653b166a43b8f837f8643b803056874603f47ae9aaf2d137a8546e6509a | 221fb323b7f0e7a08f2696867cccf9f8eb82cca44ef6ce9c5144198f009ea6a9 |
| MNLiterature_dev | mnliterature_v3_1_alpha1019.mnaddon | a8253641be69c953a4f9ed1f54a1c472c6e60a5b4f5548b335288efcda14cc03 | 1c08dcf0608c37b46e91b73d3421941d8102531e8e4ae66bb93dee6b6a28c281 |
| MNCommentManager | mn-comment-manager-v0.1.29.mnaddon | e911c4e1c71f0d0cf8c91a8ffca6af9a393fcfb345732ec0d756bb5c309a4c2c | 0e34b5a76c49c4206589505aabe0e45b6720aae12fc14c2515bf264a46743d40 |

上传目录分别为 MNCommentManager（28467434）、MNPinner_dev（22242191）和 MNLiterature_dev（27905773）。当前没有上传、覆盖或部署本轮更新源；覆盖不同内容的同名包需要另获明确授权。

本地新包位于 packages/，原远端包位于 remote-before/，原本地构建输出位于 local-output-before/。覆盖后当前下载链接将返回新内容，旧内容可从本地完整备份恢复。同版本覆盖可能无法被仅按版本比较的更新检测识别。

执行记录保存在 build-packages.json、preflight.json、remote-before.json、frontend-full.txt、packed-lifecycle.txt 及各构建日志。安装包、临时构建目录和完整本地备份不纳入 Git。

问题继续保持开放：[评论管理器 #67](https://github.com/xkwxdyy/MNCommentManager/issues/67)、[MN-Addons #673](https://github.com/xkwxdyy/MN-Addons/issues/673)、[MN-Addons #684](https://github.com/xkwxdyy/MN-Addons/issues/684)。
