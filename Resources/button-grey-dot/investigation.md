# 按钮左侧灰点调查

日期：2026-10-30。

最新进展：截图已经提供，早期“等待截图”和长按提示假设已由[截图后续调查](screenshot-followup.md)补充。当前优先核对 Comment Mover 的单评论灰点，控件身份及重叠时序仍待停用对照确认。

用户报告评论管理器按钮偶尔出现灰色小点，随后补充位置为按钮左侧。尚未提供截图，具体按钮、平台、MarginNote 与插件版本、触发条件及灰点持续时间尚未确认。

已完成只读调查：

- 当前源码 DynamicCommentActions.js 为管理及添加按钮注册 0.45 秒长按；BatchCommentActions.js 为多卡按钮注册同类长按。
- CommentActionUI.js 与按钮创建代码没有显式添加左侧灰点。
- 已核对本地 MNUtils 源码、SDK AddonLib，以及本机安装的 MN Utils 0.2.7.alpha1025：addLongPressGesture 只创建并注册识别器，没有绘制灰点。
- 已查阅本地 MNButton 文档和 UIButton 导出头文件。当前没有取得宿主对识别器附加标记的决定性实现证据，也没有复现灰点。
- 长按或多手势提示标记为待验证假设，不能认定为根因。评论移动轨道内部的索引圆点与本次按钮左侧现象分开处理。

后续需要灰点出现时包含完整按钮区域的截图，以确认按钮归属、相对位置及样式，再核对宿主手势标记或其他插件的浮动控件。

本轮未修改业务源码，未构建、安装、重启、提交或发布。保留开放，未声称修复。调查基于本地 f94de776188026cdc13580b6a158c537d4157ffa，反馈设备版本未知。相关历史：#98、#67、xkwxdyy/MN-Addons#673。

跟踪：[Issue #103](https://github.com/xkwxdyy/MNCommentManager/issues/103)。
