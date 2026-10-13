---
name: mn-release
description: MN Comment Manager 完整发版：核对改动、同步日志和版本、验证打包、提交、推送、创建 GitHub Release，并通过 Arc 上传 123 网盘、校验下载及部署更新清单。用于完整发版、release、升级版本或发布标签请求。
---

# MN Comment Manager 发版工作流

本项目以 `.agents/skills/mn-release/SKILL.md` 维护统一发版流程。流程自带提交阶段，无需先执行 `git-commit-changelog`。

## 关键边界

- 默认 patch 升级；用户明确指定时按其选择。只发布 stable。
- `src/update-fallback/mncommentmanager_changelog.json` 是本流程维护的双语历史日志。
- 2026-10-13 用户明确要求：以后调用本技能完整发版时，由 Codex 连续完成 GitHub Release、Arc 网页上传、下载校验及主站和旧版兼容站的清单、日志部署。该授权替代此前手动上传及禁止修改下载清单的边界；用户明确要求仅准备、仅本地或不上传时遵循当次范围。技能维护本身不触发发布。
- `src/update-fallback/mncommentmanager.json` 是真实下载清单：仅在新包下载核验通过后更新；URL 使用现有助手返回且实际验证的长链接，不凭版本号替换生成未经验证的地址。该文件继续不 stage、不提交。
- 同一正式包用于 GitHub 和 123 网盘，记录大小和 SHA-256。清单更新后不重新打包或覆盖已发布附件；包内旧 fallback 与部署后的新清单属于不同阶段。普通完整发版不自动安装或重启 MarginNote。
- 不删除、移动或覆盖已存在的发布 tag；同版本 tag 或 Release 存在时，先核实是否为当前发布已完成的步骤。提交、标签和包摘要一致时复用，继续缺失的上传或部署；归属或包体冲突时停止受影响步骤，不自动提升版本重发。
- 不 force push，不跳过 hooks，不提交构建产物或秘密。不写死 Claude/Codex 模型署名。

## 1. 只读检查

读取项目规则、MEMORY 和相关 Resources；检查工作区（含 untracked）、staged diff、版本、最近提交、当前分支、remote、upstream、既有未推送提交。

有半途 staged 改动时保留原状态，暂停依赖其归属的提交步骤；不能擅自 reset。运行 `gh auth status`，核对远端主分支、tags、Release。沙箱网络失败不等于 token 失效。

中断续作时先读取已有回执并沿用该次 NEXT，不因版本已写入而再次升级。锁定 NEXT；检查 `git tag -l vNEXT`、远端同名 tag 和 Release。说明将推送的分支、已有未推送提交、tag 与附件。完整发版请求覆盖对应 GitHub 发布、Arc 上传及清单部署，范围未变时不重复确认；任务含糊时在实际发布前确认范围。

## 2. 更新版本和日志

- 更新 `package.json` 的顶层 version、`src/mnaddon.json` 的 version 和 README 安装包文件名；同时检查锁文件及其他实际版本来源，按项目约定同步，避免宽泛文本替换误改其他字段。
- 在 `CHANGELOG.md` 顶部标题下插入 NEXT 条目；已存在则更新，不重复。日期使用中国时区当天日期。
- 综合上次已发布 tag 之后的业务提交和当前改动写用户可感知日志，按新增、优化、修复分类。
- 在结构化 JSON 的 entries 前部插入或更新 NEXT：version 不带 v、channel 为 stable、date 为 YYYY-MM-DD、items 提供 zh/en。同步 updatedAt；保留历史条目。
- 核对版本一致、JSON 可解析、NEXT entry 唯一、双语内容完整；上传及下载校验前保留旧下载清单不变。

## 3. 验证和打包

人工复读源码 diff，运行对应现有测试及 `git diff --check`。使用 `npm run build` 打包；失败时停止，不能推送。

