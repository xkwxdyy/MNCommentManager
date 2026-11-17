# 面板拉长后底部空白修复

日期：2026-11-15。跟踪：[Issue #117](https://github.com/xkwxdyy/MNCommentManager/issues/117)。

用户截图为 iPad 评论管理器向下拉长后，底部操作栏下方留下空白。根容器定义四行网格；宽度超过 520px、侧栏展开时，快速定位栏隐藏，工作区自动进入第三个 auto 行，第四个弹性行变为空白。低高度隐藏状态栏时也有同类问题。

在 `web/src/styles.css` 的 `.workspace` 设置 `grid-row: 4`，使工作区始终占据弹性行。侧栏、评论和底部操作栏随面板高度变化。不涉及数据、原生接口或持久化。

隔离无头 Chrome 使用真实 React 主入口及独立模拟卡片，在 708×560 → 708×780 → 708×560、1024×800、390×844、600×400，结合侧栏展开／收起验证。修复前展开侧栏时复现底部空白，708×780 为 281.625px；修复后源码构建及最终包内网页的工作区、操作栏均到达面板底边，无页面异常。既有 `test-main-workspace-extra-narrow-layout.js`、`test-main-shell-dark-narrow-layout.js`、`test-responsive-action-order.js`、`test-extra-narrow-action-order.js` 和定向差异空白检查通过。

测试安装包基于当前已安装干净版本构造，仅向 `web-dist/assets/app.css` 的工作区规则加入源码构建确认的 `grid-row:4`，其他字节保持。ZIP 完整性、清单、差异及安装后逐文件一致性通过。MarginNote 正常退出并使用 `open -g -j` 后台启动，没有强制结束应用。

- 测试包：`artifacts/panel-height-20261115/mn-comment-manager-v0.1.42-panel-height.mnaddon`
- SHA-256：`79be214257642220f9a57d9a61085a8393ce510e43efd3ca8c4edcda3d7a9617`
- 原安装备份：`artifacts/panel-height-20261115/installed-before-panel-height.zip`
- 备份 SHA-256：`90a887fce596dfcf31fff762a31eeb6c66470dba733d70deab0264b917ce9d92`
- 完整证据与安装回执：`artifacts/panel-height-20261115/`。恢复时先正常退出 MarginNote，再以备份包内 addonid 定位并还原完整插件目录，核对资源后后台启动。

真实 iPad 下拉、触摸、旋转、分屏及 Mac 宿主实际拖动未验收；Issue 保持开放。版本保持 0.1.42，未提交、推送或发布。
