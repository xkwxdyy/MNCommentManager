# MarginNote Comment 折叠接口接入指南

面向插件开发者，更新于 2026 年 10 月 11 日。

这组接口用于读取、折叠或展开卡片中的 Comment，支持单条及批量操作。文字、图片、手写等 Comment 使用相同接口；它只改变显示状态，不删除内容，不修改图片或笔迹，也不折叠脑图分支。

调用流程是：**读取 Comment 状态 → 让用户选择目标 → 带着该状态的版本号提交 → 检查保存结果**。宿主负责保存、读回校验、撤销记录和刷新，插件不必再保存一次。

## 选择接入方式

|场景|读取|折叠或展开|返回方式|
|---|---|---|---|
|原生插件 JavaScript 上下文，已有 Database、Note 对象|`note.commentState()`|`note.setCommentsCollapsed(targets, collapsed, revision)`|同步对象；检查 ok|
|新版插件 HTML 面板，宿主注入 mn 对象|`mn.api('/notes/{id}/comments')`|`mn.api('/notes/{id}/comments/fold', options)`|Promise；检查 error 和 persisted|

两种入口共用折叠事务与目标选择规则，但**返回格式不同，不要混用成功判断**。下文假设插件已获得用户选择的卡片 ID；示例不会自动选择当前卡或全库卡片。

## 新版网页面板快速接入

代码运行在 MarginNote 承载的插件网页面板中。面板通过 `mnpanel://` 自定义协议在应用进程内访问 Bridge；不是在 Safari 或系统 `openURL` 中打开一个修改链接，也不需要启动 HTTP 服务或向网页提供 token。

`mn.api()` 自动添加 `/bridge/v1` 前缀，自动将对象 body 编成 JSON。以下示例使用默认 JSON 响应方式。

### 复制这组辅助函数

```javascript
async function commentRequest(path, options) {
  if (typeof mn === "undefined" || typeof mn.api !== "function") {
    throw new Error("请在支持 mn.api 的 MarginNote 插件网页面板中调用");
  }
  const reply = await mn.api(path, options);
  if (!reply || typeof reply !== "object") {
    throw new Error("Comment 接口没有返回有效数据");
  }
  if (reply.error) {
    const error = new Error(reply.error.message || reply.error.code);
    error.code = reply.error.code;
    error.details = reply.error.details;
    throw error;
  }
  return reply;
}

async function readCardComments(noteId) {
  return commentRequest("/notes/" + encodeURIComponent(noteId) + "/comments");
}

async function writeCommentFold(state, targets, collapsed) {
  const result = await commentRequest(
    "/notes/" + encodeURIComponent(state.noteid) + "/comments/fold",
    {
      method: "POST",
      body: {
        targets,
        collapsed,
        expectedRevision: state.revision,
        confirm: true
      }
    }
  );
  if (result.persisted !== true) {
    throw new Error("Comment 折叠未确认保存成功");
  }
  return result;
}
```

`writeCommentFold` 应在用户明确选择目标和操作方向后调用。它接收先前读取的 state，不会在提交前偷偷刷新版本号，因此可以防止选择期间发生排序、编辑后改错条目。

### 读取和提交选择

以下语句放在面板的 async 回调里，noteId 是插件业务传入的真实卡片 ID：

```javascript
let state = await readCardComments(noteId);
console.log(state.comments);
// 用 state.comments 渲染选择列表，并保留对应的 state。
```

假设用户已从该列表中选中第 1、3 条，且卡片确实有这些 Comment，在按钮回调中调用：

```javascript
// 折叠第 1、3 条；单条时只传一个目标。
state = await writeCommentFold(state, [{index: 1}, {index: 3}], true);

// 用户之后选择展开第 1 条，使用上次成功写入返回的新版本。
state = await writeCommentFold(state, [{index: 1}], false);
```

true 是折叠，false 是展开，不是切换状态的 toggle。不要在页面加载时自动执行示例中的写操作。

默认 JSON 模式下，`mn.api()` 遇到 HTTP 4xx/5xx 仍可能 resolve 一个 `{error: ...}` 对象，不能只用 try/catch 判断请求成功。上面的 commentRequest 已将业务错误转成异常；网络或 JSON 解析错误也应由调用方捕获并展示。

### 仅预检而不修改数据

```javascript
const preview = await mn.api(
  "/notes/" + encodeURIComponent(state.noteid) + "/comments/fold",
  {
    method: "POST",
    body: {
      targets: [{index: 1}],
      collapsed: true,
      expectedRevision: state.revision,
      confirm: false
    }
  }
);
if (preview.error && preview.error.code === "CONFIRM_REQUIRED") {
  console.log(preview.error.details); // 计划变更数量、实际归属卡片等
  // 校验已通过，但没有写入。其他 error 必须单独处理。
}
```

