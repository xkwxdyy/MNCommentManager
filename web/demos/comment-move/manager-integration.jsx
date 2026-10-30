// Test harness only. The production entry never imports this simulated bridge.
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../src/App';
import MNBridge from '../../src/lib/mnBridge';
import { defaultSettings, structureSignature } from '../../src/lib/commentModules.mjs';
import '../../src/styles.css';
import '../../src/components/PanelControls.css';
import graph from './assets/video-comment.png?inline';

let snapshot = { noteId: 'drag-integration-demo', noteTitle: '拖动总览 · 模拟验收卡片', error: '',
  moduleSettings: defaultSettings(), commentFold: { supported: true, revision: '1' },
  excerpt: { present: true, type: 'text', text: '模拟摘录：原生摘录保留原有移动方式。', capabilities: {} },
  comments: Array.from({ length: 24 }, (_, index) => ({ index, type: index % 7 === 2 ? 'imageComment' : 'textComment',
    text: ['定义与条件', '记录上下文', '图像说明', '例子与反例', '关键步骤', '应用范围'][index % 6] + ` · 第 ${index + 1} 条\n完整管理器的实际组件，使用模拟数据验证拖动、取消和撤销。`,
    imageBase64: index % 7 === 2 ? graph : '', imageHash: index % 7 === 2 ? 'demo-image' : '', collapsed: false,
    capabilities: { canMove: true, canCopyText: true, canSetCollapsed: true } })) };
MNBridge.send = async (command, payload) => {
  if (['getCurrentNoteComments', 'refreshCurrentNote'].includes(command)) return snapshot;
  if (command === 'moveComments') {
    if (payload.expectedStructure && payload.expectedStructure !== structureSignature(snapshot.comments)) throw new Error('模拟列表已变化');
    const from = payload.indices[0], to = payload.targetIndex > from ? payload.targetIndex - 1 : payload.targetIndex;
    const comments = snapshot.comments.slice(); comments.splice(to, 0, comments.splice(from, 1)[0]);
    snapshot = { ...snapshot, comments: comments.map((c, index) => ({ ...c, index })), selectedIndices: [to], commentFold: { supported: true, revision: String(+snapshot.commentFold.revision + 1) } };
    return snapshot;
  }
  if (command === 'getActionButtonSettings') return {};
  if (command === 'listWorkflows') return [];
  if (command === 'getAddonUpdateState') return { version: '模拟验收', status: 'idle' };
  throw new Error('模拟验收页面仅开放读取与拖动排序');
};
createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
