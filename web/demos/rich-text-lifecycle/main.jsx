// The actual production UI, with an isolated memory-only implementation of its native commands.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../src/App';
import MNBridge from '../../src/lib/mnBridge';
import { createStore } from './model.mjs';
import { createPrototypeBridge } from './mockBridge.mjs';
import 'katex/dist/katex.min.css';
import '../../src/styles.css';
import '../../src/components/PanelControls.css';
import './prototype.css';
const store = createStore();
MNBridge.send = createPrototypeBridge(store);
function Prototype() {
  const [version, setVersion] = useState(0);
  useEffect(
    () =>
      store.subscribe(({ changed }) => {
        setVersion((v) => v + 1);
        if (changed)
          window.__MNCommentManagerNativeSync?.({
            snapshot: store.snapshot(),
            reason: 'prototype',
          });
      }),
    [],
  );
  return (
    <div className="rich-demo-shell" data-revision={version}>
      <section className="rich-demo-toolbar">
        <div className="rich-demo-toolbar-title">
          <strong>原生富文本 · 交互原型</strong>
          <span>示例数据 · 刷新页面后重置</span>
        </div>
        <div className="rich-demo-tabs" role="tablist" aria-label="示例卡片">
          {store.cards.map((c) => (
            <button
              role="tab"
              key={c.id}
              aria-selected={c.id === store.card.id}
              onClick={() => {
                if (window.__MNCommentManagerCanSwitchCard?.() === false) return;
                store.switchCard(c.id);
              }}
            >
              {c.tab}
            </button>
          ))}
        </div>
        <button className="ghost" aria-label="重置全部示例" onClick={() => location.reload()}>
          重置示例
        </button>
      </section>
      <div className="rich-demo-panel">
        <App />
      </div>
      <p className="rich-demo-notice">原型使用示例数据，不会修改 MarginNote 评论。</p>
    </div>
  );
}
createRoot(document.getElementById('root')).render(<Prototype />);
