# 项目记忆索引

- 连续转场审查（2026-10-13）：用户确认入场改善；进一步修正旧窗口复用与焦点回调、关闭回执丢失、早提交透明度重置及旧恢复定时器问题。完整前端 214 项、专项与 48 轮隔离连续操作通过；正文、草稿、类型与提交次数一致。修正版已备份安装并正常重启，实机持续快速操作待验收，见 [审查记录](../Resources/quick-input/transition-review.md)。
- 平缓入场（2026-10-12）：用户确认退场明显改善，并要求解决打开时白底突然出现。覆盖层加入视图前保持透明，页面恢复完成后与输入框同步淡入约 300 毫秒，重复与迟到请求有保护。原生模拟、前端、生产逐帧和保存回归通过，测试包已安装并正常重启，入场随后已获用户反馈确认。见 [入场验证记录](../Resources/quick-input/smooth-opening.md)。
- 录屏反馈与原生渐隐（2026-10-12）：用户录屏确认网页遮罩淡出后仍残留整窗白底，直到关闭才显示脑图；此前浏览器检查不足以证明宿主修复。已接入保存确认后的原生 UIView 覆盖层渐隐与关闭失败恢复，回归检查通过，测试包已安装并正常启动。退场改善随后已获用户反馈确认，原始证据与边界见 [视频验证记录](../Resources/quick-input/native-canvas-fade.md)。
- 快速输入回执与提前淡出（2026-10-12）：会话和提交记录改为保留在 JavaScript 闭包，避免原生动态对象边界改变布尔表示。背景在退场过程的 78% 时完成淡出，生产逐帧及失败重试检查通过，最终测试包已安装并正常重启。未提交草稿继续保留，新输入不读取已有评论；实际宿主动画仍待验收。证据见 [验证记录](../Resources/quick-input/early-backdrop-and-receipt.md)。
- 测试版自动安装流程（2026-10-12）：用户授权本项目每次更新并验证测试包后直接安装并正常重启 MarginNote；稳定规则已加入 AGENTS.md。最新 Markdown 记忆测试包已完成本机安装、文件核对和重启，备份与部署报告见 `Resources/quick-input/remember-markdown-review/local-install-report.json`。

- Markdown 偏好记忆（2026-10-12）：用户要求沿用最近选择，已通过原生配置保存并接入新输入会话，替代固定恢复为 Text 的规则。测试包和本轮验证见 [记忆验证记录](../Resources/quick-input/remember-markdown.md)，真实宿主重启恢复待验收。

