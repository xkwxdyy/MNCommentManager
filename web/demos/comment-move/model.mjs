const chapters = [
  ['概念', [
    ['线性映射', '线性映射保持向量的加法与数乘。'],
    ['核与像', '核由映到零向量的向量组成；像由所有输出向量组成。'],
    ['秩与零度', '有限维情形下，定义域维数等于秩与零度之和。'],
    ['单射的判别', '线性映射为单射，当且仅当其核只包含零向量。'],
    ['满射的判别', '像等于整个陪域时，线性映射为满射。'],
    ['同构', '双射的线性映射称为线性同构。'],
  ]],
  ['直观', [
    ['从输入观察映射', '同一输出的原像之间相差一个核中的向量。'],
    ['核记录的信息', '核中的方向经过映射后变为零。'],
    ['像记录的信息', '像描述映射能够得到的全部输出。'],
    ['选取合适的基', '先取核的一组基，再补充为定义域的一组基。'],
    ['补充向量的作用', '补充向量的像构成像空间的一组基。'],
    ['维数分解', '核的基与补充向量共同说明定义域的维数。'],
  ]],
  ['例子', [
    ['平面到直线的投影', '映射 (x, y) ↦ x 的核是纵轴，像为实数空间。'],
    ['平面上的旋转', '旋转是可逆线性映射，核只包含零向量。'],
    ['零映射', '全部向量映到零，核为定义域，像只包含零向量。'],
    ['恒等映射', '每个向量保持不变，核只包含零向量。'],
    ['多项式求导', '在次数有界的多项式空间中，常数多项式属于核。'],
    ['坐标矩阵', '选定基后，线性映射可以由矩阵表示。'],
  ]],
  ['证明', [
    ['证明目标', '证明有限维线性映射的秩与零度之和等于定义域维数。'],
    ['取核的一组基', '记核的一组基为 u₁, …, uₖ。'],
    ['把基补充完整', '补充向量 v₁, …, vᵣ，使其与核的基共同构成定义域的一组基。'],
    ['验证张成性', '把任意输入按这组基展开，作用映射后核中的项消失。'],
    ['验证线性无关', '若 v₁, …, vᵣ 的像满足线性关系，则对应组合属于核。'],
    ['完成维数计算', '因此像空间维数为 r，定义域维数为 k + r。'],
  ]],
  ['边界', [
    ['有限维条件', '本页的维数计数证明以定义域有限维为前提。'],
    ['单射不一定满射', '定义域与陪域不同维时，单射并不保证满射。'],
    ['同维情形', '有限维且同维时，单射、满射与可逆性等价。'],
    ['零空间情形', '定义域为零空间时，秩与零度均为零。'],
    ['陪域与像', '陪域来自映射定义；像需要根据映射计算。'],
    ['避免混淆', '核属于定义域，像属于陪域。'],
  ]],
  ['延伸', [
    ['商空间', '定义域对核取商后，与像空间线性同构。'],
    ['矩阵的秩', '线性映射的秩与表示矩阵的秩一致。'],
    ['复合映射', '两个线性映射的复合仍为线性映射。'],
    ['更换坐标', '更换定义域与陪域的基不会改变秩和零度。'],
    ['复习问题', '先计算核，再选择补充基，最后验证像空间。'],
    ['相关笔记', '继续比较线性同构、商空间和矩阵等价。'],
  ]],
];
export const sections = chapters.map(([name]) => name);
export const initialComments = chapters.flatMap(([section, rows], group) => rows.map(([title, body], row) => ({ id: `c-${group}-${row}`, title, body, section, type: row % 3 === 0 ? '文本' : 'Markdown' })));
export const initialSelection = ['c-0-2'];
export function moveToIndex(comments, sourceId, targetIndex) {
  const sourceIndex = comments.findIndex(comment => comment.id === sourceId);
  if (sourceIndex < 0 || !Number.isFinite(targetIndex)) return comments;
  const target = Math.max(0, Math.min(comments.length - 1, Math.round(targetIndex)));
  if (sourceIndex === target) return comments;
  const rest = comments.filter(comment => comment.id !== sourceId);
  return insertSelection(comments, [sourceId], rest[target]?.id || 'end', 'before');
}
export function insertSelection(comments, selectedIds, anchorId, side = 'after') {
  const chosen = new Set(selectedIds), moving = comments.filter(comment => chosen.has(comment.id));
  const rest = comments.filter(comment => !chosen.has(comment.id));
  if (!moving.length) return comments;
  let index = anchorId === 'start' ? 0 : anchorId === 'end' ? rest.length : rest.findIndex(comment => comment.id === anchorId);
  if (index < 0) return comments;
  const section = rest[anchorId === 'end' ? rest.length - 1 : index]?.section;
  if (anchorId !== 'start' && anchorId !== 'end' && side === 'after') index++;
  return [...rest.slice(0, index), ...moving.map(comment => ({ ...comment, section: section || comment.section })), ...rest.slice(index)];
}
