# 卡片链接定位误报编辑请求过期

日期：2026-10-18。跟踪：[Issue #76](https://github.com/xkwxdyy/MNCommentManager/issues/76)。

## 原因与修改

定向编辑协议固定正在编辑的卡片。链接定位命令的卡片标识表示链接目标，原来的统一校验却要求该标识等于编辑目标，导致定位另一张卡片时产生 STALE_REQUEST。

`src/ExternalCardEditor.js` 仅为 `focusLinkedNote` 跳过编辑目标比较。定位继续使用编辑器所属窗口，定向编辑目标保持不变。评论修改、删除、移动、链接修改以及批量限制继续使用原校验。

## 本轮证据

- 新增 `scripts/test-external-card-editor-navigation.js`，加载生产校验、Bridge 分发、命令处理与定位函数。修改前复现完全相同的过期错误，修改后通过主脑图和浮窗定位、窗口选择、导航后固定目标刷新、跨卡片写入阻挡、批量限制及普通面板导航检查。
- 定向编辑生命周期、Bridge 请求生命周期、普通链接和 Markdown 链接键盘检查通过。修改后的源码已人工复读，语法与差异空白检查通过。
- 测试包基于实际安装资源，仅重新压缩并替换 `ExternalCardEditor.js`；其余资源逐字节保留。ZIP 完整性、全部 JavaScript 语法与最终包内生产脚本的专项回归通过。未重新构建网页，避免带入工作目录中的其他改动。包体摘要见 [package-report.json](package-report.json)。
- 本机安装前已完整备份旧插件；MarginNote 5 正常退出后完成替换，安装文件与测试包全部一致，应用重启进程已确认。重读实际安装目录中的生产脚本，定位专项回归通过。安装结果与备份位置见 [local-install-report.json](local-install-report.json)。
- 首次安装在应用退出后的目录读取阶段遇到系统调用中断，未替换文件；加入有限重试后成功。首次备份继续保留。

## 恢复与待验收

测试包：`dist/link-navigation/mn-comment-manager-v0.1.25-link-navigation.mnaddon`。安装版本仍为 0.1.25。恢复时先正常退出 MarginNote，再将安装报告中的备份 ZIP 解压到包内 addonid 对应的插件目录，核对文件后重新启动应用。

真实 MarginNote 中的 Markdown 解析定位按钮、正文链接、普通链接、长按浮窗、导航后的编辑目标，以及 iPad 和 iPhone 操作仍待验收。隔离模拟未操作真实卡片数据。Issue 保持开放；本次未提交、推送或正式发布。
