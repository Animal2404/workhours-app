/* ============================================================
   工时记 · 全局状态
   一个 reducer + context，不做过度抽象。
   ============================================================ */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AppState, DayEntry, RecurringRule, Settings, ShiftTemplate } from './types';
import { coerceState, defaultState, loadState, saveState } from './storage';
import { hasContent, normalizeEntry } from './pay';

type Action =
  | { type: 'upsert'; entry: DayEntry }
  | { type: 'remove'; date: string }
  | { type: 'patchSettings'; patch: Partial<Settings> }
  | { type: 'addTemplate'; template: ShiftTemplate }
  | { type: 'removeTemplate'; id: string }
  | { type: 'addRecurring'; rule: RecurringRule }
  | { type: 'removeRecurring'; id: string }
  | { type: 'toggleRecurring'; id: string }
  | { type: 'replace'; state: AppState }
  | { type: 'clearEntries' };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'upsert': {
      const entry = normalizeEntry(action.entry);
      const entries = { ...state.entries };
      if (hasContent(entry)) {
        entries[entry.date] = entry;
      } else {
        // 清空了所有内容 → 视为删除这天，日历上就不该再显示它
        delete entries[entry.date];
      }
      return { ...state, entries };
    }
    case 'remove': {
      const entries = { ...state.entries };
      delete entries[action.date];
      return { ...state, entries };
    }
    case 'patchSettings':
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case 'addTemplate':
      return {
        ...state,
        settings: {
          ...state.settings,
          templates: [...state.settings.templates, action.template],
        },
      };
    case 'removeTemplate':
      return {
        ...state,
        settings: {
          ...state.settings,
          templates: state.settings.templates.filter((t) => t.id !== action.id),
        },
      };
    case 'addRecurring':
      return {
        ...state,
        settings: {
          ...state.settings,
          recurring: [...state.settings.recurring, action.rule],
        },
      };
    case 'removeRecurring':
      return {
        ...state,
        settings: {
          ...state.settings,
          recurring: state.settings.recurring.filter((r) => r.id !== action.id),
        },
      };
    case 'toggleRecurring':
      return {
        ...state,
        settings: {
          ...state.settings,
          recurring: state.settings.recurring.map((r) =>
            r.id === action.id ? { ...r, enabled: !r.enabled } : r,
          ),
        },
      };
    case 'replace':
      return coerceState(action.state);
    case 'clearEntries':
      return { ...state, entries: {} };
    default:
      return state;
  }
}

export interface StoreValue {
  state: AppState;
  upsert: (entry: DayEntry) => void;
  remove: (date: string) => void;
  patchSettings: (patch: Partial<Settings>) => void;
  addTemplate: (template: ShiftTemplate) => void;
  removeTemplate: (id: string) => void;
  addRecurring: (rule: RecurringRule) => void;
  removeRecurring: (id: string) => void;
  toggleRecurring: (id: string) => void;
  replace: (state: AppState) => void;
  clearEntries: () => void;
  /** 存储写入失败时为 true（隐私模式 / 配额满） */
  storageFailed: boolean;
}

const StoreContext = createContext<StoreValue | null>(null);

/**
 * 落盘合并窗口（ms）。
 * 状态连着变是常态：设置页每敲一个数字、步进器连点都会 dispatch。
 * 每次都同步 JSON.stringify + localStorage.setItem 的话，
 * 数据量一上来（上千条）每个按键都要几十毫秒——手机上就是可感的卡顿。
 * 这里把窗口内的多次变更合并成一次写入：
 * 第一次变更后最多等这么久，期间的变更只更新「待写快照」，
 * 所以数据新鲜度的最坏情况也就是这个窗口（不是「永远不写」）。
 */
