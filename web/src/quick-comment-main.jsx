import React from 'react';
import { createRoot } from 'react-dom/client';
import QuickComment from './QuickComment';
import { installQuickCommentDemo } from './lib/quickCommentDemo';

const demo = new URLSearchParams(window.location.search).get('demo') === '1';
if (demo) installQuickCommentDemo();
const root = createRoot(document.getElementById('root'));
let session = 0;
const render = () => root.render(<QuickComment key={session++} />);
if (demo) window.addEventListener('quick-demo-open', render);
render();
