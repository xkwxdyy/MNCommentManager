# 项目记忆索引

- 构建与网盘后处理（2026-10-13）：项目固定 pnpm 10.34.7，修复 Corepack 0.34 与 pnpm 12 入口不兼容；真实 stable 分支构建通过。MN Comment Manager 已沿用 MNPinner 的文件名长链接规则，用户已上传的 v0.1.26 包摘要核验通过；正式及旧版清单和日志已同步至 0.1.26。原包与标签保持，构建修复与相关记录纳入本次提交，跟踪 [Issue #70](https://github.com/xkwxdyy/MNCommentManager/issues/70)。见 [验证记录](../Resources/build-corepack/fix.md)。

- 发版（2026-10-13）：[v0.1.26](https://github.com/xkwxdyy/MNCommentManager/releases/tag/v0.1.26) 已发布，包含轻量输入、Markdown 类型与偏好、提交去重和连续动画处理。发布提交及标签为 `6a2dde2`；本轮完整回归、最终包内检查、远端附件摘要核验通过，正式包已备份安装并正常重启 MarginNote。完整设备验收保持开放；123 网盘包与更新源已在后续构建修复阶段完成核验和同步。见 [发布验证](../Resources/releases/v0.1.26.md)。

- 连续转场审查（2026-10-13）：用户确认入场改善；进一步修正旧窗口复用与焦点回调、关闭回执丢失、早提交透明度重置及旧恢复定时器问题。完整前端 214 项、专项与 48 轮隔离连续操作通过；正文、草稿、类型与提交次数一致。修正版已备份安装并正常重启，实机持续快速操作待验收，见 [审查记录](../Resources/quick-input/transition-review.md)。
- 平缓入场（2026-10-12）：用户确认退场明显改善，并要求解决打开时白底突然出现。覆盖层加入视图前保持透明，页面恢复完成后与输入框同步淡入约 300 毫秒，重复与迟到请求有保护。原生模拟、前端、生产逐帧和保存回归通过，测试包已安装并正常重启，入场随后已获用户反馈确认。见 [入场验证记录](../Resources/quick-input/smooth-opening.md)。
- 录屏反馈与原生渐隐（2026-10-12）：用户录屏确认网页遮罩淡出后仍残留整窗白底，直到关闭才显示脑图；此前浏览器检查不足以证明宿主修复。已接入保存确认后的原生 UIView 覆盖层渐隐与关闭失败恢复，回归检查通过，测试包已安装并正常启动。退场改善随后已获用户反馈确认，原始证据与边界见 [视频验证记录](../Resources/quick-input/native-canvas-fade.md)。
- 快速输入回执与提前淡出（2026-10-12）：会话和提交记录改为保留在 JavaScript 闭包，避免原生动态对象边界改变布尔表示。背景在退场过程的 78% 时完成淡出，生产逐帧及失败重试检查通过，最终测试包已安装并正常重启。未提交草稿继续保留，新输入不读取已有评论；实际宿主动画仍待验收。证据见 [验证记录](../Resources/quick-input/early-backdrop-and-receipt.md)。
- 测试版自动安装流程（2026-10-12）：用户授权本项目每次更新并验证测试包后直接安装并正常重启 MarginNote；稳定规则已加入 AGENTS.md。最新 Markdown 记忆测试包已完成本机安装、文件核对和重启，备份与部署报告见 `Resources/quick-input/remember-markdown-review/local-install-report.json`。

- Markdown 偏好记忆（2026-10-12）：用户要求沿用最近选择，已通过原生配置保存并接入新输入会话，替代固定恢复为 Text 的规则。测试包和本轮验证见 [记忆验证记录](../Resources/quick-input/remember-markdown.md)，真实宿主重启恢复待验收。

- 快速输入 Markdown 与背景淡出（2026-10-12）：用户明确扩展评论类型范围；已加入 Markdown 图标开关，背景与面板同步退场，取消成功浮层提示。测试包、211 项前端测试及生产页面检查见 [验证记录](../Resources/quick-input/markdown-and-backdrop.md)。[Issue #68](https://github.com/xkwxdyy/MNCommentManager/issues/68)、[Issue #69](https://github.com/xkwxdyy/MNCommentManager/issues/69) 保持开放，实际宿主待验收。

- 快速输入界面调整（2026-10-12）：设置标签、浮动按钮避让、连续退场动画和关闭失败提示已更新；当前测试包及验证见 [交互调整记录](../Resources/quick-input/interaction-adjustments.md)。[Issue #67](https://github.com/xkwxdyy/MNCommentManager/issues/67)、[Issue #68](https://github.com/xkwxdyy/MNCommentManager/issues/68) 保持开放，真实宿主待验收。

- 轻量评论输入（2026-10-12）：双图标入口与纯文本输入已接入；数据处理审查已修复初始化关闭覆盖、乱序草稿、历史提交重放及迟到回执问题。前端 189 项、Node 54 个脚本、包内联合模拟与隔离构建通过；跟踪 [Issue #65](https://github.com/xkwxdyy/MNCommentManager/issues/65)、[Issue #66](https://github.com/xkwxdyy/MNCommentManager/issues/66)。真实 MarginNote 保存、键盘与撤销仍待验收；最新记录见 `Resources/quick-input/review-and-validation.md`；相关源码已包含在 v0.1.26 发布中。

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

- 2026-10-13｜v0.1.27已完成发布：隔离工作区整合可编辑默认工作流、键盘收起与草稿安全、MN5顶部胶囊避让；前端247项、Node脚本63个、最终包原生与网页交互通过。MN5显示有用户初步确认，完整设备验收保留。见 Resources/releases/v0.1.27.md。

- 2026-10-13｜[v0.1.27](https://github.com/xkwxdyy/MNCommentManager/releases/tag/v0.1.27)已发布；提交和标签为c2731ca，附件SHA-256与本地一致。发布使用隔离工作区，原目录和下载清单保留。123网盘上传及清单更新已完成，完整设备验收继续待办，见 Resources/releases/v0.1.27.md。

- 2026-10-13｜v0.1.27已通过Arc网页上传到MNCommentManager目录28467434；现有助手完整下载、ZIP及SHA-256一致性核验通过。主站和旧版兼容站的更新清单及双语日志均已部署并逐字节核验，真实下载清单已更新；GitHub标签和附件保持原样，本机插件未替换。服务器旧文件备份保留，设备验收继续待完成。报告见 Resources/releases/v0.1.27/cloud-publication-report.json。

- 2026-10-13｜mn-release已按用户要求纳入Arc上传、完整下载校验及主站和兼容站清单与日志部署。完整发版默认连续完成该流程；真实下载清单在包体核验后更新且继续不提交。旧同名入口读取统一流程，失败时保留已完成发布并只继续缺失步骤；技能维护不触发发布。

- 2026-10-18｜摘录移动已按最新要求调整为转换前确认，替代“完成后告知”；保留“不再提示”及设置恢复。前端 255 项、相关原生及焦点检查、最终包生产脚本模拟通过。已备份安装并正常重启；真实摘录待验收。证据见 [修复验证](../Resources/excerpt-move/confirmation-validation.md)及[待办.md](待办.md)。

- 2026-10-14｜坚果云冲突按内容完成整合：快速输入、按钮配置、键盘与中文组词保护、工作流管理和顶部避让已在原工作目录共同保留，回归及本地构建通过。原冲突文件可恢复归档，版本仍为 0.1.25，设备待验收；详情见[合并记录](../Resources/nutstore-content-merge/2026-10-14.md)。

- 快速输入层级与键盘收起（2026-10-13）：在独立 v0.1.26 工作目录完成相对内容视图插入、键盘通知联动、同步下移渐隐和草稿保护；完整前端、原生与包内模拟通过，测试包已备份安装并正常重启。MN5 透明及 iPad、iPhone 动画仍待验收，跟踪 #71、#72。原工作目录的业务源码和同步冲突保留，详见 Resources/quick-input/keyboard-dismissal/validation.md。

- 统一工作流菜单（2026-10-13）：用户已确认内置操作转为可编辑的默认工作流，保留出厂模板。当前工作目录已实现独立展示位置与手动排序、复制和恢复；验证与剩余宿主验收见事实和待办记录。本次未安装、提交或发布，其他独立工作目录的改动保留。


- 快速输入安全复审（2026-10-13）：已复现并修正组词快照过早取得、关闭失败正文回退及保存开始时提前关闭的竞争。前端228项、专项45项、57个Node脚本、原生120轮及包内浏览器连续操作通过；审查版已备份安装并重启。实机输入法及MN5透明度仍待验收，详见 Resources/quick-input/keyboard-safety-review/review.md。

- 2026-10-13｜工作流生命周期与易用性优化：设置页面优先展示操作摘要和菜单位置，编辑、筛选及管理内容按需展开；复制、恢复、保存反馈、键盘焦点和原生入口生命周期已调整。前端 217 项、相关原生脚本 19 个及隔离构建通过；本轮实际布局与真实 MarginNote 尚未验收，未安装、提交或发布。说明见 `Resources/workflow-menu/易用性与生命周期优化.md`，验证摘要见同目录 `validation.json`。

- 2026-10-13｜工作流测试包已按用户要求安装到本机 MarginNote，32 个文件与包内一致；评论面板及“菜单与工作流”设置已打开。当前安装版本为 0.1.25，此前的 0.1.26 快速输入审查版已完整备份，安装报告见 `Resources/workflow-menu/local-install-report.json`。完整操作与跨设备验收继续保留。

- 2026-10-13｜透明问题再次反馈后已准备窗口层级局部修复，前端45项和原生回归通过；宿主直接致因未证实，MN5仍待实际验收。当前本机已换成0.1.25工作流测试版，独立0.1.26修复包未安装。完整补丁及测试包见 Resources/quick-input/transparency-followup/validation.md，跟踪 Issue #71。

- 2026-10-13｜用户授权安装并测试窗口层级修复包；本机已安装0.1.26测试版，原0.1.25工作流测试版完整备份。安装文件与包内一致，实际包内原生回归及前端45项通过；主面板能打开，快速输入和拖拽实际测试因坐标操作返回noWindowsAvailable未完成。见 Resources/quick-input/transparency-followup/local-install-report.json。

- 2026-10-13｜第三方面板源码只读检查：MNUtils及Monaco采用窗口挂载，Monaco显示时明确把自身面板与网页的图层透明度恢复为1并置顶；MNBrowser显示时恢复此前透明度并在学习视图内置顶。未发现已检查代码直接修改MNCommentManager面板或明确标注MN5透明问题的专用修复；MNToolbar存在共享视图索引和移除操作，尚无本次触发证据。未修改插件或运行新界面测试，证据见 Resources/quick-input/transparency-followup/external-panels-evidence.json。

- 2026-10-13｜宿主开发者说明已记录：MN5顶部胶囊保护区域与插件视图重叠会触发透明度限制；hg 21156、21171报告把上限由0.25提高为0.6并加有限次数提示，尚不能认定已上线。后续以原生覆盖范围避让为方案草案，主面板保留自由拖动；原草案状态已由后续实施记录替代。原文与草案见 Resources/quick-input/transparency-followup/host-developer-report.md 和 host-protection-prd.md。

- 2026-10-13｜顶部胶囊避让已按用户要求尝试实施并通过脚本更新本机0.1.26测试版。36个安装文件一致，应用正常重启；前端213项、Node脚本60个及裁剪视口交互通过。暂停设置保留，实际透明度待验收。实现与报告见 Resources/quick-input/transparency-followup/top-chrome-avoidance/validation.md，Issue #71保持开放。

- 2026-10-13｜顶部避让测试包的MN5实际显示获得初步反馈：用户截图显示快速输入文字、背景和操作清晰，并反馈“好像可以了”。该场景初步验收通过；自动拖动与重开对照因noWindowsAvailable未完成，完整验收仍保留。记录见 Resources/quick-input/transparency-followup/top-chrome-avoidance/mn5-visibility-report.json。

- 2026-10-13｜[v0.1.27](https://github.com/xkwxdyy/MNCommentManager/releases/tag/v0.1.27)已完成GitHub稳定版发布。发布提交和标签为c2731ca，前端247项、Node脚本63个、包内原生与网页交互通过，附件下载SHA-256一致。当前原目录仍保留v0.1.25基础和全部既有改动；完整整合源码位于本聊天附着的release-v0-1-27工作区，已推送main。真实下载清单已随网盘发布更新，本机安装未替换，设备验收待办保留，见 Resources/releases/v0.1.27.md。

- 2026-10-13｜用户授权通过网页自动上传v0.1.27并完成清单发布，替代先前手动上传边界。Chrome网盘入口重定向至登录页面；页面扩展框架导致cdp_extension_access_denied，读取和截图失败，恢复请求超时，发布会话已停止。上传尚未发生，公开清单仍为v0.1.26；v0.1.27清单草稿保留实际历史，未部署。待登录页面恢复后继续自动发布，授权持续有效。报告见 Resources/releases/v0.1.27/pan123-upload-attempt.json。

- 2026-10-17｜已按确认方案接入 Pinner 卡片编辑协议，支持明确卡片 ID、独立目标会话、切换预检、取消与迟到响应隔离；相关 Native、前端和网页构建通过，未打包或安装。详见[实施记录](../../mnpinner/docs/reviews/2026-10-17-card-pin-editor-implementation.md)与[事实](事实.md)。

- 2026-10-17｜包含定向编辑协议的 CM 0.1.25 已本机打包安装并重启；37 个包内文件与 dist/安装目录一致，压缩发行包专项回归通过，原安装 0.1.26 已完整备份。Pinner 原生编辑按钮部分验收通过；CM 按钮实际打开与保存受本机 WebKit 无障碍点击崩溃阻塞，仍待验收。更新此前“本次未安装”的阶段记录，见[本机报告](../../mnpinner/docs/reviews/2026-10-17-card-pin-editor-local-install.md)。

- 2026-10-18｜评论管理器已接入通用跟随按钮规则；源码回归与原生构建或压缩校验通过，未归档或安装，Mac/iPad 待验收。见[跨插件实施记录](../../mnpinner/docs/reviews/2026-10-18-follow-button-collision-implementation.md)、[事实](事实.md)和[待办](待办.md)。

- 2026-10-18｜v0.1.28 正在发布，正式包与本次回归已核验；发布工作区基于远端 main，原目录保留。见 Resources/releases/v0.1.28/package-report.json。
