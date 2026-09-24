/* ============================================================
   设置页（我的）
   ------------------------------------------------------------
   算钱规则全在这里：时薪、加班倍率、目标、班次模板、
   外观、提醒、备份导出与导入。
   ============================================================ */

import { useRef, useState } from 'react';
import type { ShiftTemplate, ThemeMode } from '../lib/types';
import type { StoreValue } from '../lib/store';
import { formatMoney } from '../lib/date';
import { exportCSV, exportJSON, download, importJSON } from '../lib/storage';
import {
  BellIcon,
  DownloadIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  TrashIcon,
  UploadIcon,
  WalletIcon,
  ClockIcon,
  TargetIcon,
  Plus,
  X,
  MorphingIcon,
  Icon,
} from '../components/Icon';
import { ShineBorder } from '../components/magic';
import { Segmented, Switch, Empty } from '../components/ui';
import { Clock } from 'lucide';

export function SettingsPage({ store }: { store: StoreValue }) {
  const { state, patchSettings, addTemplate, removeTemplate, replace, clearEntries } = store;
  const { settings } = state;

  const [newTplName, setNewTplName] = useState('');
  const [newTplHours, setNewTplHours] = useState('8');
  const [showTplForm, setShowTplForm] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const entryCount = Object.keys(state.entries).length;

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const { state: next, error } = importJSON(text);
      if (!next) {
        setImportMsg({ ok: false, text: error ?? '导入失败' });
        return;
      }
      replace(next);
      setImportMsg({ ok: true, text: `导入成功，共 ${Object.keys(next.entries).length} 天记录` });
      window.setTimeout(() => setImportMsg(null), 3500);
    } catch {
      setImportMsg({ ok: false, text: '读取文件失败' });
    }
  };

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: '跟随系统' },
    { value: 'light', label: '浅色' },
    { value: 'dark', label: '深色' },
  ];

  return (
    <div className="page page-enter">
      <header className="topbar">
        <div>
          <h1 className="topbar-title">我的</h1>
          <p className="topbar-sub">已记录 {entryCount} 天</p>
        </div>
      </header>

      {/* ---------------- 算钱规则 ---------------- */}
      <section className="card">
        <div className="card-title">
          <span>算钱规则</span>
        </div>

        <div className="set-row">
          <div className="set-row-main">
            <span className="set-icon">
              <WalletIcon size={18} />
            </span>
            <div>
              <div className="set-label">基础时薪</div>
              <div className="set-desc">默认按这个单价算，单天可以单独改</div>
            </div>
          </div>
          <input
            className="set-input is-wide"
            inputMode="decimal"
            value={settings.hourlyRate}
            onChange={(e) => {
              const n = Number(e.target.value);
              patchSettings({ hourlyRate: Number.isFinite(n) && n >= 0 ? n : 0 });
            }}
            aria-label="基础时薪"
          />
        </div>

        <div className="set-row">
          <div className="set-row-main">
            <span className="set-icon" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
              <ClockIcon size={18} />
            </span>
            <div>
              <div className="set-label">加班倍率</div>
              <div className="set-desc">
                1 = 跟平时一个价；1.5 = 加班一小时算 1.5 小时的钱
              </div>
            </div>
          </div>
          <input
            className="set-input"
            inputMode="decimal"
            value={settings.overtimeMultiplier}
            onChange={(e) => {
              const n = Number(e.target.value);
              patchSettings({ overtimeMultiplier: Number.isFinite(n) && n >= 0 ? n : 1 });
            }}
            aria-label="加班倍率"
          />
        </div>

        <div className="set-row">
          <div className="set-row-main">
            <span className="set-icon">
              <TargetIcon size={18} />
            </span>
            <div>
              <div className="set-label">月度工资目标</div>
              <div className="set-desc">填 0 表示不设目标</div>
            </div>
          </div>
          <input
            className="set-input"
            inputMode="decimal"
            value={settings.monthlyGoalIncome}
            onChange={(e) => {
              const n = Number(e.target.value);
              patchSettings({ monthlyGoalIncome: Number.isFinite(n) && n >= 0 ? n : 0 });
            }}
            aria-label="月度工资目标"
          />
        </div>

        <div className="set-row">
          <div className="set-row-main">
            <span className="set-icon">
              <ClockIcon size={18} />
            </span>
            <div>
              <div className="set-label">每日工时目标</div>
              <div className="set-desc">日历上用颜色标记达标的日子</div>
            </div>
          </div>
          <input
            className="set-input"
            inputMode="decimal"
            value={settings.dailyGoalHours}
            onChange={(e) => {
              const n = Number(e.target.value);
              patchSettings({ dailyGoalHours: Number.isFinite(n) && n >= 0 ? n : 0 });
            }}
            aria-label="每日工时目标"
          />
        </div>
      </section>

      {/* ---------------- 算一笔试试 ---------------- */}
      <ShineBorder>
        <div style={{ padding: 20 }}>
          <p className="tiny muted" style={{ fontWeight: 600 }}>
            算法示例
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.7, marginTop: 8 }}>
            上 <b>10</b> 小时，时薪 <b>{formatMoney(settings.hourlyRate)}</b> 元，
            <br />
            这天就是{' '}
            <b style={{ color: 'var(--money)', fontSize: 17 }}>
              {settings.currency}
              {formatMoney(10 * settings.hourlyRate)}
            </b>
            。
            {settings.overtimeMultiplier !== 1 ? (
              <>
                <br />
                <span className="muted tiny">
                  其中加班部分按 {settings.overtimeMultiplier} 倍计算。
                </span>
              </>
            ) : null}
          </p>
        </div>
      </ShineBorder>

      {/* ---------------- 班次模板 ---------------- */}
      <section className="card">
        <div className="card-title">
          <span>常用班次</span>
          <button
            type="button"
            className="btn btn-soft btn-sm"
            onClick={() => setShowTplForm((v) => !v)}
          >
            <MorphingIcon icon={showTplForm ? X : Plus} size={15} strokeWidth={2.4} />
            {showTplForm ? '收起' : '新增'}
          </button>
        </div>

        {settings.templates.length === 0 && !showTplForm ? (
          <Empty
            icon={Clock}
            title="还没有班次"
            text="把常上的班存成模板，记录时一点就填好。"
          />
        ) : (
          <div className="chips">
            {settings.templates.map((t) => (
              <span
                key={t.id}
                className="chip is-on"
                style={{ paddingRight: 6, gap: 8 }}
              >
                {t.name}
                <span className="num" style={{ fontWeight: 600 }}>
                  {t.hours + t.overtimeHours}h
                </span>
                <button
                  type="button"
                  aria-label={`删除班次 ${t.name}`}
                  onClick={() => removeTemplate(t.id)}
                  style={{ display: 'grid', placeItems: 'center', opacity: 0.65 }}
                >
                  <Icon icon={X} size={13} strokeWidth={2.6} />
                </button>
              </span>
            ))}
          </div>
        )}

        {showTplForm ? (
          <div style={{ marginTop: 16 }}>
            <div className="money-row">
              <label className="money-input">
                <input
                  placeholder="班次名，如「晚班」"
                  value={newTplName}
                  onChange={(e) => setNewTplName(e.target.value)}
                  aria-label="班次名称"
                />
              </label>
              <label className="money-input" style={{ maxWidth: 116 }}>
                <input
                  placeholder="8"
                  inputMode="decimal"
                  value={newTplHours}
                  onChange={(e) => setNewTplHours(e.target.value)}
                  aria-label="班次工时"
                />
                <span className="unit">小时</span>
              </label>
            </div>
            <button
              type="button"
              className="btn btn-soft btn-block btn-sm"
              style={{ marginTop: 10 }}
              onClick={() => {
                const hours = Number(newTplHours);
                if (!newTplName.trim() || !Number.isFinite(hours) || hours <= 0) return;
                const tpl: ShiftTemplate = {
                  id: `t-${Date.now()}`,
                  name: newTplName.trim().slice(0, 12),
                  hours,
                  overtimeHours: 0,
                };
                addTemplate(tpl);
                setNewTplName('');
                setNewTplHours('8');
                setShowTplForm(false);
              }}
            >
              添加班次
            </button>
          </div>
        ) : null}
      </section>

      {/* ---------------- 外观 ---------------- */}
      <section className="card">
        <div className="card-title">
          <span>外观</span>
        </div>
        <Segmented
          options={themeOptions}
          value={settings.theme}
          onChange={(v) => patchSettings({ theme: v })}
          label="主题"
        />
        <div className="set-row" style={{ marginTop: 8 }}>
          <div className="set-row-main">
            <span className="set-icon">
              {settings.theme === 'dark' ? <MoonIcon size={18} /> : <SunIcon size={18} />}
            </span>
            <div>
              <div className="set-label">一周从周一开始</div>
              <div className="set-desc">国内习惯；关掉则从周日开始</div>
            </div>
          </div>
          <Switch
            checked={settings.weekStartsMonday}
            onChange={(v) => patchSettings({ weekStartsMonday: v })}
            label="一周从周一开始"
          />
        </div>
        <div className="set-row">
          <div className="set-row-main">
            <span className="set-icon" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
              <BellIcon size={18} />
            </span>
            <div>
              <div className="set-label">记账提醒</div>
              <div className="set-desc">到点提醒你补今天的工时</div>
            </div>
          </div>
          <Switch
            checked={settings.reminderEnabled}
            onChange={(v) => patchSettings({ reminderEnabled: v })}
            label="记账提醒"
          />
        </div>
        {settings.reminderEnabled ? (
          <div className="set-row">
            <div className="set-row-main">
              <span className="set-icon" style={{ background: 'transparent' }} />
              <div className="set-label">提醒时间</div>
            </div>
            <input
              className="set-input"
              type="time"
              value={settings.reminderTime}
              onChange={(e) => patchSettings({ reminderTime: e.target.value })}
              aria-label="提醒时间"
            />
          </div>
        ) : null}
      </section>

      {/* ---------------- 数据 ---------------- */}
      <section className="card">
        <div className="card-title">
          <span>数据</span>
          <span className="muted">只存在这台设备上</span>
        </div>
        <div className="set-row">
          <div className="set-row-main">
            <span className="set-icon" style={{ background: 'var(--money-soft)', color: 'var(--money)' }}>
              <DownloadIcon size={18} />
            </span>
            <div>
              <div className="set-label">导出备份</div>
              <div className="set-desc">JSON 可再导入回来；CSV 用 Excel 打开</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => download('工时记-备份.json', exportJSON(state))}
            >
              JSON
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => download('工时记-明细.csv', exportCSV(state), 'text/csv')}
            >
              CSV
            </button>
          </div>
        </div>

        <div className="set-row">
          <div className="set-row-main">
            <span className="set-icon">
              <UploadIcon size={18} />
            </span>
            <div>
              <div className="set-label">导入备份</div>
              <div className="set-desc">会覆盖当前所有数据</div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => fileRef.current?.click()}
          >
            选择文件
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              void onPickFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

        {importMsg ? (
          <p
            className="tiny"
            style={{
              marginTop: 10,
              color: importMsg.ok ? 'var(--money)' : 'var(--danger)',
              fontWeight: 600,
            }}
          >
            {importMsg.text}
          </p>
        ) : null}

        <div className="set-row">
          <div className="set-row-main">
            <span className="set-icon" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
              <TrashIcon size={18} />
            </span>
            <div>
              <div className="set-label">清空所有记录</div>
              <div className="set-desc">不可恢复，建议先导出备份</div>
            </div>
          </div>
          <button
            type="button"
            className={`btn btn-sm ${confirmClear ? 'btn-danger-soft' : 'btn-ghost'}`}
            onClick={() => {
              if (confirmClear) {
                clearEntries();
                setConfirmClear(false);
              } else {
                setConfirmClear(true);
                window.setTimeout(() => setConfirmClear(false), 3500);
              }
            }}
          >
            {confirmClear ? '确认清空' : '清空'}
          </button>
        </div>
      </section>

      {/* ---------------- 关于 ---------------- */}
      <section className="card">
        <div className="set-row">
          <div className="set-row-main">
            <span className="set-icon">
              <SettingsIcon size={18} />
            </span>
            <div>
              <div className="set-label">工时记 v1.0.0</div>
              <div className="set-desc">
                圆角设计 · 离线可用 · 数据不上传
              </div>
            </div>
          </div>
        </div>
        <div className="set-row">
          <div className="set-row-main">
            <div className="set-desc" style={{ lineHeight: 1.7 }}>
              一周从{settings.weekStartsMonday ? '周一' : '周日'}开始 · 货币{' '}
              {settings.currency} · 加班 {settings.overtimeMultiplier} 倍
              <br />
              常用班次 {settings.templates.length} 个 · 已记录 {entryCount} 天
            </div>
          </div>
        </div>
      </section>

      <p className="tiny muted" style={{ textAlign: 'center', paddingBottom: 8 }}>
        数字都对过了：明细按天四舍五入，加起来正好等于合计。
      </p>
    </div>
  );
}
