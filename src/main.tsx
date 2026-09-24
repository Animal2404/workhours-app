/* ============================================================
   工时记 · 入口
   ============================================================ */

import { StrictMode, useCallback, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/app.css';

import { StoreProvider, useStore, useThemeEffect } from './lib/store';
import { CalendarPage } from './pages/CalendarPage';
import { StatsPage } from './pages/StatsPage';
import { GoalsPage } from './pages/GoalsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TabBar, type TabKey } from './components/TabBar';
import { ToastHost, type ToastMsg, type ToastTone } from './components/ui';
import { BellIcon } from './components/Icon';

function Shell() {
  const store = useStore();
  const { state } = store;
  const [tab, setTab] = useState<TabKey>('calendar');
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const toastId = useRef(0);

  useThemeEffect(state.settings.theme);

  const pushToast = useCallback((text: string, tone: ToastTone = 'info') => {
    const id = ++toastId.current;
    // 最多同时留 2 条，多了会挡视线
    setToasts((prev) => [...prev.slice(-1), { id, text, tone }]);
  }, []);

  const expireToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const goSettings = useCallback(() => setTab('settings'), []);

  return (
    <div className="app">
      <main className="app-main">
        {state.settings.reminderEnabled ? (
          <p className="sr-only" aria-live="polite">
            已开启记账提醒，每天 {state.settings.reminderTime}
          </p>
        ) : null}

        {tab === 'calendar' ? (
          <CalendarPage
            state={state}
            onSave={store.upsert}
            onDelete={store.remove}
            onToast={pushToast}
          />
        ) : null}
        {tab === 'stats' ? <StatsPage state={state} /> : null}
        {tab === 'goals' ? <GoalsPage state={state} onGoSettings={goSettings} /> : null}
        {tab === 'settings' ? <SettingsPage store={store} /> : null}
      </main>

      <TabBar active={tab} onChange={setTab} />
      <ToastHost toasts={toasts} onExpire={expireToast} />

      {store.storageFailed ? (
        <div className="toast-host" style={{ bottom: 'auto', top: 12 }}>
          <div className="toast is-in is-info" role="alert">
            <BellIcon size={15} />
            <span>无法写入本地存储，数据这次可能不会被保存</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('找不到 #root 挂载点');

createRoot(container).render(
  <StrictMode>
    <StoreProvider>
      <Shell />
    </StoreProvider>
  </StrictMode>,
);
