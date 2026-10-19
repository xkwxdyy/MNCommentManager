## 实际网页按钮补验通过（2026-10-18）

用户确认其他宿主操作已暂停后，继续在已授权的独立测试学习集中完成实际 WebView 按钮验收。前轮“整组按钮未完成”的状态由本轮结果替代。

转换、编辑、保存、复制和刷新均由 CUA 实际点击生产页面按钮发起，文本由实际键盘输入。撤销和重做通过宿主工具栏按钮执行；临时模块只准备测试卡片、通过正式协议固定编辑目标和只读记录状态，没有代替按钮调用业务命令或 UndoManager。

已通过的实际流程：

- 转换并移动摘录后，复制摘录、编辑并保存评论成功。
- 撤销和重做评论编辑后，网页刷新分别显示原文与修改后的文本。
- 撤销转换后，网页刷新恢复原卡片和原生摘录，复制评论成功。
- 重做转换后，旧选区复制触发 TARGET_CHANGED，页面自动刷新到替代卡片并清空旧选区；重新选择后复制成功，没有返回过期错误。
- 重做转换后继续编辑并保存，刷新与复制均得到 UI resume edited after redo。
- 再次撤销转换后在原卡片编辑并保存，刷新与复制均得到 UI resume edited after undo。

测试原卡片为 0FDB0D43-46F6-4812-9DBD-4009714CE109，替代卡片为 BB248C15-504D-417B-8A7D-BFF248EF23D8。页面状态、会话目标、原生 groupNoteId 和测试剪贴板联合核对通过，结果 completed 为 true；捕获状态未包含“编辑请求已过期”或 STALE_REQUEST。Bridge 独立回读及恢复普通包后的重启回读均确认原卡片最终编辑已保存。

本轮中仍曾出现白屏与坐标定位失败，通过窗口菜单移到内建显示器后恢复，随后完成连续验收。该恢复过程不能证明显示器状态是全部白屏的根因；前轮系统 WebKit 无障碍崩溃证据继续单独保留。

临时入口已经移除，验收前普通包的 38 个安装文件逐字节恢复，宿主正常重启。业务源码本轮没有改动，未提交、推送或发布。其他转换动作、多窗口、输入法及 iPad/iPhone 仍待验收，Issue 保持开放。

本地证据：Resources/link-navigation/web-click-validation.md、web-click-resume-result.json、web-click-resume-events.json、web-click-resume-persisted-comments.json、web-click-resume-final-restore-report.json。
