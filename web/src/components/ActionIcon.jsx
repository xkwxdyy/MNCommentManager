import icon1 from "../../../assets/icon-system/arrow-down.svg?raw";
import icon3 from "../../../assets/icon-system/arrow-up.svg?raw";
import icon5 from "../../../assets/icon-system/close.svg?raw";
import icon7 from "../../../assets/icon-system/comment-add.svg?raw";
import icon9 from "../../../assets/icon-system/comments.svg?raw";
import icon11 from "../../../assets/icon-system/edit.svg?raw";
import icon13 from "../../../assets/icon-system/extract.svg?raw";
import icon15 from "../../../assets/icon-system/folder.svg?raw";
import icon17 from "../../../assets/icon-system/grip.svg?raw";
import icon19 from "../../../assets/icon-system/merge.svg?raw";
import icon21 from "../../../assets/icon-system/paintbrush.svg?raw";
import icon23 from "../../../assets/icon-system/refresh.svg?raw";
import icon25 from "../../../assets/icon-system/search.svg?raw";
import icon27 from "../../../assets/icon-system/settings-sliders.svg?raw";
import icon29 from "../../../assets/icon-system/trash.svg?raw";
import icon31 from "../../../assets/icon-system/workflow.svg?raw";

const icons = {
  "arrow-down": icon1,
  "arrow-up": icon3,
  "close": icon5,
  "comment-add": icon7,
  "comments": icon9,
  "edit": icon11,
  "extract": icon13,
  "folder": icon15,
  "grip": icon17,
  "merge": icon19,
  "paintbrush": icon21,
  "refresh": icon23,
  "search": icon25,
  "settings-sliders": icon27,
  "trash": icon29,
  "workflow": icon31,
};

export default function ActionIcon({ name, size = 16, ...props }) {
  const source = icons[name];
  if (!source) return null;
  const body = source.slice(source.indexOf(">") + 1, source.lastIndexOf("</svg>"));
  return <svg {...props} data-action-icon={name} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={size <= 16 ? 2.15 : 1.85} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: body }} />;
}
