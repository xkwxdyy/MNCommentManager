## 问题与来源

2026-10-19 收到视频反馈：MN Literature 与 MN Comment Manager 的跟随按钮比同屏其他按钮更容易消失，或没有稳定出现。视频未提供安装包摘要和运行日志，设备直接根因仍待验收。

## 已确认的源码缺陷

MN Literature 的 `_scheduleLiteratureFollowCreateShowForContext` 每次创建会话后，无条件安排 1.5 秒的 stale 隐藏回调。该回调会清空当前上下文，未检查菜单是否仍然打开。Pinner 的跟随按钮按关闭通知退出，没有同样的固定超时隐藏。

## 本地修复

- 移除固定 1.5 秒隐藏，继续通过对应的菜单关闭、停用、断开和按钮动作清理。
- 区分卡片菜单与文本选区的关闭通知；关闭通知带卡片标识时，仅允许清理相同卡片。
- 共同布局扫描超限的修复另关联 #673；评论管理器挂载恢复关联 xkwxdyy/MNCommentManager#67。

## 验证与状态

- 生产函数模拟验证按钮超过 2 秒仍可见，匹配关闭仍清理，旧卡片关闭不清理新卡片，卡片关闭不清理文本选区，文本选区关闭仍清理。
- 跟随按钮、插件开关生命周期、选区搜索与动态菜单等相关回归通过。
- 隔离使用 batch_build_addons.sh 的 build/alpha-dev 生成本地测试包，ZIP 与改动文件源码一致性通过。
- 本轮未提交、推送、上传、部署或安装 Literature。Mac/iPad 真实显示和触摸待验收，Issue 保持开放。

本地证据：`mncommentmanager/Resources/follow-button-hardening/`。
