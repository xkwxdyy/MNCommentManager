## 实际 WebView 按钮验收：部分通过（2026-10-18）

在已授权的独立测试学习集中，CUA 实际点击通过了原生摘录选择、更多选区操作、下移、转换确认及“转换并移动”。转换后实际点击刷新，页面返回“当前卡片已刷新”，定向编辑会话继续指向替代卡片。本轮没有在这些通过项中观察到“编辑请求已过期”。

后续连续验收未完成，不能确认撤销、重做后的编辑、复制和刷新全部正常。WebKit 无障碍弹出按钮点击曾导致 WebContent 崩溃：系统报告中的 accessibilityPerformPress → _synthesizeMouseClick 路径触发 EXC_BREAKPOINT。改用截图坐标后完成了转换，但后续页面再次白屏，坐标点击和拖动多次返回 noWindowsAvailable；部分无障碍动作与目标控件不一致，因此停止继续点击。单份崩溃报告不能解释全部白屏。

临时模块仅准备测试数据、通过正式协议固定目标及只读观察状态，没有代替按钮调用转换或刷新命令。测试原卡片为 2CC75CCF-9E85-43F5-85A9-0395A69772D2，替代卡片为 B9C5A40F-A22E-44A0-8EC8-BB8B129D230D。重启后的 Bridge 独立回读确认转换结果已保存。

验收结束后已移除临时入口，恢复验收前最新普通安装包，38 个安装文件逐字节一致，宿主正常重启。实际安装脚本的撤销重做缓存回归和链接定位校验回归通过；此前真实 UndoManager 验收与本轮未完成的按钮验收分别记录。业务源码本轮未修改，未提交或推送。Issue 保持开放，待稳定宿主环境下完成按钮连续操作验收。

本地证据：Resources/link-navigation/web-click-validation.md、web-click-events.json、web-click-webkit-ax-crash.json、web-click-final-restore-report.json、web-click-persisted-comments.json。
