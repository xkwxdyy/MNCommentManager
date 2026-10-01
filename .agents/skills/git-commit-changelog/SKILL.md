---
name: git-commit-changelog
description: 整理 MN Comment Manager 的 Git 改动，同步 Markdown 和双语 JSON 更新日志，提交并在用户授权时推送 GitHub。用于提交、整理改动、更新 CHANGELOG 或 commit/push 请求。
---

# MN Comment Manager 提交工作流

由本项目 `.claude/skills/git-commit-changelog/SKILL.md` 迁移并适配 Codex。完整发版使用相邻的 `mn-release`，无需先执行本流程。

## 检查与范围

1. 读取项目规则、MEMORY 与相关 Resources；检查 `git status --short`、staged/unstaged diff、未跟踪文件和最近提交。
2. 核对仓库、分支、upstream 和远端状态；网络操作前用 `gh auth status` 核验登录。沙箱网络失败不等于凭据失效。
3. 只提交用户授权范围内的改动，显式列出路径；不使用 `git add -A`。保留无关和半途暂存改动，不擅自取消暂存。
4. 推送前检查将一并发布的已有未推送提交。提交请求本身不自动授权推送；按用户当前任务授权执行，不把本 Skill 当作永久授权。主分支需要用户授权对应目标。

## 更新日志

- 从 `package.json` 与 `src/mnaddon.json` 读取版本并核对一致性。此流程不自动升级版本。
- 保留 `CHANGELOG.md` 顶部标题和历史条目；同一未发布版本更新既有条目，已发布版本的新增内容使用 `Unreleased`，不改写已发布版本说明。
- 正式版本日志格式为 `## VERSION（YYYY-MM-DD）`，按新增、优化、修复归类，使用中国时区日期和用户可感知描述。
- 同步 `src/update-fallback/mncommentmanager_changelog.json`：正式版本 entry 使用 `stable`，items 为 `{ "zh": "...", "en": "..." }`；不创建伪造版本的 Unreleased JSON entry。已发布版本后续改动的 JSON 同步留到下一次发版，不将其归入已发布版本。
- 不编造功能或测试结果；内部技能、构建和记录维护不包装为产品功能。
- 下载清单 `src/update-fallback/mncommentmanager.json` 由用户维护，本流程不修改、不 stage，不推算下载 URL。

## 验证与提交

- 人工复读 diff，运行与改动相关的现有测试、JSON 解析和 `git diff --check`。
- 显式 stage 相关源码、测试、更新日志和适用的项目文档；不 stage 密钥、临时文件、`dist/`、`src/web-dist/` 或安装包。
- 核对 `git diff --cached`，以最近提交风格写 ≤72 字符标题及说明，使用临时消息文件和 `git commit -F`。不写死模型署名或虚构共同作者，不跳过 hooks。
- 有推送授权时使用明确 remote/branch 的普通 push；不 force push、不 amend 已发布提交、不改写发布标签。
- 验证 HEAD、工作区和远端 SHA；报告提交链接、验证证据及剩余真机验收。
