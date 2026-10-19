# 浮动按钮修复提交与网盘准备

日期：2026-10-19。当前任务明确授权评论管理器、Pinner 与 Literature 按各自技能提交 Git 并上传 123 网盘。普通提交保留现有版本，不包含 Git 推送。

## 验证

- 评论管理器前端全量回归：20 个文件、285 项测试通过；按钮配置、144 个组合场景及移动集成专项通过。
- Pinner 共同布局、跨插件集成及严格预检通过；Literature 既有 71 个脚本的成功证据来自此前稳定显示修复阶段，本轮复用。
- 当前源码跨插件生命周期回归通过。Pinner 最终生产包中提取的 90 个跟随方法、评论管理器实际压缩脚本共同执行回归通过；该回归中的 Literature 生命周期方法来自当前源码。
- Literature 最终包 main.js 与 floatingControlLayout.js 逐字节匹配当前源码按相同生产压缩和字符伪装流程重新计算的输出。Pinner 最终包 main.js 与本轮 dist 一致，评论改动脚本与独立 Terser 输出一致。
- 本轮生产构建、ZIP 完整性、规范包名、插件身份、版本、当日 alpha 日期及 Pinner 运行时版本检查通过。
- 历史 Mac 测试仅覆盖大小卡片和连续点选结束时的显示；iPad/iPhone、高频逐帧连续性及显示耗时仍待验收。本轮没有重新安装或重启。实际更新界面因窗口坐标操作持续返回 noWindowsAvailable 未完成；原生菜单可读取，未改动插件开关。

## 网盘覆盖与发布

旧同名包已完整下载并检查 ZIP。用户于 2026-10-19 明确授权今后默认允许覆盖；新旧包均已保留完整快照，本轮通过 Arc 登录网页完成覆盖及完整下载核验。

| 目录 | 包名 | 旧包 SHA-256 | 已上传 SHA-256 |
| --- | --- | --- | --- |
| MNPinner_dev | mnpinner_v5_10_alpha1019.mnaddon | 25252653b166a43b8f837f8643b803056874603f47ae9aaf2d137a8546e6509a | 221fb323b7f0e7a08f2696867cccf9f8eb82cca44ef6ce9c5144198f009ea6a9 |
| MNLiterature_dev | mnliterature_v3_1_alpha1019.mnaddon | a8253641be69c953a4f9ed1f54a1c472c6e60a5b4f5548b335288efcda14cc03 | 1c08dcf0608c37b46e91b73d3421941d8102531e8e4ae66bb93dee6b6a28c281 |
| MNCommentManager | mn-comment-manager-v0.1.29.mnaddon | e911c4e1c71f0d0cf8c91a8ffca6af9a393fcfb345732ec0d756bb5c309a4c2c | 0e34b5a76c49c4206589505aabe0e45b6720aae12fc14c2515bf264a46743d40 |

上传目录分别为 MNCommentManager（28467434）、MNPinner_dev（22242191）和 MNLiterature_dev（27905773）。本轮覆盖及主备用更新源部署已完成；后续同类上传按最新持续授权备份后覆盖，不再重复询问。

本地新包位于 packages/，原远端包位于 remote-before/，原本地构建输出位于 local-output-before/。覆盖后当前下载链接将返回新内容，旧内容可从本地完整备份恢复。同版本覆盖可能无法被仅按版本比较的更新检测识别。

执行记录保存在 build-packages.json、preflight.json、remote-before.json、frontend-full.txt、packed-lifecycle.txt 及各构建日志。安装包、临时构建目录和完整本地备份不纳入 Git。

问题继续保持开放：[评论管理器 #67](https://github.com/xkwxdyy/MNCommentManager/issues/67)、[MN-Addons #673](https://github.com/xkwxdyy/MN-Addons/issues/673)、[MN-Addons #684](https://github.com/xkwxdyy/MN-Addons/issues/684)。

## 配套更新源结果

- 主源 https://api.xkwxdyy.cn/update/ 与备用源 https://xkwxdyy.cn/update/ 的对应日志和清单已同步，16 项公开文件逐字节核对通过；Pinner 和 Literature 的正式版清单保持原样。
- Pinner、Literature 仓库及已安装实际生产更新模块完成 8 项真实 HTTP 主源／备用回退检查，目标版本、下载链接及双语日志一致。同版本正确返回无可用更新，旧版本模拟可以检测到当前版本。
- 本地发布元数据和备用 JSON 已备份同步。已上传包体保持首次摘要；包内较旧的备用 JSON 与部署后的新 JSON 属于不同阶段，没有重新打包。
- 服务器恢复备份：`/var/backups/mnaddon-updates/floating-stability-20261019T113012Z`。结构化回执见 publication-receipt.json。
- 评论管理器通过 MNUtils 插件商店消费清单；manifest 回归与公开源核验通过，实际商店界面检查仍待完成。GitHub 既有 Release 附件未替换，Git 未推送。

当前阶段：Git 源码提交、网盘覆盖、完整下载核验、更新源部署及公开验证均已完成；实际更新界面和设备验收边界继续保留。