- 快速输入 Markdown 与背景淡出（2026-10-12）：用户明确扩展评论类型范围；已加入 Markdown 图标开关，背景与面板同步退场，取消成功浮层提示。测试包、211 项前端测试及生产页面检查见 [验证记录](../Resources/quick-input/markdown-and-backdrop.md)。[Issue #68](https://github.com/xkwxdyy/MNCommentManager/issues/68)、[Issue #69](https://github.com/xkwxdyy/MNCommentManager/issues/69) 保持开放，实际宿主待验收。

- 快速输入界面调整（2026-10-12）：设置标签、浮动按钮避让、连续退场动画和关闭失败提示已更新；当前测试包及验证见 [交互调整记录](../Resources/quick-input/interaction-adjustments.md)。[Issue #67](https://github.com/xkwxdyy/MNCommentManager/issues/67)、[Issue #68](https://github.com/xkwxdyy/MNCommentManager/issues/68) 保持开放，真实宿主待验收。

- 轻量评论输入（2026-10-12）：双图标入口与纯文本输入已接入；数据处理审查已修复初始化关闭覆盖、乱序草稿、历史提交重放及迟到回执问题。前端 189 项、Node 54 个脚本、包内联合模拟与隔离构建通过；跟踪 [Issue #65](https://github.com/xkwxdyy/MNCommentManager/issues/65)、[Issue #66](https://github.com/xkwxdyy/MNCommentManager/issues/66)。真实 MarginNote 保存、键盘与撤销仍待验收；最新记录见 `Resources/quick-input/review-and-validation.md`，尚未提交或发布。

- 发版与设备反馈（2026-10-12）：用户确认双指多选实际体验明显改善；[v0.1.25](https://github.com/xkwxdyy/MNCommentManager/releases/tag/v0.1.25) 已完成稳定版发布，发布提交与标签为 `f29e80a`。回归、隔离构建、最终包内网页检查及远端附件摘要核验通过。量化设备指标和其他宿主操作仍待验收，123 网盘及真实下载清单仍待手动更新；说明见 `Resources/releases/v0.1.25.md`。

- 双指多选优化（2026-10-12）：用户确认方案后，识别、命中缓存、按帧及差异更新、渐进边缘滚动和渲染缓存已接入。自动检查通过，实际体验改善已获用户测试确认；真实 iPad 的量化启动成功率、延迟和长列表指标仍待验收，跟踪 [Issue #64](https://github.com/xkwxdyy/MNCommentManager/issues/64)。调研与证据见 `Resources/two-finger-selection/`，相关源码已包含在 v0.1.25 发布中。

- HTML 下拉框与折叠回归（2026-10-11）：正式下拉框已统一为 HTML 控件；最近增加的未使用标识校验已移除，必需状态与保存检查继续保留。前端 163 项、Node 53 个脚本、隔离构建及最终包内浏览器检查通过；macOS 与 iPad 真机待复验，跟踪 [Issue #63](https://github.com/xkwxdyy/MNCommentManager/issues/63)。测试包与证据见 `Resources/comment-fold/state-validation-regression-validation.md`，相关源码已包含在 v0.1.25 发布中。

- 移动端控件（2026-10-11）：用户确认紧凑按钮与工具栏方向，正式源码已接入；底栏预留 48 像素避让原生 40×40 缩放手柄。158 项前端测试、相关 Node 检查和隔离构建通过；历史低高度窗口浏览器复检曾遇到 Chrome 超时；v0.1.25 最终包内尺寸及主题检查已通过，真实设备与宿主仍待验收。跟踪 [Issue #62](https://github.com/xkwxdyy/MNCommentManager/issues/62)，记录见 `Resources/mobile-controls/validation.md`。相关源码已包含在 v0.1.25 发布中。

- 模块化（2026-10-11）：独立演示及当前卡片正式面板源码已完成。正式接入专项 Node 测试 14 项、前端完整测试 158 项、隔离构建及 7 组尺寸与主题检查、12 项浏览器触摸检查通过；文件夹控制模块显隐，全选后的箭头控制评论折叠，配置由原生 JSON 保存。双指选择已接入正式源码，演示共用手势模块；Markdown 触摸节点断开已修复并跟踪 [Issue #59](https://github.com/xkwxdyy/MNCommentManager/issues/59)，后续审查修复手势中断及外部选区覆盖并跟踪 [Issue #60](https://github.com/xkwxdyy/MNCommentManager/issues/60)，模块保存回执提示修复跟踪 [Issue #61](https://github.com/xkwxdyy/MNCommentManager/issues/61)；iPad 连通排查仍暂缓，真实宿主保存、引用卡、移动、提取及撤销待验收；相关源码已包含在 v0.1.25 发布中。说明见 `Resources/comment-modules/integration-validation.md` 及下方事实、决策和待办记录。

- 批注折叠加固与工作流保存（2026-10-11）：开发者原文及接入说明归档到 [Resources/comment-fold/integration.md](../Resources/comment-fold/integration.md)。已复现并修复下拉框选择折叠动作后直接保存遗漏动作的问题；配置写入增加回读，折叠接口增加回执与错误处理校验。跟踪 [Issue #58](https://github.com/xkwxdyy/MNCommentManager/issues/58)，相关源码已包含在 v0.1.25 发布中；验证与宿主待验收项见 [事实.md](事实.md)、[待办.md](待办.md)。

- 提交与发版（2026-10-10）：批注折叠及交互调整已发布为 [v0.1.24](https://github.com/xkwxdyy/MNCommentManager/releases/tag/v0.1.24)，发布提交和标签为 `de61039`；正式 Markdown 与双语 JSON 已同步，GitHub 附件摘要与本地安装包一致。123 网盘和真实下载清单更新仍待手动完成，宿主验收见 [待办.md](待办.md)。授权与验证记录见 [决策点.md](决策点.md)、[事实.md](事实.md)。

- 批注折叠（2026-10-10）：演示已确认，单卡片、多卡片和工作流源码已接入；宿主接口依据用户转交的 revision `8451497ca7cb` 核实结果。显示决策见 [决策点.md](决策点.md)，接口事实见 [事实.md](事实.md)，宿主验收见 [待办.md](待办.md)。
- 多选切换（2026-10-10）：点击已选评论的左侧按钮，整个选区统一采用该条评论切换后的状态；未选项仍单独处理。原 HTML 与插件测试包已同步，前端 121 项测试及最终包资源的浏览器检查通过；真实宿主待验收。规则与包体记录见 [决策点.md](决策点.md)、[事实.md](事实.md)。
- 折叠工具栏遮挡（2026-10-10）：用户否决共享滚动方案，并要求直接修改原 HTML、考虑现有顶栏。原面板现已保留顶栏、改用固定底部折叠入口，低频选区操作复用原实现；原演示已更新为实际构建页面并保留备份，新测试包待宿主验收，跟踪 [Issue #57](https://github.com/xkwxdyy/MNCommentManager/issues/57)。验证与包体记录见 [事实.md](事实.md)。

- 图片摘录文本显示设置（2026-10-01）：默认关闭，用户可在设置中开启；只控制面板显示。见 [决策点.md](决策点.md)。
- 实现与本次验证结果见 [事实.md](事实.md)；MarginNote 真机验收见 [待办.md](待办.md)。

- 提交/发版 Skill（2026-10-01）：Claude 项目技能已适配到 `.agents/skills/git-commit-changelog/` 与 `.agents/skills/mn-release/`；迁移及复验见 [事实.md](事实.md)，完整 0.1.23 发版已完成，待真机验收与 123 网盘手动上传见 [待办.md](待办.md)。
