/* ============================================================
   工时记 · 入口
   ------------------------------------------------------------
   只负责：样式引入 + 挂载根组件。
   App 外壳（主题/切 tab/提示条）在 src/App.tsx。
   ============================================================ */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/app.css';

import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('找不到 #root 挂载点');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
