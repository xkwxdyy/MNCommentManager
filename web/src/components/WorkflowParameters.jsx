import React from "react";

export default function WorkflowParameters({ schema, options, onChange, disabled = false }) {
  const values = options && typeof options === "object" && !Array.isArray(options) ? options : {};
  return <div className="workflow-visual-options">
    {schema.map((field) => {
      const value = Object.prototype.hasOwnProperty.call(values, field.key) ? values[field.key] : field.default;
      const update = (next) => onChange({ ...values, [field.key]: next });
      let control;
      if (field.type === "boolean") {
        control = <input type="checkbox" disabled={disabled} checked={value === true} onChange={(event) => update(event.target.checked)} />;
      } else if (field.type === "enum") {
        const index = field.choices.findIndex((choice) => choice.value === value);
        control = <select disabled={disabled} value={index < 0 ? "" : String(index)} onChange={(event) => update(field.choices[Number(event.target.value)].value)}>
          {index < 0 ? <option value="" disabled>{value === undefined ? "请选择…" : "当前选项无效，请重新选择"}</option> : null}
          {field.choices.map((choice, choiceIndex) => <option key={choice.value} value={String(choiceIndex)}>{choice.label}</option>)}
        </select>;
      } else if (field.type === "number") {
        control = <input type="number" disabled={disabled} value={value ?? ""} min={field.min} max={field.max} step={field.integer ? 1 : "any"} onChange={(event) => update(event.target.value === "" ? "" : Number(event.target.value))} />;
      } else {
        const display = typeof value === "string" ? value : "";
        control = <input disabled={disabled} value={field.escapedNewlines ? display.replace(/\n/g, "\\n") : display} maxLength={field.escapedNewlines ? undefined : field.maxLength} onChange={(event) => update(field.escapedNewlines ? event.target.value.replace(/\\n/g, "\n") : event.target.value)} />;
      }
      return <div key={field.key}>
        <label className={field.type === "boolean" ? "workflow-inline-check" : undefined}>
          <span>{field.label}{field.required ? "（必填）" : ""}</span>{control}
        </label>
        {!field.required && Object.prototype.hasOwnProperty.call(values, field.key) ? <button type="button" className="ghost compact" disabled={disabled} onClick={() => {
          const next = { ...values }; delete next[field.key]; onChange(next);
        }}>{field.default === undefined ? "清除" : "恢复默认"}</button> : null}
      </div>;
    })}
    {!schema.length ? <small className="workflow-options-hint">此动作没有需要配置的参数。</small> : null}
  </div>;
}
