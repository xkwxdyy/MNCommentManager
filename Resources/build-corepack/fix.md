# 构建入口修复与上传后处理

日期：2026-10-13。来源：用户报告 stable-pack 与 stable-release+manual-root-url 打包失败，并确认 v0.1.26 已上传至 123 网盘。跟踪 [Issue #70](https://github.com/xkwxdyy/MNCommentManager/issues/70)。

## 原因与修复

Corepack 0.34.0 对 pnpm >=6 固定采用 `bin/pnpm.cjs`，而已下载的 pnpm 12.11.2 使用 `bin/pnpm.mjs`。本机 Node 24.3.0 启动旧路径失败，构建没有开始，上传后处理也没有执行。

`package.json` 新增 `packageManager: pnpm@10.34.7`，采用与当前 Node 和 Corepack 兼容的项目级版本。该版本已缓存，官方完整性摘要已核对。全局 Corepack 默认未修改，构建依赖未重新安装。

MN Comment Manager 已经复用 MNPinner 的 `pan123-path-url.py`，按目录和实际文件名自动生成下载链接，无需逐版本提供独立直链。此前索取直链没有利用既有实现；本轮改为直接使用该流程。

## 本轮验证

- 项目目录的 pnpm --version 返回 10.34.7。
- 隔离副本执行批量脚本的真实 stable 分支及 pnpm build 成功，原报错路径已消失。stable-pack 与 manual-root-url 共用该构建入口。
- 构建包的 ZIP 完整，35 个文件与已发布包内容逐字节一致，25 个 JavaScript 文件语法检查通过。该比较发生在本地下载清单更新之前。
- 下载清单身份回归、MNPinner 共用路径链接测试及路径清单测试通过。
- 用户已上传的 `mn-comment-manager-v0.1.26.mnaddon` 通过文件名长链接下载核验，SHA-256 与本地原发布包一致：`1100e240f36beb121097c771c901e0bd300a159b9970f6c1765ad770a51c9aa1`。
- 本地下载清单已更新至 0.1.26，旧历史记录保留。正式与旧版更新源的清单、双语日志均已同步；公开响应与本地文件逐字节一致。

本轮保持原发布包与既有标签，没有重新替换 GitHub 或网盘附件。原生交互没有改动，本轮不新增设备验收结论。本次 Git 提交保存构建配置修复与验证记录；用户维护的下载清单保留在本地，推送结果关联到 Issue #70。

## 恢复与证据

本轮验证见 [validation.json](validation.json)。隔离构建、原始清单及公开响应备份位于系统临时目录 `mn-corepack-fix-k8epja_5`；服务器旧清单及日志已备份至 `/var/www/mnpinner-update/backups/mncommentmanager-before-v0.1.26-20261013-010647/`。

后续需要处理已上传包时，可选择批量脚本的 `publish/existing`，以现有包继续校验和同步更新源。
