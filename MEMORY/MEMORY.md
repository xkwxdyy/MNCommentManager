# 项目记忆索引

- 发版与设备反馈（2026-10-12）：用户确认双指多选实际体验明显改善，并授权按 mn-release 完整发布 v0.1.25。量化设备指标及其他宿主操作仍待验收；发布核验结果将在完成后同步。

- 双指多选优化（2026-10-12）：用户确认方案后，识别、命中缓存、按帧及差异更新、渐进边缘滚动和渲染缓存已接入。自动检查通过，测试包已准备；真实 iPad 的启动成功率、延迟和长列表表现待验收，跟踪 [Issue #64](https://github.com/xkwxdyy/MNCommentManager/issues/64)。调研与证据见 `Resources/two-finger-selection/`，本次未安装、提交、推送或发布。

- HTML 下拉框与折叠回归（2026-10-11）：正式下拉框已统一为 HTML 控件；最近增加的未使用标识校验已移除，必需状态与保存检查继续保留。前端 163 项、Node 53 个脚本、隔离构建及最终包内浏览器检查通过；macOS 与 iPad 真机待复验，跟踪 [Issue #63](https://github.com/xkwxdyy/MNCommentManager/issues/63)。测试包与证据见 `Resources/comment-fold/state-validation-regression-validation.md`，未提交、推送或发布。

- 移动端控件（2026-10-11）：用户确认紧凑按钮与工具栏方向，正式源码已接入；底栏预留 48 像素避让原生 40×40 缩放手柄。158 项前端测试、相关 Node 检查和隔离构建通过；最终低高度窗口浏览器复检遇到 Chrome 超时，真实设备与宿主待验收。跟踪 [Issue #62](https://github.com/xkwxdyy/MNCommentManager/issues/62)，记录见 `Resources/mobile-controls/validation.md`。本次未提交、推送或发布。

- 模块化（2026-10-11）：独立演示及当前卡片正式面板源码已完成。正式接入专项 Node 测试 14 项、前端完整测试 158 项、隔离构建及 7 组尺寸与主题检查、12 项浏览器触摸检查通过；文件夹控制模块显隐，全选后的箭头控制评论折叠，配置由原生 JSON 保存。双指选择已接入正式源码，演示共用手势模块；Markdown 触摸节点断开已修复并跟踪 [Issue #59](https://github.com/xkwxdyy/MNCommentManager/issues/59)，后续审查修复手势中断及外部选区覆盖并跟踪 [Issue #60](https://github.com/xkwxdyy/MNCommentManager/issues/60)，模块保存回执提示修复跟踪 [Issue #61](https://github.com/xkwxdyy/MNCommentManager/issues/61)；iPad 连通排查仍暂缓，真实宿主保存、引用卡、移动、提取及撤销待验收；本次未提交、推送或发版。说明见 `Resources/comment-modules/integration-validation.md` 及下方事实、决策和待办记录。

- 批注折叠加固与工作流保存（2026-10-11）：开发者原文及接入说明归档到 [Resources/comment-fold/integration.md](../Resources/comment-fold/integration.md)。已复现并修复下拉框选择折叠动作后直接保存遗漏动作的问题；配置写入增加回读，折叠接口增加回执与错误处理校验。跟踪 [Issue #58](https://github.com/xkwxdyy/MNCommentManager/issues/58)，本次尚未提交、推送或发布；验证与宿主待验收项见 [事实.md](事实.md)、[待办.md](待办.md)。

- 提交与发版（2026-10-10）：批注折叠及交互调整已发布为 [v0.1.24](https://github.com/xkwxdyy/MNCommentManager/releases/tag/v0.1.24)，发布提交和标签为 `de61039`；正式 Markdown 与双语 JSON 已同步，GitHub 附件摘要与本地安装包一致。123 网盘和真实下载清单更新仍待手动完成，宿主验收见 [待办.md](待办.md)。授权与验证记录见 [决策点.md](决策点.md)、[事实.md](事实.md)。

- 批注折叠（2026-10-10）：演示已确认，单卡片、多卡片和工作流源码已接入；宿主接口依据用户转交的 revision `8451497ca7cb` 核实结果。显示决策见 [决策点.md](决策点.md)，接口事实见 [事实.md](事实.md)，宿主验收见 [待办.md](待办.md)。
- 多选切换（2026-10-10）：点击已选评论的左侧按钮，整个选区统一采用该条评论切换后的状态；未选项仍单独处理。原 HTML 与插件测试包已同步，前端 121 项测试及最终包资源的浏览器检查通过；真实宿主待验收。规则与包体记录见 [决策点.md](决策点.md)、[事实.md](事实.md)。
- 折叠工具栏遮挡（2026-10-10）：用户否决共享滚动方案，并要求直接修改原 HTML、考虑现有顶栏。原面板现已保留顶栏、改用固定底部折叠入口，低频选区操作复用原实现；原演示已更新为实际构建页面并保留备份，新测试包待宿主验收，跟踪 [Issue #57](https://github.com/xkwxdyy/MNCommentManager/issues/57)。验证与包体记录见 [事实.md](事实.md)。

- 图片摘录文本显示设置（2026-10-01）：默认关闭，用户可在设置中开启；只控制面板显示。见 [决策点.md](决策点.md)。
- 实现与本次验证结果见 [事实.md](事实.md)；MarginNote 真机验收见 [待办.md](待办.md)。

- 提交/发版 Skill（2026-10-01）：Claude 项目技能已适配到 `.agents/skills/git-commit-changelog/` 与 `.agents/skills/mn-release/`；迁移及复验见 [事实.md](事实.md)，完整 0.1.23 发版已完成，待真机验收与 123 网盘手动上传见 [待办.md](待办.md)。