confirm 缺省或为 false 时不会写入。预检通过返回 HTTP 422、`CONFIRM_REQUIRED`，不是保存成功；非法参数或旧版本号则返回对应错误。预检不保证后续保存一定成功，提交时仍会重新校验。

## 原生插件快速接入

这部分运行在已有 Database 对象的原生插件 JavaScript 上下文，不是在 HTML 页面中。请在主线程调用，不要跨线程传递 Note 或 JSContext。

### 获取卡片并读取状态

```javascript
var note = Database.sharedInstance().getNoteById(noteId);
if (!note) throw new Error("找不到卡片，请检查 noteId");
if (typeof note.commentState !== "function" ||
    typeof note.setCommentsCollapsed !== "function") {
  throw new Error("当前 MarginNote 版本尚不支持 Comment 折叠 API");
}

var state = note.commentState();
if (!state.ok) throw new Error(state.error.code + ": " + state.error.message);
// 用 state.comments 显示选择列表，保留对应版本号。
```

### 提交用户选择

```javascript
var result = note.setCommentsCollapsed(
  [{index: 1}, {index: 3}],
  true,
  state.revision
);
if (!result.ok) {
  throw new Error(result.error.code + ": " + result.error.message);
}
if (result.persisted !== true) throw new Error("Comment 折叠未确认保存成功");
state = result;
```

原生接口不接收 confirm 参数，也没有单独的预检参数。它自行管理保存和撤销组，无需额外调用 `Database.savedb()` 或再包一层 `UndoManager.undoGrouping()`。

## 参数和目标选择规则

|参数|约定|
|---|---|
|targets|1–200 个目标；单条就是长度为 1 的数组，不接受空数组。|
|collapsed|必须是 JavaScript true 或 false，不接受 1、0 或字符串。|
|expectedRevision|网页面板请求体中的版本号，来自该卡读取或成功写入返回的 revision。原生接口用第三个参数传入。|
|confirm|仅网页面板写请求使用；true 才执行。|

每个目标只能选择以下一种格式：

```json
{"index": 1}
```

```json
{"ownerNoteId": "实际存储卡片ID", "commentId": "稳定CommentID"}
```

索引**从 1 开始**，直接使用 state\.comments 中的 index。它不是 JavaScript 数组下标，也不同于旧 removeCommentByIndex 等接口的 0 起索引；不包含标题和主摘录，图片、手写、音频等 Comment 也占序号。

同一个数组可以混用两种目标格式，但单个目标不能同时带 index 和 ID；也不能重复选择同一条 Comment，包括分别用索引和 ID 指向同一条。

有稳定 ID 时，可以从刚读取的条目生成目标：

```javascript
const comment = state.comments[0];
const target = comment.commentId
  ? {ownerNoteId: comment.ownerNoteId, commentId: comment.commentId}
  : {index: comment.index};
// 将 target 放入 targets 数组，仍然使用同一个 state.revision。
```

历史条目的 commentId 可能为 null，可以先用索引操作。读取不会补写 ID；只有实际改变折叠状态时，宿主才会为缺少 ID 的条目补上。使用稳定 ID 也必须提交版本号。

所有参数和目标先整体校验；任何一个无效都不会开始写入。不要直接修改 note\.comments 返回的数据或拼写内部存储字段来实现折叠。

## 返回数据

### 读取结果

两种入口都返回 noteid、revision、comments，原生入口额外有 `ok: true`。以下是简化的网页面板读取示例：

```json
{
  "noteid": "卡片ID",
  "revision": "不透明版本令牌",
  "comments": [
    {
      "index": 1,
      "ownerNoteId": "实际存储卡片ID",
      "commentId": null,
      "collapsed": false,
      "type": "TextNote",
      "text": "这是一条 Comment"
    }
  ]
}
```

条目可能额外包含 field、fieldLabel 或批注类型信息。text 是用于识别的文字摘要，最多 4000 个 UTF\-16 代码单元，不是完整内容备份接口。revision 是不透明令牌，请原样传回，不要自行计算、解析或长期缓存。

### 写入结果

成功写入返回最新的 revision 和 comments，以及：

|字段|含义|
|---|---|
|persisted|必须为 true，表示通过独立数据库读回校验。|
|collapsed|本次请求的方向。|
|requestedCount|选择的 Comment 数量。|
|changedCount|实际改变折叠状态的数量。|
|affectedOwnerNoteIds|实际发生变更的存储卡片 ID。|
|ok|仅原生入口成功时为 true；网页面板成功响应没有此字段。|

重复设为已有状态是幂等操作，changedCount 可以为 0；不产生额外数据库保存或撤销组，但仍校验版本及持久化状态。

### 引用卡的影响

引用卡显示的 Comment 不一定存储在引用卡自己身上。共享内容写到原卡，本地 Comment 写到引用卡；宿主会对相关卡片发出刷新通知。

