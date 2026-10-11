/* ============================================================
   批量记账抽屉
   ------------------------------------------------------------
   用户在日历上多选若干天 → 一次给这些天记同样的班。
   「一次」是真的只有一次：走 store 的 upsertMany，
   只跑一次 reducer、只落盘一次（选 20 天不会卡）。

   预览里的「合计」= 单天实得 × 天数。
   天数是有记录的条目数，不是自然日数。
   ============================================================ */

import { useEffect, useMemo, useState } from 'react';
import type { AppState, DayEntry } from '../lib/types';
import { computeDayPay, normalizeEntry } from '../lib/pay';
import { formatHours, formatMoney, shortDateLabel } from '../lib/date';
import { BottomSheet } from './BottomSheet';
import { Stepper } from './ui';
import { ClockIcon, CoffeeIcon, SparklesIcon, WalletIcon } from './Icon';

interface BatchSheetProps {
  open: boolean;
  /** 用户选中的日期（升序） */
  dates: string[];
  state: AppState;
  onSave: (entries: DayEntry[]) => void;
  onDelete: (dates: string[]) => void;
  onClose: () => void;
}

const HOUR_CHIPS = [4, 6, 8, 10, 12];
const OT_CHIPS = [0, 1, 2, 3, 4];

export function BatchSheet({
  open,
  dates,
  state,
  onSave,
  onDelete,
  onClose,
}: BatchSheetProps) {
  const { settings } = state;

  const [hours, setHours] = useState(8);
  const [overtimeHours, setOvertimeHours] = useState(0);
  const [rate, setRate] = useState<string>('');
  const [allowance, setAllowance] = useState('0');
  const [deduction, setDeduction] = useState('0');
  const [note, setNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 每次打开重置成「正常班」，避免带上上次的残留
  useEffect(() => {
    if (!open) return;
    setHours(8);
    setOvertimeHours(0);
    setRate('');
    setAllowance('0');
    setDeduction('0');
    setNote('');
    setConfirmDelete(false);
  }, [open]);

  /** 单天样板（用第一天做模板，只为算钱；日期本身不参与计算） */
  const sample: DayEntry = useMemo(
    () =>
      normalizeEntry({
        date: dates[0] ?? '2000-01-01',
        hours,
        overtimeHours,
        rate: rate.trim() === '' ? undefined : Number(rate),
        allowance: Number(allowance) || 0,
        deduction: Number(deduction) || 0,
        note,
      }),
    [dates, hours, overtimeHours, rate, allowance, deduction, note],
  );

  const perDay = useMemo(() => computeDayPay(sample, settings), [sample, settings]);
  const totalNet = useMemo(() => {
    // 逐天四舍五入再累加，和月度合计口径保持一致
    const one = perDay.net;
    return Math.round(one * dates.length * 100) / 100;
  }, [perDay.net, dates.length]);

  const existingCount = useMemo(
    () => dates.filter((d) => !!state.entries[d]).length,
    [dates, state.entries],
  );

  const activeRate = rate.trim() === '' ? settings.hourlyRate : Number(rate) || 0;
  const canSave = dates.length > 0 && (perDay.totalHours > 0 || perDay.allowance > 0 || perDay.deduction > 0);

  const handleSave = () => {
    const now = Date.now();
    onSave(
      dates.map((d) =>
        normalizeEntry(
          {
            date: d,
            hours,
            overtimeHours,
            rate: rate.trim() === '' ? undefined : Number(rate),
            allowance: Number(allowance) || 0,
            deduction: Number(deduction) || 0,
            note,
          },
          now,
        ),
      ),
    );
    onClose();
  };

  const preview =
    dates.length <= 3
      ? dates.map(shortDateLabel).join('、')
      : `${shortDateLabel(dates[0])} 等 ${dates.length} 天`;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={`批量记 ${dates.length} 天`}
      subtitle={preview}
      footer={
        <>
          {existingCount > 0 ? (
            <button
              type="button"
              className={`btn btn-sm ${confirmDelete ? 'btn-danger-soft' : 'btn-ghost'}`}
              style={{ flex: 'none', paddingInline: 16, height: 50 }}
              onClick={() => {
                if (confirmDelete) {
                  onDelete(dates);
                  onClose();
                } else {
                  setConfirmDelete(true);
                  window.setTimeout(() => setConfirmDelete(false), 3000);
                }
              }}
            >
              {confirmDelete ? '确认清空' : '清空'}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canSave}
            onClick={handleSave}
          >
            记这 {dates.length} 天
          </button>
        </>
      }
    >
      {/* 已有记录提醒：批量是「覆盖」，得先说清楚 */}
      {existingCount > 0 ? (
        <div className="field-note is-warn" style={{ marginBottom: 14 }}>
          <span>
            其中 {existingCount} 天已有记录，保存后会<strong>覆盖</strong>成现在填的值。
          </span>
        </div>
      ) : null}

      {/* ---------- 常用班次 ---------- */}
      {settings.templates.length ? (
        <div className="field">
          <div className="field-label">
            <span>
              <SparklesIcon size={14} style={{ display: 'inline', verticalAlign: -2 }} /> 常用班次
            </span>
            <span className="hint">一点就填好</span>
          </div>
          <div className="chips">
            {settings.templates.map((t) => {
              const on = hours === t.hours && overtimeHours === t.overtimeHours;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`chip ${on ? 'is-on' : ''}`}
                  onClick={() => {
                    setHours(t.hours);
                    setOvertimeHours(t.overtimeHours);
                  }}
                >
                  {t.name}
                  <span className="muted" style={{ fontWeight: 500 }}>
                    {formatHours(t.hours + t.overtimeHours)}h
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ---------- 正常工时 ---------- */}
      <div className="field">
        <div className="field-label">
          <span>
            <ClockIcon size={14} style={{ display: 'inline', verticalAlign: -2 }} /> 正常工时
          </span>
          <span className="hint">这 {dates.length} 天都一样</span>
        </div>
        <Stepper
          value={hours}
          onChange={setHours}
          step={0.5}
          min={0}
          max={24}
          unit="小时"
          ariaLabel="批量正常工时"
        />
        <div className="chips" style={{ marginTop: 12 }}>
          {HOUR_CHIPS.map((h) => (
            <button
              key={h}
              type="button"
              className={`chip ${hours === h ? 'is-on' : ''}`}
              onClick={() => setHours(h)}
            >
              {h}小时
            </button>
          ))}
        </div>
      </div>

      {/* ---------- 加班 ---------- */}
      <div className="field">
        <div className="field-label">
          <span>加班工时</span>
          <span className="hint">
            {settings.overtimeMultiplier > 1
              ? `${settings.overtimeMultiplier} 倍时薪`
              : '倍率可在设置里调'}
          </span>
        </div>
        <div className="chips">
          {OT_CHIPS.map((h) => (
            <button
              key={h}
              type="button"
              className={`chip is-warn ${overtimeHours === h ? 'is-on' : ''}`}
              onClick={() => setOvertimeHours(h)}
            >
              {h === 0 ? '无加班' : `+${h}h`}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- 当天时薪 ---------- */}
      <div className="field">
        <div className="field-label">
          <span>
            <WalletIcon size={14} style={{ display: 'inline', verticalAlign: -2 }} /> 当天时薪
          </span>
          <span className="hint">不填就用默认 {formatMoney(settings.hourlyRate)} 元/小时</span>
        </div>
        <div className="money-row">
          <label className="money-input">
            <span className="sym">{settings.currency}</span>
            <input
              inputMode="decimal"
              placeholder={String(settings.hourlyRate)}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              aria-label="批量当天时薪"
            />
            <span className="unit">元/小时</span>
          </label>
        </div>
      </div>

      {/* ---------- 补贴 / 扣款 ---------- */}
      <div className="field">
        <div className="field-label">
          <span>
            <CoffeeIcon size={14} style={{ display: 'inline', verticalAlign: -2 }} /> 补贴与扣款
          </span>
          <span className="hint">可选 · 按天算</span>
        </div>
        <div className="money-row">
          <label className="money-input">
            <span className="sym">+</span>
            <input
              inputMode="decimal"
              value={allowance}
              onChange={(e) => setAllowance(e.target.value)}
              aria-label="批量补贴"
            />
            <span className="unit">补贴</span>
          </label>
          <label className="money-input">
            <span className="sym">−</span>
            <input
              inputMode="decimal"
              value={deduction}
              onChange={(e) => setDeduction(e.target.value)}
              aria-label="批量扣款"
            />
            <span className="unit">扣款</span>
          </label>
        </div>
      </div>

      {/* ---------- 备注 ---------- */}
      <div className="field">
        <div className="field-label">
          <span>干了什么活</span>
          <span className="hint">可选 · 这 {dates.length} 天写同一句</span>
        </div>
        <textarea
          className="text-input"
          rows={2}
          maxLength={500}
          placeholder="例如：仓库理货 / 前台收银"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="批量备注"
        />
      </div>

      {/* ---------- 预览 ---------- */}
      <div className="breakdown" style={{ marginTop: 18 }}>
        <div className="breakdown-row">
          <span className="k">
            单天 · {formatHours(perDay.totalHours)}h × {formatMoney(activeRate)}
            {settings.overtimeMultiplier > 1 && perDay.overtimeHours > 0
              ? `（含 ${formatHours(perDay.overtimeHours)}h 加班）`
              : ''}
          </span>
          <span className="v">{formatMoney(perDay.net)}</span>
        </div>
        <div className="breakdown-row is-total">
          <span className="k">合计 {dates.length} 天</span>
          <span className="v is-money">{formatMoney(totalNet)}</span>
        </div>
      </div>
    </BottomSheet>
  );
}
