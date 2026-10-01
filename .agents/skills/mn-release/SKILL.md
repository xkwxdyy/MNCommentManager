---
name: mn-release
description: MN Comment Manager 完整发版：核对改动、同步日志和版本、验证打包、提交、打 tag、推送并创建带 mnaddon 附件的 GitHub Release。用于完整发版、release、升级版本或发布标签请求。
---

# MN Comment Manager 发版工作流

由本项目 `.claude/skills/mn-release/SKILL.md` 迁移并适配 Codex。流程自带提交阶段，无需先执行 `git-commit-changelog`。

## 关键边界

- 默认 patch 升级；用户明确指定时按其选择。只发布 stable。
- `src/update-fallback/mncommentmanager_changelog.json` 是本流程维护的双语历史日志。
- `src/update-fallback/mncommentmanager.json` 是用户维护的真实下载清单：不修改、不 stage、不推算 URL。123 网盘上传和清单更新仍由用户完成。
- 不删除、移动或覆盖已存在的发布 tag；同版本本地/远端 tag 或 Release 存在时停止，核实是否为本次已成功的步骤，或使用用户确认的新版本。
- 不 force push，不跳过 hooks，不提交构建产物或秘密。不写死 Claude/Codex 模型署名。

## 1. 只读检查

读取项目规则、MEMORY 和相关 Resources；检查工作区（含 untracked）、staged diff、版本、最近提交、当前分支、remote、upstream、既有未推送提交。

有半途 staged 改动时保留原状态，暂停依赖其归属的提交步骤；不能擅自 reset。运行 `gh auth status`，核对远端主分支、tags、Release。沙箱网络失败不等于 token 失效。

锁定 NEXT；检查 `git tag -l vNEXT`、远端同名 tag 和 Release。说明将推送的分支、已有未推送提交、tag 与附件。完整发版请求授权这些对应动作；任务含糊时在实际发布前确认范围。

## 2. 更新版本和日志

- 更新 `package.json` 的顶层 version、`src/mnaddon.json` 的 version 和 README 安装包文件名；同时检查锁文件及其他实际版本来源，按项目约定同步，避免宽泛文本替换误改其他字段。
- 在 `CHANGELOG.md` 顶部标题下插入 NEXT 条目；已存在则更新，不重复。日期使用中国时区当天日期。
- 综合上次已发布 tag 之后的业务提交和当前改动写用户可感知日志，按新增、优化、修复分类。
- 在结构化 JSON 的 entries 前部插入或更新 NEXT：version 不带 v、channel 为 stable、date 为 YYYY-MM-DD、items 提供 zh/en。同步 updatedAt；保留历史条目。
- 核对版本一致、JSON 可解析、NEXT entry 唯一、双语内容完整；保留旧下载清单不变。

## 3. 验证和打包

人工复读源码 diff，运行对应现有测试及 `git diff --check`。使用 `npm run build` 打包；失败时停止，不能推送。

核对 `mn-comment-manager-vNEXT.mnaddon` 存在、zip 完整、内含正确版本的 mnaddon.json、Web 资源及两个 update-fallback JSON；检查不含 `.env`、node_modules、.codex、.agents 或文档等目录。构建成功不等于 MarginNote 真机验收。

## 4. 提交和本地标签

显式 stage 已审查且属授权范围的业务文件、测试、版本、日志、README 与相关文档。不 stage 下载清单、安装包、dist 或 src/web-dist；检查 staged diff 与文件列表。

以 `vNEXT：功能摘要` 为标题写提交消息，正文说明主要改动、验证及真机验收缺口，使用临时消息文件和 `git commit -F`。核对提交和工作区后创建 `git tag vNEXT`。

## 5. 推送和 GitHub Release

发布前确认目标和范围已获授权；普通推送明确的分支，再推送唯一的 `vNEXT` tag。若远端分支出现新提交，停止并调查，不 force push。

从 CHANGELOG 提取 NEXT 完整条目，保存 notes 临时文件，用 `gh release create vNEXT --repo xkwxdyy/MNCommentManager --verify-tag --title vNEXT --notes-file FILE mn-comment-manager-vNEXT.mnaddon` 创建 Release 和上传附件。

网络超时或结果不明时先读远端状态；避免重复创建 Release 或覆盖附件。重试前核对 tag SHA、Release 和资产名。

## 6. 收尾

核对远端分支/tag SHA、本地 HEAD、Release 目标与附件；提供提交、Release 链接和本地安装包路径。同步项目 MEMORY 的事实和待办，区分本次验证和历史验证。

明确说明真机验收状态；123 网盘上传和真实下载清单更新仍待用户手动完成，旧清单保留属于预期。
