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

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const [storageFailed, setStorageFailed] = useState(false);
  const firstRun = useRef(true);

  // 持久化：状态一变就存（本地、同步、无网络）
  useEffect(() => {
    if (firstRun.current) {
      // 首次挂载不需要回写，避免把默认值覆盖到已有数据上出问题
      firstRun.current = false;
      return;
    }
    const ok = saveState(state);
    setStorageFailed(!ok);
  }, [state]);

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
