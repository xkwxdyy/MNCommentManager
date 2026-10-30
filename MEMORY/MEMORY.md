# 项目记忆索引

- 2026-10-29｜用户确认拖动总览并授权接入。正式列表、原生顺序校验与撤销已完成，项目完整检查及浏览器模拟验收通过；0.1.32 测试包 106 文件核验一致，已备份安装并正常重启。真实卡片移动和移动设备触摸仍待验收，见[记录](../Resources/comment-move-integration/manager-overview/validation.md)与 [Issue #102](https://github.com/xkwxdyy/MNCommentManager/issues/102)。

- 2026-10-29｜拖动总览原型的评论／手柄纵向错位已修正为共用中心线；回归及宽屏浏览器中间、首尾对齐通过。原网络故障草稿现已补录至 Issue #102，用户体验已确认；真实触摸待验收。

- 2026-10-29｜完整评论管理器的[拖动总览独立原型](../Resources/comment-move-prototype/manager-overview/validation.md)已完成。已确认右侧手柄与全局轨道＋可读摘要；模拟检查、浏览器实际拖动与撤销、窄屏画面通过。后续已确认并授权接入，以本日上方接入记录为准；本条保留原型阶段证据。

- 2026-10-24｜添加评论原生与网页背景遮罩已移除，面板深浅配色和草稿恢复保留。源码、压缩包及浏览器检查通过；测试版仅替换背景相关资源，已备份安装并正常重启，106 文件一致。原图未提供，移动设备键盘和宿主合成待验收，见[验证记录](../Resources/quick-input/dark-backdrop-review/validation.md)及 [Issue #99](https://github.com/xkwxdyy/MNCommentManager/issues/99)。

- 2026-10-22｜按最新授权将 candidate-11 已验收的原生菜单与动态入口协调合并到正式源码，补充 [新场景模板接入说明](../README.native-card-menu.md)，测试专项已接入 CI。正式实现去除测试文件回执与模板探测。源码 211 条、包内 17 项回放及隔离构建通过，106 文件一致；版本元数据与锁文件未变，仍为 0.1.31。未提交、推送或发布；本轮未操作已交接宿主，安装仍为 candidate-11，去除诊断后的构建尚未重新设备验收。见[合并记录](../Resources/native-card-menu/source-integration-20261022/validation.md)及 [Issue #98](https://github.com/xkwxdyy/MNCommentManager/issues/98#issuecomment-6333722389)。

- 2026-10-22｜全新模板生命周期已在 MN5 Mac 完成：真实导入通用模板及预配置模板，缺省入口设置、场景插件许可、部分与全部接入、菜单手势、自定义空动作冷启动、命令移除、停用恢复、跨场景草稿及空卡均实测。宿主编辑器双编辑标识已在独立 candidate-11 修正，34 条源码和压缩包检查通过；106 个安装文件一致，版本仍为 0.1.31。原偏好及不存在状态、原学习集、模板和界面字段已恢复，测试卡片 JSON 和正式文件 193 项摘要一致。草稿当前运行内恢复，重启后为空。宿主已交接，本轮不再操作；未提交或发布。见[生命周期报告](../Resources/native-card-menu/adaptive-entry-test/fresh-lifecycle-20261022/validation.md)及 [Issue #98](https://github.com/xkwxdyy/MNCommentManager/issues/98#issuecomment-6333555141)。

- 2026-10-22｜原生入口协调独立包 candidate-10 已备份安装并正常重启，106 个文件与包内一致；源码与压缩资源 32 项检查通过。Mac 未接入、部分接入、全部接入、单击双击长按、“更多”、切空卡及跨学习集旧菜单拒绝与新菜单恢复均已实测；自定义空动作长按由 candidate-8 实测，临时偏好已恢复。卡片完整数据与正式文件 193 项摘要一致。原学习集、复习面板及界面状态已核对，坐标差异低于 0.000001；原模板已在宿主再次让出后重新激活并回读确认，Pinner 浮动列表弹窗未恢复。宿主已交接，设备与辅助功能继续待验收，见[验证记录](../Resources/native-card-menu/adaptive-entry-test/validation.md)。

- 2026-10-21｜[原生卡片菜单双入口](../Resources/native-card-menu/two-entry-test/validation.md)已按确认方案制作独立包并安装，最终包 `59d95eb1…` 的 103 个文件核验一致。此前迭代的真实单击、双击、长按和添加草稿恢复通过；最终包的菜单锚点与图标调整仅完成源码、包内及 Bridge 检查，真实手势复验受 `noWindowsAvailable` 阻塞。原学习集、场景及临时启用状态已恢复，原复习面板仍待恢复；测试卡片和树结构一致，Issue #98 保持开放，正式源码未改写。 该历史包已由上方原生入口协调包替代；本轮已完成新包 Mac 手势复验并恢复复习面板。

- 2026-10-21｜[横竖屏、分屏与浮动键盘复查](../Resources/ios-native-quick-input/rotation-split-floating-review/review.md)按最新要求仅执行 HTML 和离线检查，未操作、安装或重启 MarginNote。已修复未相交误避让、侧边空间未利用及迟到隐藏通知误关；203 条检查、324 项前端、43 项原生模型和 HTML 回放通过。`fc3cd8e9…` 布局测试包已生成但未安装，[预览](http://127.0.0.1:8847/)保留；iPad 真机结果仍待确认，Issue #97 开放。

- 2026-10-21｜[iPad 添加评论审查](../Resources/ios-native-quick-input/ipad-lifecycle-review/review.md)已修复低高度键盘遮挡、布局后的键盘坐标过期、紧凑错误提示挤走重试按钮及旧收起抑制。203 条检查、324 项前端与 39 项原生模型通过；`7f476cb1…` 测试包已备份安装到 Mac，102 个文件一致。已提供独立命名的 iPad 测试包和验收表；完整软件键盘、组词光标、分屏、旋转、触摸与 VoiceOver 仍待真机结果，Issue #97 保持开放。

- 2026-10-21｜[跟随按钮完整交互审查](../Resources/follow-button-review/review.md)已完成本轮 Mac 原生验收；最终 0.1.31 测试包 `d3fbaf24…` 已备份安装、正常重启并核对 102 个文件。持续按压、主题、选卡标签、工作流面板接管及关闭后重开已修复并实测；203 条检查和 317 项前端测试通过。主摘录、图片、链接、评论顺序及卡片树核验保留，阅读状态 37 项已恢复；移动设备及 Issue #24 剩余内容验收继续保留。

- 2026-10-21｜[评论入口生命周期审查](../Resources/comment-entry-integration/lifecycle-audit/review.md)：原型已获确认并接入，单卡、评论多选与卡片多选同时保留。已修正重复入口、原生菜单样式、上下文清理和首次打开丢失批量模式，原生单卡菜单、评论全选与清空、多卡预览、长按及关闭后恢复已实测；原生外层关闭的草稿保护已实测，iPad 键盘和无障碍继续按验收记录跟踪。[Issue #98](https://github.com/xkwxdyy/MNCommentManager/issues/98) 开放，原型阶段记录已被替代。

- 2026-10-20｜[独立卡片原生验收](../Resources/comment-quick-actions-native/validation.md)：首组图片摘录的复制、移动、折叠及对应撤销通过；已修复含子卡提取产生顶层副本，修复版真实复制通过，199 条检查及包内专项通过，43 文件核验安装并正常重启。文字样本全局撤销目标不明且自动审批拒绝，完整验收未完成；原阅读状态已恢复，Issue #24 保持开放。

- 2026-10-20｜已按确认原型完成[快捷评论接入、验证和测试安装](../Resources/comment-quick-actions-integration/validation.md)。多选、仅评论提取及原生输入高度调整已接入；源码、前端、包内及 Mac 对照通过，43 个安装文件匹配并正常重启，真实原生菜单可操作。Issue #24 已重新开放跟踪设备验收；未提交、推送或发布。

- 2026-10-20｜原型阶段已完成卡片旁多选、仅评论提取与撤销、输入高度和草稿恢复演示，DOM 与浏览器检查通过。后续已获用户确认并完成接入和测试安装，以上方最新记录为准；原型证据保存在 `Resources/comment-mover-v0.3.50-analysis/prototype-checks.json`。

- 2026-10-20｜MN Comment Mover 0.3.50 定制版已完成[深度分析](../Resources/comment-mover-v0.3.50-analysis/review.md)，并按要求存入 `../extensions/mncommentmover/v0.3.50-native-frame/`，包内文件核对一致。后续已授权按原型吸收部分交互，安装对象为当前项目的集成测试包，未安装独立定制插件。

- 2026-10-20｜[原生输入后续审查](../Resources/ios-native-quick-input/review/review.md)已修正组词结束确认、迟到键盘通知和保存后界面异常的状态恢复。原生 25 场景及 90 轮、Mac 对照与 120 轮、197 条检查命令和真实 UIKit 回调验收通过；最终包已备份安装、43 文件核验并正常重启，Mac 面板正常。移动设备及 Mac 快速输入完整界面验收继续保留，Issue #97 开放。

- 2026-10-20｜[原生快速输入适配](../Resources/ios-native-quick-input/validation.md)已在迁移后的当前开发目录实施：iPhone、iPad 使用 UITextView，Mac 保留网页输入。源码、包内检查及本机备份安装与重启通过；移动设备和 Mac 快速输入完整界面验收待完成，[Issue #97](https://github.com/xkwxdyy/MNCommentManager/issues/97) 保持开放。

- 2026-10-20｜v0.1.31 完整发布完成：PR #96 检查通过并合并，标签 aa3c0d5、main 合并 cb3bf6b；GitHub 附件与本次 Chrome 网页单次选取上传的网盘包完整下载 SHA-256 一致（010185a0…，699505 字节）。主站与兼容站清单、日志逐字节核验及包内更新模块真实 HTTP 的主备用检查通过；服务器旧文件已备份。本次未安装正式包，移动设备等边界仍待验收。见[发布记录](../Resources/releases/v0.1.31.md)。

- 2026-10-20｜自适应横向短栏已完成本机多轮实施、测试安装与真实操作。最终包 `dbafd8c99…` 已安装；Mac 选择、搜索、拖动、撤回、取消及折叠保存通过，已修正内容列表遮挡并记录 [Issue #86](https://github.com/xkwxdyy/MNCommentManager/issues/86)。样本内容顺序、展开状态及原阅读界面已恢复；移动设备待验收。本轮收尾后停止旧目录写入，等待迁移。见[最终验证](../Resources/comment-move-adaptive/validation.md)。

- 2026-10-20｜独立 MN Comment Mover 0.3.9 定制包已完成分析：建议评估自适应短栏与折叠状态提示，保留现有内容预览、顺序校验、撤回和避障。仅分析，未修改插件源码或安装；Issue #78 补充评论被自动审批拒绝，草稿未发送。见[报告与复现](../Resources/comment-mover-adaptive-review/review.md)。

- 2026-10-19｜已使用飞书 CLI 应用身份创建[PDF 非摘录选区菜单扩展反馈与最小接口方案](https://marginnote.feishu.cn/docx/Ct2bdu5QWoaiq3xf75vcSd2Yngc)，当前账号已获 full_access 管理员权限。正文完整回读并经 Markdown 规范化比较一致；包含实测边界、文字／矩形参数、单击／双击派发与失效规则。文档 ID 为 Ct2bdu5QWoaiq3xf75vcSd2Yngc，创建及验证回执位于 Resources/native-card-menu/pdf-existing-excerpt/feishu-delivery.json。

- 2026-10-19｜非摘录文字／矩形菜单的完整公开追加路径仍未核实：云端后续报告定位了菜单项构造、目标绑定及生命周期缺口；依赖宿主视图的原型尚未实施。highlightFromSelection 有创建摘录副作用，不能作为只读快照。详见[后续核查](../Resources/native-card-menu/pdf-existing-excerpt/validation.md#通用菜单接口的后续源码核查)。

- 2026-10-19｜PDF 菜单已完成本机实测：第 32 页已有摘录可追加 A、C，原生单击与附加双击区分，切换摘录后目标正确；实际回调 noteid 为 46DBED2D-A88D-41B6-81BB-35713C421E03 和 F9A6FB80-2867-4A64-B4AF-727F07FF5143，均等于对应原摘录 ID。阅读模式下未摘录文字和普通矩形选区均未生成 A、C，块选择独立操作条也未出现入口；矩形通过 selparams.textMode=false 恢复并观察，未验收鼠标拖框。原有摘录内容一致，自动输入新增的空白源笔记及关联卡片按用户要求保留；阅读模式和当前场景按最新要求保留，没有恢复摘录模式。见[验证记录](../Resources/native-card-menu/pdf-existing-excerpt/validation.md)。

- 2026-10-19｜用户转交云端源码核查报告，注明 revision 7cbc638e59df：PDF／EPub 已有摘录菜单复用卡片命令，文字选区菜单未接入；编辑器保留配置并独立查询标题，实际菜单只消费固定原生命令目录。该报告未由本地独立复核，不能直接等同 build 45063。报告出具时已有摘录尚待实测，后续 PDF 追加与双击已补验通过；EPub、简化菜单及不同 ID 映射仍待验收。本地双击已验证宿主生成的新增插件菜单按钮，未验证复制、高亮等既有按钮。见[补充记录](../Resources/native-card-menu/multi-gesture/validation.md#云端源码核查补充)。

- 2026-10-19｜原生菜单多手势实验已完成 Mac 实际输入验证：C 单击和双击分别触发，最后一次双击后无额外单击；D 四向滑动及 E 拖动状态与位移已记录。用户要求后续只考虑双击，排除 F 连续触发。文档选区通知带有 documentController；配置中的 A 命令在编辑器可见，在实际文字菜单及更多菜单中未出现，文档派发未验证。场景、Bridge state 与卡片树已恢复；临时文献已执行移出，context 仍列未聚焦对象。实验包保留安装，正式源码未加入实验代码。见[验证记录](../Resources/native-card-menu/multi-gesture/validation.md)。

- 2026-10-19｜新增原生菜单项已完成附加长按实验：Mac MarginNote 4.5.0 build 45063 的 B 项单击与 0.5 秒长按可区分，连续长按、长按后单击和切卡均通过，松手未额外触发单击。长按包已备份安装，正式源码与 MNToolbar 未修改；本轮开始时的测试场景和完整界面状态已恢复，卡片树一致。设备及宿主升级边界见[长按验证](../Resources/native-card-menu/long-press/validation.md)。

- 2026-10-19｜原生卡片菜单实验已完成本机实际验收：MarginNote 4.5.0 build 45063 的 A、B 文字命令可点击，切卡后的目标正确；`image: icon.png` 未显示为菜单图标，同包工具栏图标正常。原场景和完整界面状态已恢复，正式源码未加入实验入口，测试包及未激活场景保留。见[实验记录](../Resources/native-card-menu/validation.md)。

- 2026-10-19｜v0.1.30 完整发布已完成，发布提交 `fdc603c`；GitHub 附件与 Arc 上传的网盘包完整下载摘要一致，主、备用清单及双语日志公开响应与候选一致。68 个 Node.js 脚本、295 项前端、49 项模型及包内检查通过；实际安装的 0.1.29 已检测到 0.1.30 并显示对应说明，未安装正式包。真实升级及移动设备待验收，详见 [发布记录](../Resources/releases/v0.1.30.md)。

- 2026-10-19｜按各插件技能完成本地源码提交、Arc 同名覆盖及完整下载摘要核验，主备用清单与双语日志部署后 16 项公开文件一致，Pinner/Literature 生产更新模块 8 项真实 HTTP 主备用检查通过。本地备用元数据已同步，包体未重写，Git 未推送；默认覆盖授权已记入工作区规则。实际更新界面受窗口坐标操作错误阻塞，设备验收边界保留，见[发布记录](../Resources/dynamic-button-publication/submission.md)。
- 2026-10-19｜插件内更新功能已按确认方案实现，正式版启动与手动检查、说明显示及带备份恢复的安装已接入。68 个 Node.js 脚本、295 项前端和最终包专项通过；测试包已备份安装并正常重启，实际检查与说明显示通过，暂停插件状态保留。真实高版本升级和移动设备待验收，焦点竞争由 [Issue #85](https://github.com/xkwxdyy/MNCommentManager/issues/85) 跟踪，见 [验证记录](../Resources/internal-updater/validation.md)。


- 2026-10-19｜已按确认修复评论、文献、Pinner 的稳定显示并完成备份测试安装和正常重启，848 个文件一致。源码与包内回放通过，Mac 大小卡片及连续点选结束后显示已观察；密集投递、设备耗时及 iPad 仍待验收，文献开关恢复原关闭状态。此前“修复草案待确认”已由本次实施替代，详见[验证记录](../Resources/dynamic-button-stability/validation.md)。

- 2026-10-19｜用户再次确认浮动图标仍不稳定，并要求参照 Toolbar、ChatAI 深查，追加 Pinner 与快速连续点选。生产函数回放完成 36 组时序、75 组快速序列及共同几何、矩形契约对照，复现整个宿主占位拒绝显示、评论字符串矩形遗漏、Pinner 旧关闭误隐藏与零延迟、Literature 同卡重开消失。当时完成调查并提出草案；后续确认、实施与安装以上方最新记录为准。见[调查报告](../Resources/dynamic-button-comparison/research.md)、[修复草案](../Resources/dynamic-button-comparison/repair-plan.md)，跟踪 #67、MN-Addons #673、[#684](https://github.com/xkwxdyy/MN-Addons/issues/684)。

- 2026-10-19｜浮动按钮已支持管理、添加、移动独立开关、全部关闭及排序；后续大小卡片不稳定反馈已尝试修正事件锚点、迟到菜单、旧菜单阻断、正文扫描和面板同步路径；用户再次复现后，剩余缺陷以上方最新调查为准。67 个 Node.js 脚本、48 个集成场景及实际压缩包回归通过，最终 0.1.29 测试包已备份安装并正常重启；真实设备显示稳定性与时延待验收。Issue #67、#84 保持开放，见[最新验证](../Resources/dynamic-button-visibility/validation.md)。

- 2026-10-19｜v0.1.29 已完成 GitHub、Arc 网盘上传及主站和兼容站更新源发布；附件和下载包摘要一致。67 个 Node.js 脚本、281 项前端及 63 项模型测试通过，原目录同步发布提交，真实设备与插件内更新检查仍待验收；帮助视频宿主退出问题 #682 保持开放，见[发布记录](../Resources/releases/v0.1.29.md)。

- 2026-10-19｜未启用 MNBrowser 的首轮 Mac 内置浏览器链接与宣传播放通过，但重复验证出现宿主 WebKit 空回调异常；评论管理器已补明确回执返回值并重新安装，文献入门复测仍发生退出。当前 MNBrowser 仍停用，恢复坐标操作受接口错误阻塞；整体仅部分通过，[#682](https://github.com/xkwxdyy/MN-Addons/issues/682)开放，见[回退验收记录](../../docs/help-videos-2026-10-19.md)。

- 2026-10-19｜帮助视频已打包安装至本机，版本 `0.1.25`；问号、宣传与教程入口实际通过，宣传视频观察到播放画面。包体、备份及设备边界见[跨插件验收记录](../../docs/help-videos-2026-10-19.md)。

- 2026-10-19｜视频反馈后的跟随按钮加固已完成源码与本地包检查：共同布局改为保守占位，修复评论按钮重新挂载、旧卡片关闭及共享旧对象升级。14 个相关脚本与压缩包联合模拟通过，评论测试包已备份安装并重启；暂停插件设置保留，Mac/iPad 显示和触摸待验收。文献固定 1.5 秒隐藏另已移除，本地包未安装。见[验证记录](../Resources/follow-button-hardening/validation.md)，关联 #67、MN-Addons #673 与 #681。

- 2026-10-19｜灰色压缩摘要已按授权接入原生侧栏，保留可读相邻内容和自动滚动；5000 条评论采用固定数量视图及可见图片加载。20 项模型、39 个集成及 19 个视图场景和压缩包检查通过。测试包 `7be8b804…` 已生成，现有安装已备份；应用访问因自动审批容量不足未执行，尚未安装，见[接入记录](../Resources/comment-move-integration/compressed-overview/validation.md)。

- 2026-10-19｜灰色压缩摘要的独立原型已生成并通过模拟交互检查；原型阶段的浏览器预览受自动审批容量故障阻塞。后续接入已获授权并完成，状态以上述接入记录为准，原型保留在[原型记录](../Resources/comment-move-prototype/compressed-overview/validation.md)。

- 2026-10-19｜快速移动已修正为整段等距映射，手柄按轨道内指针坐标更新，预览原位复用并优先预留可读侧栏；摘要取消八字截断，使用较大字号并标注上下文。手势模型 20 项、集成模拟 39 个场景、视图模拟 14 个场景及包内验证通过，最终包 `fb63aa078…` 已安装并重启。本轮实际输入受工具 `noWindowsAvailable` 阻塞，既有 14 条评论未变；[Issue #83](https://github.com/xkwxdyy/MNCommentManager/issues/83) 保持开放，见[最新验证](../Resources/comment-move-integration/uniform-drag/validation.md)。

- 2026-10-18｜侧栏反馈修复包已完成 Mac 原生点按、长按、拖动、撤回及连续撤回操作。窗口缩放后坐标点击恢复，松手后的卡片正文可见，没有结果浮窗；最终评论内容和顺序与初始回读一致。手势中间帧及 iOS 仍待验收，[Issue #82](https://github.com/xkwxdyy/MNCommentManager/issues/82) 保持开放，见[最新验证](../Resources/comment-move-integration/sidebar-feedback/validation.md)。

- 2026-10-18｜侧边快速移动已接入并安装，主面板原有逻辑保留。卡片定位改为优先使用实际选中视图，侧栏及展开轨道自动避障；Mac 实际点按、拖动、长按跨条、取消、旧列表拦截和反馈撤回已通过数据库回读，测试评论已恢复。67 个 Node.js 脚本、275 项前端、18 项手势模型、30 个原生集成模拟和 8 个视图场景通过；iPhone、iPad 待验收。定位缺陷由 [Issue #81](https://github.com/xkwxdyy/MNCommentManager/issues/81) 跟踪，#78、#79、#80 已更新。见[集成验证](../Resources/comment-move-integration/validation.md)。

- 2026-10-18｜实际 WebView 按钮已补验通过：宿主工具栏实际撤销、重做转换后，网页编辑、保存、复制与刷新均正常，没有过期误报。旧选区触发 TARGET_CHANGED 后自动刷新，重新选择后复制成功。移到内建显示器后恢复页面绘制与坐标操作；不将该现象作为全部白屏的根因。临时入口已移除，验收前普通包已逐字节恢复并正常重启，测试卡片保留。[Issue #77](https://github.com/xkwxdyy/MNCommentManager/issues/77)因其他设备边界保持开放，见 [实际按钮验收](../Resources/link-navigation/web-click-validation.md)。

- 2026-10-18｜用户提供的 0.1.28 comment-picker 定制包已完成分析：新增单条评论选择器与滑轨排序，正式基准包摘要已核对。包内模拟复现旧索引移动错误评论、关闭与切卡状态残留、窄窗口越界，分别跟踪 [#78](https://github.com/xkwxdyy/MNCommentManager/issues/78)、[#79](https://github.com/xkwxdyy/MNCommentManager/issues/79)、[#80](https://github.com/xkwxdyy/MNCommentManager/issues/80)。仅分析，未修改插件源码或安装；iPad 按钮不显示仍缺设备日志。见 [审查记录](../Resources/comment-picker-review/review.md)。

- 2026-10-18｜[Issue #67 调查](https://github.com/xkwxdyy/MNCommentManager/issues/67#issuecomment-6249192321)：下载目录中已找到三按钮候选包，其扫描超过 256 项后整组隐藏的路径已通过包内生产脚本模拟复现；实际 iPad 测试包身份与设备根因尚未确认。仅增加日志的诊断包已验证，未安装、未实施推测性修复；调查评论经明确授权发布。见 [调查记录](../Resources/ipad-dynamic-buttons/investigation.md)。

- 2026-10-18｜转换后的撤销重做目标恢复已修复：刷新与命令校验从原生数据库识别原卡片或替代卡片，旧选区触发刷新并保留草稿。前端 274 项及本机真实原生转换、撤销重做、编辑、复制与刷新验收通过；独立测试学习集按授权保留。网页按钮完整操作与移动设备仍待验收，[Issue #77](https://github.com/xkwxdyy/MNCommentManager/issues/77)保持开放，见 [验证记录](../Resources/link-navigation/undo-redo-validation.md)。

- 2026-10-18｜按钮目标校验检查完成：链接定位误拒绝与摘录转换后会话未更新均已局部修复。源码、包内及实际安装脚本模拟通过，已备份安装并正常重启；真实定位、转换后连续操作与撤销重做待验收。[Issue #76](https://github.com/xkwxdyy/MNCommentManager/issues/76)及 [Issue #77](https://github.com/xkwxdyy/MNCommentManager/issues/77)保持开放，见 [按钮检查记录](../Resources/link-navigation/button-validation-review.md)。

- 2026-10-18｜摘录移动已按最新要求调整为转换前确认，替代“完成后告知”；保留“不再提示”及设置恢复。前端 255 项、相关原生及焦点检查、最终包生产脚本模拟通过。已备份安装并正常重启；真实摘录待验收。证据见 [修复验证](../Resources/excerpt-move/confirmation-validation.md)及[待办.md](待办.md)。

- 2026-10-14｜坚果云冲突按内容完成整合：快速输入、按钮配置、键盘与中文组词保护、工作流管理和顶部避让已在原工作目录共同保留，回归及本地构建通过。原冲突文件可恢复归档，版本仍为 0.1.25，设备待验收；详情见[合并记录](../Resources/nutstore-content-merge/2026-10-14.md)。

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

- 2026-10-13｜v0.1.27已通过Arc网页上传到MNCommentManager目录28467434；现有助手完整下载、ZIP及SHA-256一致性核验通过。主站和旧版兼容站的更新清单及双语日志均已部署并逐字节核验，真实下载清单已更新；GitHub标签和附件保持原样，本机插件未替换。服务器旧文件备份保留，设备验收继续待完成。报告见 Resources/releases/v0.1.27/cloud-publication-report.json。

- 2026-10-13｜mn-release已按用户要求纳入Arc上传、完整下载校验及主站和兼容站清单与日志部署。完整发版默认连续完成该流程；真实下载清单在包体核验后更新且继续不提交。旧同名入口读取统一流程，失败时保留已完成发布并只继续缺失步骤；技能维护不触发发布。

## 冲突副本中的历史记录补充

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

- 2026-10-17｜已按确认方案接入 Pinner 卡片编辑协议，支持明确卡片 ID、独立目标会话、切换预检、取消与迟到响应隔离；相关 Native、前端和网页构建通过，未打包或安装。详见[实施记录](../../mnpinner/docs/reviews/2026-10-17-card-pin-editor-implementation.md)与[事实](事实.md)。

- 2026-10-17｜包含定向编辑协议的 CM 0.1.25 已本机打包安装并重启；37 个包内文件与 dist/安装目录一致，压缩发行包专项回归通过，原安装 0.1.26 已完整备份。Pinner 原生编辑按钮部分验收通过；CM 按钮实际打开与保存受本机 WebKit 无障碍点击崩溃阻塞，仍待验收。更新此前“本次未安装”的阶段记录，见[本机报告](../../mnpinner/docs/reviews/2026-10-17-card-pin-editor-local-install.md)。

- 2026-10-18｜评论管理器已接入通用跟随按钮规则；源码回归与原生构建或压缩校验通过，未归档或安装，Mac/iPad 待验收。见[跨插件实施记录](../../mnpinner/docs/reviews/2026-10-18-follow-button-collision-implementation.md)、[事实](事实.md)和[待办](待办.md)。

- 2026-10-18｜v0.1.28 已完成 GitHub、Arc 网盘及主站和兼容站更新源发布，所有正式包下载和公开文件摘要一致。发布提交 cfbf272；正式源码在独立 release-v0-1-28 工作区，原目录版本与未提交源码保留。设备验收及界面更新检测待完成，见 Resources/releases/v0.1.28.md。
