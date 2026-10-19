# 侧边快速移动评论：集成与验证记录

日期：2026-10-18，后续验证跨日延续。最新等距拖动、指针跟随及可读摘要修复见[最新验证](uniform-drag/validation.md)。最新包已安装；原生输入工具错误阻塞本轮实际拖动验收。此前反馈布局及移动结果继续保留为历史证据，见[侧栏反馈验证](sidebar-feedback/validation.md)。

## 集成范围

用户已确认将卡片旁的快速移动控件整合进项目，并保留主面板原有逻辑。正式入口通过内容列表选择评论，随后支持点按上下微调、长按连续预览及拖动跨条定位。目标预览显示插入位置前后的评论内容；松手后提交一次移动，取消操作不写入数据。

原生界面与会话管理分别位于 `src/CommentMoveViews.js`、`src/CommentMoveController.js`。原生控件与网页原型共用纯手势逻辑；`src/CommentMoveGesture.js` 由 `web/src/lib/commentMoveGesture.mjs` 生成。浮动入口与生命周期清理接入现有插件。

本轮侧边控件集成没有修改 `web/src/App.jsx`、`src/WebBridgeCommands.js` 或 `src/CommentMutations.js`。实际移动继续调用既有 `moveComments`，主面板的批量移动、插入位置与选区语义保留。

## 自动化与构建证据

| 检查层面 | 结果 | 证据与范围 |
| --- | --- | --- |
| Node.js 回归 | 67 个脚本通过 | `node-tests.json`；脚本退出码均为 0。 |
| 前端回归 | 275 项测试通过 | `frontend-tests.json`；24 个测试套件通过。 |
| 纯手势与模型 | 18 项测试通过 | `move-tests.txt`；包含拖动映射、长按加速、取消、单次提交及生成代码一致性。 |
| 原生集成模拟 | 30 个场景通过 | `node-tests.json`、`packed-test-comment-move.js.txt`；包含过期索引、卡片切换、原生对象转换、撤回版本、布局与写入失败防护。 |
| 原生视图模拟 | 8 个场景通过 | `packed-test-comment-move-views.js.txt`；包含事件绑定、内容预览、缩略图回退、筛选与视图清理。 |
| 语法检查 | 29 个文件通过 | `syntax-checks.json`；没有记录失败。 |
| 隔离构建与包内检查 | 通过 | `build-preparation.json`、`build-log.txt`、包内专项测试记录；构建使用临时目录。`package-report.json` 记录 ZIP 完整性、文件数量及逐文件哈希。 |

各项检查存在覆盖关系，测试数量不能直接相加。原生模拟测试使用替身对象与可控计时器，不能替代 iOS 触摸及宿主运行时验收。

## 真实宿主操作

Mac 上的 MarginNote 5 已成功显示卡片旁的原生侧栏，并在内容列表中选中 `UI resume edited after undo` 评论。实际点按下移后，Bridge 评论回读接口的返回结果确认该评论已移到 `UI resume keep comment` 之后。

操作前后的顺序分别保存在 `before-native-selected.json`、`after-native-tap.json`。测试卡片为 `0FDB0D43-46F6-4812-9DBD-4009714CE109`，属于既有回归学习集 `136A68FE-7EF5-4DD0-90FE-1DFD5FE0F372`。`native-moved.png` 是该操作后的真实宿主截图。

原生验收已暴露并修正以下差异：

- `mindmapNodes` 未包含全部可见卡片。定位逻辑改为优先匹配 `selViewLst` 中的实际卡片视图，再转换其 `bounds`，同时保留节点查找作为补充。
- 当前宿主没有导出 `NSRunLoop`。`../Frameworks/Foundation/JSBFoundation.m` 第 350—351 行的相关注册也处于注释状态。计时器现按运行时能力检查处理；头文件中的声明不能证明宿主已导出对应对象。
- 移动反馈中的撤回按钮曾因 JavaScript 包装对象没有保持引用而丢失 `.param`。代码已补充引用保持；最终包的实际点按、拖动及长按跨条移动均可撤回，数据库回读确认顺序恢复。


最终包还完成了实际拖动、横向移开取消、过期列表拦截及持续按住两秒在含 3 条评论的卡片中从索引 0 移到索引 2的验证。点按、拖动及长按移动后的撤回均恢复原顺序。长按专项在既有测试卡片中临时追加了一条明确标记的评论，完成撤回后按全文前缀与索引精确移除；原有评论已逐项核对恢复。证据见 `native-validation.json`、`after-final-native-*.json`、`temporary-fixture-cleanup.json`，最终侧栏画面见 `native-verified.png`。

## 测试包与安装状态

测试包为 [mn-comment-manager-v0.1.25-side-quick-move.mnaddon](mn-comment-manager-v0.1.25-side-quick-move.mnaddon)，插件标识为 `marginnote.extension.mncommentmanager`。包内版本为 `0.1.25`，更新回退版本为 `0.1.28`，该产物用于本机测试。

此前实际移动验收包的 SHA-256 为：

```text
b1498052e46fc358d7f5622700f9b8d209c233a4963e455e09ee23487630fc77
```

此前包包含 41 个文件、679925 字节，ZIP 完整性检查通过。其包体与安装记录已保存在 `sidebar-feedback/before/`。最新 `package-report.json` 和 `local-install-report.json` 对应侧栏反馈修复包，具体证据见上方最新验证记录。

首次安装前的备份 `before-install-20261018-220738.zip` 与后续各轮 `before-install-*.zip` 均已保留。恢复时应使用对应备份，并核对目标插件标识及文件内容。

## 待验收与已知边界

- iOS 设备仍需验证持续触摸时的长按加速、拖动取消、键盘遮挡、窗口切换及同步期间的数据变化。Mac 点按结果不代表这些场景已经通过。
- 原生卡片在最终提交后更新，拖动期间由侧边预览显示目标位置。
- 手写二进制与 SVG 预览目前回退为 `✎` 类型图标；普通栅格图片支持缩略图。当前版本不能保证所有手写目标均可按实际图像内容区分。
- 真实设备的系统撤销与重做、多窗口、输入法和同步并发仍待验收。当前反馈入口的撤回采用签名约束的逆向移动，不调用可能包含其他操作的全局撤销栈。

## 缺陷跟踪

[Issue #78](https://github.com/xkwxdyy/MNCommentManager/issues/78)、[#79](https://github.com/xkwxdyy/MNCommentManager/issues/79)、[#80](https://github.com/xkwxdyy/MNCommentManager/issues/80) 已同步最终验证；子卡片定位失败误报无空间由 [Issue #81](https://github.com/xkwxdyy/MNCommentManager/issues/81) 独立跟踪。写入后的正文、编号与链接已回读核对，设备验收完成前保持开放。