不要把 ownerNoteId 强行改成当前卡片 ID。如果用户只想改变引用卡自己的独立内容，应选择 ownerNoteId 对应引用卡的条目。

## 版本检测和运行条件

需要使用包含这组接口的 MarginNote 4 构建；不要仅凭“能调用 mn\.api”就认定该版本支持 Comment 折叠写入。

- 原生插件：按示例检查两个方法是否存在。

- 网页面板：可读取 `mn.api('/capabilities')` 的 commentFolding 字段了解后端能力，但它不单独保证面板写路由已放行。对一个真实、有效的目标发送 confirm:false 预检，收到 CONFIRM\_REQUIRED 才说明这次请求通过了路由和参数校验；预检不改数据。

- IN\_PROCESS\_NOT\_ALLOWED 表示面板路由被拦截，旧构建可能尚未放行该入口。

- 网页面板每次写请求都会检查沉浸模板是否生效、是否允许该插件，以及插件是否已暂停或禁用。接口不会绕过这些限制。

- 原生入口要求有效的数据库卡片及可用的保存和撤销上下文，拒绝历史学习集或只读存储写入。

调用前先完成其他编辑操作。保存复用宿主现有数据库上下文，也可能同时提交其中已经存在的待保存更改。

折叠不是访问权限控制，也不是复习遮答案接口。展示范围可查看 `capabilities.commentFolding.uiSurfaces` 和 `uiExclusions`；不要假设每一种编辑或复习视图都隐藏折叠内容。

## 常见错误和处理

原生失败返回 `{ok: false, error: {code, message, details?}}`；网页面板默认 JSON 失败返回 `{error: {code, message, ...}}`。两个入口都不要仅检查返回对象是否存在。

|错误码|建议处理|
|---|---|
|INVALID\_INPUT|检查索引从 1 起、目标数量、布尔类型及必填版本号。|
|NOTE\_NOT\_FOUND|网页面板请求的卡片不存在，重新核对 ID。|
|COMMENT\_CHANGED|内容、顺序、状态或目标已变化；重新读取、重新展示选择，让用户确认后再提交。不要保留旧索引自动换新版本强写。|
|CONFIRM\_REQUIRED|网页面板预检通过但没有写入；获用户确认后提交 confirm:true。|
|IN\_PROCESS\_NOT\_ALLOWED|面板未放行该路由；检查路径及宿主版本，不要尝试绕过白名单。|
|ADDON\_NOT\_ACTIVE|插件未在当前沉浸模板中启用，或已暂停、禁用。|
|COMMENT\_OWNER\_UNAVAILABLE|原始 Comment 存储卡片不可用；重新获取卡片后检查。|
|COMMENT\_ID\_AMBIGUOUS|存在重复 ID；重新读取、核对目标，必要时按本次索引选择，勿自动删数据。|
|COMMENT\_STATE\_UNSUPPORTED|内容无法安全生成版本令牌，或元数据版本不支持；停止修改。|
|COMMENT\_NOT\_PERSISTED|当前内容尚未通过持久化校验；完成其他保存后重新读取。|
|SAVE\_FAILED|保存或读回校验失败；保留 details 用于诊断，检查 rollbackRestored，不要循环重试或声称保存成功。|
|MAIN\_THREAD\_REQUIRED|原生插件应回到主线程调用。|
|NOTE\_UNAVAILABLE / CONTEXT\_NOT\_READY|原生卡片已失效、是临时副本，或保存和撤销上下文不可用。|
|READ\_ONLY|原生接口拒绝历史学习集或只读存储写入。|

details 是可选诊断信息，不应依赖其中的内部字段实现业务流程。失败回退沿用宿主已有流程，不能假定每次失败都已成功恢复。接口不会自行弹出去重确认框或自动删除重复记录。

## 接入自测清单

先在测试卡片上验证以下行为，再开放给用户：

1. 读取包含文字、图片、手写的卡片，确认索引与选择列表一致。

2. 单条折叠、批量折叠、展开后重新读取，检查 persisted 和最新状态。

3. 连续设置相同状态，确认 changedCount 为 0。

4. 在一次读取后修改或排序 Comment，再用旧版本提交，应收到 COMMENT\_CHANGED。

5. 网页面板不带确认或使用 confirm:false，应不改变数据。

6. 保存后撤销、重做；引用卡还需检查原卡与本地 Comment 的实际归属。

7. 遇到错误时显示具体错误码，不把“请求已返回”当成“保存成功”。

宿主仓库中的定向验证命令：

```sh
node tools/mn-comment-state/plugin-test.js
node --test tools/mn-comment-state/test.js
bash output/tools/addon/route_allowlist_check.sh
```

这些测试使用隔离资料库或静态路由检查，不操作用户真实资料库。插件自身仍需在目标宿主构建中验证按钮、选中目标和提示交互。
