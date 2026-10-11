import { PRESETS } from './engine.mjs';

const picture = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="540" height="190" viewBox="0 0 540 190"><rect width="540" height="190" rx="16" fill="#edf5ff"/><path d="M48 142L124 88L190 110L280 42L360 62L490 22" fill="none" stroke="#0071e3" stroke-width="4"/><path d="M48 20V160H505" fill="none" stroke="#9aa9b8"/><text x="64" y="42" font-family="sans-serif" font-size="15" fill="#456">f(x) · sample figure</text></svg>')}`;
const c = (type, text, extra = {}) => ({ type, text, collapsed: false, ...extra });
const html = text => c('HtmlComment', `<strong>${text}</strong>`);
const md = text => c('markdownComment', text);
const text = value => c('textComment', value);
const img = value => c('imageComment', value, { image: picture });

export function initialState() {
  const mixed = [
    text('前置说明：模块归属始终按完整评论顺序计算。搜索示例：收敛、图片、例子。'),
    html('证明'), md('# 方法一：直接估计'), text('第一步：设定初始条件，控制误差并建立收敛界限。'), img('收敛过程配图'),
    md('## 误差估计'), md('误差满足 $|e_n| \\leq C/n$。\n\n**标题与正文可以分别选择。**'),
    md('## 边界条件'), text('端点条件需要单独检查。'),
    md('<span id="method">方法二：递推证明</span>'), text('HtmlMD method 作为字段内部的最高级标题。'),
    md('<span id="level1">归纳过程</span>'), text('基例成立，递推步骤保持收敛条件。'),
    html('应用'), text('例子：根据输入条件选择相应方法。'),
    c('linkComment', '参考卡片：应用示例', { linkedNoteId: 'markdown' }), img('应用示例图片'),
    html('空模块'), html('应用'), text('同名模块使用不同标识，选择和收起互不影响。'),
    html('备注'), md('普通内容中的 HTML 不一定需要作为模块标题。'),
  ];
  const definitions = [
    { id: 'mixed', title: '混合评论与嵌套模块', description: 'HTML、Markdown、HtmlMD、图片与链接', comments: mixed },
    { id: 'markdown', title: 'Markdown 章节', description: '标题跳级、单条评论中的正文与重复标题', comments: [text('章节之前的说明。'), md('# 定义\n\n该条评论还包含定义正文，不拆分评论。'), text('定义补充。'), md('### 示例'), img('例子图片'), md('## 性质'), text('性质正文。'), md('# 定义'), text('重复标题的独立内容。')] },
    { id: 'plain', title: '无标题与指定文本', description: '默认未分组，可切换指定文本规则', comments: [text('没有结构标题的普通评论。'), img('普通图片'), text('模块：概念'), text('概念正文。'), text('模块：练习'), text('练习正文。')] },
    { id: 'empty', title: '空卡片', description: '没有评论时的操作边界', comments: [] },
    { id: 'long', title: '长列表与连续选择', description: '用于滚动、边缘自动滚动和筛选测试', comments: Array.from({ length: 12 }, (_, section) => [html(`章节 ${section + 1}`), md('# 核心内容'), ...Array.from({ length: 9 }, (_, item) => item % 4 === 2 ? img(`章节 ${section + 1} 图片 ${item + 1}`) : text(`章节 ${section + 1} 评论 ${item + 1}：滑动选择时，范围之外的已有选择保持不变。`))]).flat() },
  ];
  for (const note of definitions) note.comments = note.comments.map((comment, index) => ({ ...comment, id: `${note.id}-${index}` }));
  return { schemaVersion: 1, revision: 1, cards: definitions, settings: { profiles: structuredClone(PRESETS), defaultProfileId: 'html', includeTitle: true, cardOverrides: {} }, history: [] };
}