核对 `mn-comment-manager-vNEXT.mnaddon` 存在、zip 完整、内含正确版本的 mnaddon.json、Web 资源及下载清单、双语日志的 update-fallback JSON；检查不含 `.env`、node_modules、.codex、.agents 或文档等目录。构建成功不等于 MarginNote 真机验收。

## 4. 提交和本地标签

显式 stage 已审查且属授权范围的业务文件、测试、版本、日志、README 与相关文档。不 stage 下载清单、安装包、dist 或 src/web-dist；检查 staged diff 与文件列表。

以 `vNEXT：功能摘要` 为标题写提交消息，正文说明主要改动、验证及真机验收缺口，使用临时消息文件和 `git commit -F`。核对提交和工作区后创建 `git tag vNEXT`。续作时已核实一致的提交和标签直接复用，跳过重复提交及建标签。

## 5. 推送和 GitHub Release

发布前确认目标和范围已获授权；普通推送明确的分支，再推送唯一的 `vNEXT` tag。若远端分支出现新提交，停止并调查，不 force push。

从 CHANGELOG 提取 NEXT 完整条目，保存 notes 临时文件，用 `gh release create vNEXT --repo xkwxdyy/MNCommentManager --verify-tag --title vNEXT --notes-file FILE mn-comment-manager-vNEXT.mnaddon` 创建 Release 和上传附件。

网络超时或结果不明时先读远端状态；避免重复创建 Release 或覆盖附件。重试前核对 tag SHA、Release 和资产名。续作时已核实一致的 Release 和附件跳过创建。核对正文与 CHANGELOG、附件大小和摘要，并实际重新下载附件核验 SHA-256；通过后继续网盘步骤。

## 6. Arc 上传与完整下载校验

按 [云盘及清单发布流程](references/cloud-release.md) 检查正式目录和同名文件，通过 Arc 已登录网页及 macOS 文件选择器上传步骤 3 的确切安装包。复用 MNAddon 的 [网页上传技能](../../../../.codex/skills/mnaddon-123pan-web-upload/SKILL.md)；独立检出缺少共享技能时使用本技能参考文件中的必要步骤，不因此改用其他浏览器。

使用现有 `pan123-path-url.py` 的 `mncommentmanager stable PACKAGE --verify` 完整下载校验，确认 ZIP、根目录版本、大小及 SHA-256 与本地正式包一致。助手成功且包摘要与 GitHub 附件一致后才进入部署；网页传输列表为空不作为失败或重传依据。

## 7. 清单生成、备份、部署与公开核验

继续按 [云盘及清单发布流程](references/cloud-release.md) 读取真实在线历史，通过 `scripts/update-manifest.js` 生成 NEXT 清单；更新 `debug/123pan/mncommentmanager.json` 和本地 fallback，保留历史与原文件备份，运行现有清单身份回归。使用已维护的 NEXT 双语日志，不另生成不同版本的日志。

复用当前打包脚本的部署配置和相关函数，先备份主站和旧版兼容站旧文件，再部署清单与日志并逐字节核验公开响应。部署失败时检查实际状态，必要时按本次备份恢复；已成功的 GitHub Release 和云盘包保留，仅重试缺失步骤。登录、验证码、权限或网络阻塞按工具要求处理，不能报告完整发布成功。

## 8. 收尾

核对远端分支/tag SHA、本地 HEAD、Release 目标与附件；提供提交、Release 链接和本地安装包路径。同步项目 MEMORY 的事实和待办，区分本次验证和历史验证。

提供已验证的 123 网盘下载链接，记录 Arc 上传方式、目录、摘要、下载校验、公开更新源及服务器备份；同步项目 MEMORY 的事实、决定和待办。完整发布以 GitHub 附件、网盘包、主站和兼容站清单及日志全部核验通过为完成条件。未执行的真机验收继续保留；受阻时报告已完成步骤及具体缺口，不默认要求用户手动上传。
