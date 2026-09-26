/* ============================================================
   工时记 · App 外壳
   ------------------------------------------------------------
   从 main.tsx 抽出来，入口只留 createRoot。
   职责：主题、tab 切换、全局提示条、存储失败告警。

   性能要点（都对应测出来的数字，别随手改回去）：
   1. 四个页面全部 memo 化 —— 外壳自身的 state（toast 队列）变化
      不该把当前页面整棵重渲。pushToast 只在保存/导入时发生，
      但一次重渲 = 日历 42 个格子 + 统计 31 根柱子重算一遍。
   2. 传给页面的回调必须是稳定引用（useCallback / store 里已 memo），
      否则 memo 形同虚设。
   ============================================================ */

import { memo, useCallback, useRef, useState } from 'react';
import { StoreProvider, useStore, useThemeEffect } from './lib/store';
import { CalendarPage } from './pages/CalendarPage';
import { StatsPage } from './pages/StatsPage';
import { GoalsPage } from './pages/GoalsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TabBar, type TabKey } from './components/TabBar';
import { ToastHost, type ToastMsg, type ToastTone } from './components/ui';
import { BellIcon } from './components/Icon';

const MemoCalendarPage = memo(CalendarPage);
const MemoStatsPage = memo(StatsPage);
const MemoGoalsPage = memo(GoalsPage);
const MemoSettingsPage = memo(SettingsPage);

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
          <MemoCalendarPage
            state={state}
            onSave={store.upsert}
            onDelete={store.remove}
            onToast={pushToast}
          />
        ) : null}
        {tab === 'stats' ? <MemoStatsPage state={state} /> : null}
        {tab === 'goals' ? <MemoGoalsPage state={state} onGoSettings={goSettings} /> : null}
        {tab === 'settings' ? <MemoSettingsPage store={store} /> : null}
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

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