const SAVE_COALESCE_MS = 300;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const [storageFailed, setStorageFailed] = useState(false);
  const firstRun = useRef(true);

  /** 还没落盘的最新快照；null 表示没有待写内容 */
  const pendingRef = useRef<AppState | null>(null);
  const timerRef = useRef(0);

  /** 立刻把待写快照落盘（卸载 / 页面隐藏时用，保证不丢数据） */
  const flush = useCallback((reportFailure: boolean) => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = 0;
    }
    const next = pendingRef.current;
    if (!next) return;
    pendingRef.current = null;
    const ok = saveState(next);
    // 值没变就不 setState，省掉一次无意义的整树重渲
    if (reportFailure) setStorageFailed((prev) => (prev === !ok ? prev : !ok));
  }, []);
  const flushRef = useRef(flush);
  flushRef.current = flush;

  // 持久化：合并写入（本地、同步、无网络）
  useEffect(() => {
    if (firstRun.current) {
      // 首次挂载不需要回写，避免把默认值覆盖到已有数据上出问题
      firstRun.current = false;
      return;
    }
    pendingRef.current = state;
    if (timerRef.current) return; // 这一批已经排好了队，只更新快照
    timerRef.current = window.setTimeout(() => {
      timerRef.current = 0;
      flushRef.current(true);
    }, SAVE_COALESCE_MS);
  }, [state]);

  /*
    兜底：下面这些时机必须把还没写的内容落盘，
    否则「改完立刻切后台被回收」就会丢最后一次修改。
    切后台（visibilitychange→hidden）时页面还活着，写入失败照样要提示用户；
    真正卸载时才静默（那时再 setState 也没人看了）。
  */
  useEffect(() => {
    const onPageHide = () => flushRef.current(true);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushRef.current(true);
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      flushRef.current(false); // 卸载（热重载 / 根组件销毁）也要落地
    };
  }, []);

  const upsert = useCallback((entry: DayEntry) => dispatch({ type: 'upsert', entry }), []);
  const remove = useCallback((date: string) => dispatch({ type: 'remove', date }), []);
  const patchSettings = useCallback(
    (patch: Partial<Settings>) => dispatch({ type: 'patchSettings', patch }),
    [],
  );
  const addTemplate = useCallback(
    (template: ShiftTemplate) => dispatch({ type: 'addTemplate', template }),
    [],
  );
  const removeTemplate = useCallback(
    (id: string) => dispatch({ type: 'removeTemplate', id }),
    [],
  );
  const addRecurring = useCallback(
    (rule: RecurringRule) => dispatch({ type: 'addRecurring', rule }),
    [],
  );
  const removeRecurring = useCallback(
    (id: string) => dispatch({ type: 'removeRecurring', id }),
    [],
  );
  const toggleRecurring = useCallback(
    (id: string) => dispatch({ type: 'toggleRecurring', id }),
    [],
  );
  const replace = useCallback((next: AppState) => dispatch({ type: 'replace', state: next }), []);
  const clearEntries = useCallback(() => dispatch({ type: 'clearEntries' }), []);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      upsert,
      remove,
      patchSettings,
      addTemplate,
      removeTemplate,
      addRecurring,
      removeRecurring,
      toggleRecurring,
      replace,
      clearEntries,
      storageFailed,
    }),
    [
      state,
      upsert,
      remove,
      patchSettings,
      addTemplate,
      removeTemplate,
      addRecurring,
      removeRecurring,
      toggleRecurring,
      replace,
      clearEntries,
      storageFailed,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore 必须在 StoreProvider 内使用');
  return ctx;
}

/** 应用主题（跟随系统 / 强制浅色 / 强制深色） */
export function useThemeEffect(theme: AppState['settings']['theme']) {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme;
      const el = document.documentElement;
      el.setAttribute('data-theme', resolved);
      el.style.colorScheme = resolved;

      const color = resolved === 'dark' ? '#101012' : '#f4f4f7';
      // 首帧的兜底背景色写在 html 的行内样式上，
      // 这里必须跟着一起更新，否则用户手动换主题后会残留旧底色。
      el.style.backgroundColor = color;

      // 让状态栏/地址栏颜色也跟着走：
      // index.html 里为了「无 JS 时也能对」，放了带 media 的两条 meta；
      // JS 已经算出最终主题了，就把 media 去掉并统一成该颜色。
      const metas = document.querySelectorAll('meta[name="theme-color"]');
      metas.forEach((m) => {
        m.removeAttribute('media');
        m.setAttribute('content', color);
      });
    };
    apply();
    if (theme !== 'system') return;
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

export { defaultState };
