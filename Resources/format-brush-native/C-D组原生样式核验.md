# C、D 组原生样式核验

日期：2026-11-15。宿主：MarginNote 5.1.0（51007）Mac。输入文件：[字段样式预览](</Users/xiakangwei/Nutstore/MarginNote/MarginNote Develop/MarginNote Addon/Projects/mnknowledgebase/.tmp/field-style-explorer-20261115/field-style-explorer.html>)；交付时源文件 SHA-256 为 `70a9d3cafd47ae1fbba2767c0d026497f8f72ebbb2e4b2459a1d72aa52d35f02`。源文件未修改。

本次标准是保存为具有 RTF 的原生 HTML 评论，继续由原生富文本编辑器编辑；HTML 渲染评论与 Markdown HTML 不作为实现通过。

| 项目 | 结果与边界 |
| --- | --- |
| 字重、字体与字号 | 原生接口传入 `fontName: 'PingFangSC-Semibold'` 后，AppKit 回读确为半粗体字体；`fontWeight: 700` 作为额外样式键被忽略。使用具体字体名称可以实现已验证的半粗体效果。 |
| C 组统一色竖条、括号 | `▍`、`〔〕` 可以作为普通正文字符，配合统一字体、字号与颜色保存为原生 RTF；竖条不是 CSS 边框，字符也会进入正文及导出结果。已实测 `▍证明` 字符及半粗体；括号属于同一普通字符方案。 |
| C12、C13、C14、C15 的双色分段 | Cocoa HTML 导入器能将竖条、括号与字段文字保存为不同颜色的富文本分段，C12、C13、C15 已独立转换验证；C14 与 C13 结构相同、仅色值不同。现有 `appendRichTextComment(text, style)` 只接受整条统一样式，未提供分段属性入口，完整双色版本尚未写入 MarginNote 原生 RTF。 |
| D16 基本下划线 | Cocoa 独立导入 D16 后得到 `underlineStyle=1` 和 PingFangSC-Semibold；富文本格式本身能够表示下划线。实际插件向 `appendRichTextComment` 传入 `underline`、`underlineStyle`、`textDecoration` 后，原生 RTF 回读仍为 `underlineStyle=0`，没有下划线。当前公开追加接口不支持该写入方式。 |
| CSS 左边框、间距、圆角与渐变 | 原生追加接口未处理相关键。对 `border-left` 与 `padding-left` 的 Cocoa 独立转换也未得到边框或缩进效果；不能以浏览器预览作为原生实现证据。圆角、渐变未做新的宿主渲染验收。 |

## 追加路径的实际差异

真实插件在专用子卡分别测试了统一富文本追加与 C12、C13、C15、D16、CSS 左边框的 HTML 追加。

- `appendRichTextComment` 保存 `type=HtmlNote`、`text`、`rtf`；自定义字体和色值能够独立解码。
- `appendHtmlComment(html, text, size, tag)` 保存 `html`、`htmlSize`、`medialst`、`tag`、`text`、`type`，没有 `rtf`；延迟回读结果相同。该路径仍需要 HTML 渲染，不满足本次原生 RTF 要求。
- HTML 字符串能够被 Cocoa 转换成带下划线或双色的 RTF，不代表当前插件追加 API 能接收该结果，也不证明 MarginNote 的显示、双击编辑与保存已通过。

因此，预览文件中 C 组“原生双 Span”和 D16“原生零改直用”只能视为格式能力设想，不能作为当前插件 API 的已验证能力。完整实现需要能够写入原生 RTF 或分段属性的明确宿主接口；本次没有采用内部数据结构写入方式。

已验证的原生示例：

```js
// rawNote 为 MbBookNote；MNUtils 的同名包装不会转发 style 参数。
rawNote.appendRichTextComment('▍证明', {
  fontName: 'PingFangSC-Semibold',
  fontSize: 15,
  textColor: '#2563EB'
});
```

字段标题增加前缀后，字段名识别与归一规则需要同步适配；本次未修改知识库的字段识别或生产模板。

## 证据与保留项

真实样式子卡：`19009663-C0B9-40E4-9EC3-3DD4211F9E03`，位于“评论管理器格式刷验收 2026-11-15”学习集。根卡中的格式刷验收评论仍保持整批撤销后的原始状态。

原始插件回执、RTF、扩展 AppKit 解析及 Cocoa 转换结果位于 `artifacts/format-brush-native/live-evidence/styles-*.json`、`style-native-*-appkit.json`、`style-cocoa-*.json`。独立 Cocoa 转换仅使用本地静态 HTML，未写入 MarginNote。C/D 的完整原生写入、双击修改和修改后保留格式均未通过本轮验证，不以已有普通淡蓝色评论的双击实测替代。
