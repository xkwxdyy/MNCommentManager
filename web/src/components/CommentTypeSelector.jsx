import React from "react";

const TYPES = [
  { value: "text", label: "普通文本" },
  { value: "markdown", label: "Markdown" },
  { value: "html", label: "富文本（HTML）" },
  { value: "image", label: "图片 / 手写" },
  { value: "link", label: "纯卡片链接" },
];
const TEXT_TYPES = ["text", "markdown", "html"];

export default function CommentTypeSelector({ types, onChange, disabled = false }) {
  const selected = Array.isArray(types) ? [...new Set(types)] : [];
  const all = selected.length === 0;
  const options = [...TYPES, ...selected.filter((type) => !TYPES.some((item) => item.value === type))
    .map((type) => ({ value: type, label: `其他类型：${type}` }))];
  return (
    <fieldset className="comment-type-selector" disabled={disabled}>
      <legend>评论类型（可多选）</legend>
      <div className="comment-type-shortcuts">
        <button type="button" aria-pressed={all} onClick={() => onChange([])}>全部评论</button>
        <button type="button" aria-pressed={selected.length === TEXT_TYPES.length && TEXT_TYPES.every((type) => selected.includes(type))} onClick={() => onChange([...TEXT_TYPES])}>所有文本</button>
      </div>
      <div className="comment-type-choices">
        {options.map(({ value, label }) => (
          <label key={value}>
            <input type="checkbox" checked={selected.includes(value)}
              disabled={disabled || (selected.length === 1 && selected[0] === value)}
              onChange={(event) => onChange(event.target.checked ? [...selected, value] : selected.filter((type) => type !== value))} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <small>{all ? "当前不限类型；勾选具体类型可缩小范围。" : "匹配任一已选类型；至少保留一种，或切换为全部评论。"}</small>
    </fieldset>
  );
}
