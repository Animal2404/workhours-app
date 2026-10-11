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

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StoreProvider, useStore, useThemeEffect } from './lib/store';
import { CalendarPage } from './pages/CalendarPage';
import { StatsPage } from './pages/StatsPage';
import { GoalsPage } from './pages/GoalsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TabBar, type TabKey } from './components/TabBar';
import { ToastHost, type ToastMsg, type ToastTone } from './components/ui';
import { BellIcon, ClockIcon, Icon, X } from './components/Icon';
import { dateLabel, todayKey } from './lib/date';

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
  const [reminderMuted, setReminderMuted] = useState(false);

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
  const goStats = useCallback(() => setTab('stats'), []);

  /* ---------------- 记账提醒 ----------------
     说明：这是**应用内**提醒，不是系统推送。
     WebView 里没有原生通知能力，装推送插件要做原生改造；
     与其挂一个「已开启提醒」却什么都不做的开关（之前就是），
     不如把能做到的做扎实：打开 App、且过了设定时间、今天还没记 → 顶部提醒一句。 */
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    // 每分钟对一次表就够了；提醒要跨过设定时刻也能出现
    const t = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const reminder = useMemo(() => {
    const s = state.settings;
    if (!s.reminderEnabled || reminderMuted) return null;
    const today = todayKey();
    if (state.entries[today]) return null; // 今天已记，不打扰
    const [hh, mm] = (s.reminderTime || '20:00').split(':').map(Number);
    const d = new Date(nowTick);
    const dueAt = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      Number.isFinite(hh) ? hh : 20,
      Number.isFinite(mm) ? mm : 0,
      0,
      0,
    ).getTime();
    if (d.getTime() < dueAt) return null;
    return `今天（${dateLabel(today)}）还没记账`;
  }, [state.settings, state.entries, reminderMuted, nowTick]);

  return (
    <div className="app">
      <main className="app-main">
        {reminder ? (
          <div className="reminder-bar" role="status">
            <ClockIcon size={15} />
            <span className="reminder-text">{reminder}</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setTab('calendar')}>
              去记
            </button>
            <button
              type="button"
              className="icon-btn is-small"
              aria-label="今天不再提醒"
              onClick={() => setReminderMuted(true)}
            >
              <Icon icon={X} size={14} />
            </button>
          </div>
        ) : null}

        {tab === 'calendar' ? (
          <MemoCalendarPage
            state={state}
            onSave={store.upsert}
            onSaveMany={store.upsertMany}
            onDeleteMany={store.removeMany}
            onDelete={store.remove}
            onToast={pushToast}
            onGoStats={goStats}
          />
        ) : null}
        {tab === 'stats' ? <MemoStatsPage state={state} /> : null}
        {tab === 'goals' ? (
          <MemoGoalsPage
            state={state}
            onGoSettings={goSettings}
            onAddGoal={store.addSavingsGoal}
            onUpdateGoal={store.updateSavingsGoal}
            onRemoveGoal={store.removeSavingsGoal}
          />
        ) : null}
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
