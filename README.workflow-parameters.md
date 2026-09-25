# 工作流动作参数

2026-09-22：动作可选提供 `parameterSchema` 数组。Native Registry 是定义与验证的真源；`getActionCatalog` 给 WebView 的是独立 JSON 副本。当前合并评论动作已接入，其他没有 schema 的扩展保留原有 options。

```js
registerAction({
  id: "example.repeat",
  title: "示例动作",
  scope: "both",
  parameterSchema: [
    { key: "count", label: "次数", type: "number", min: 1, max: 10, integer: true, default: 1 },
    { key: "enabled", label: "启用", type: "boolean", default: true },
    { key: "text", label: "文本", type: "string", maxLength: 256 },
    { key: "mode", label: "模式", type: "enum", required: true, choices: [
      { value: "a", label: "模式 A" }, { value: "b", label: "模式 B" }
    ] }
  ],
  run(context, options) { /* options 已通过 Native 校验 */ }
}, "example.patch");
```

- 参数最多 24 项；key 为字母开头的字母、数字、下划线，禁止重复及原型相关名称。
- 支持 string、boolean、number、enum。类型、默认值、数值边界、字符串长度、枚举成员均校验；不隐式转换字符串数字/布尔值，不支持脚本型参数。
- 字符串 `escapedNewlines: true` 沿用原合并表单的 `\n` 换行输入。
- `required` 表示缺省且无 default 时拒绝执行。可选值可清除或恢复默认；默认值在 Native 执行校验时应用。
- schema 存在时拒绝未知参数。schema 缺省时保留旧扩展的 JSON options；不是把未知参数静默丢弃。
- 保存、预览和执行都校验；执行先校验全部步骤，再进入确认及撤销分组。确认期间对原始 options 的改动不影响已捕获参数。
- WebView 只维护草稿，仍通过现有 bridge 保存，未新增浏览器业务存储。

验证：`node scripts/test-workflow-parameters.js`、`node_modules/.bin/vitest run web/src/components/WorkflowParameters.test.jsx`。VM/DOM 测试和构建不替代 MarginNote 设备验收。
