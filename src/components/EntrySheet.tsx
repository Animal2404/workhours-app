/* ============================================================
   记录抽屉：添加 / 编辑某一天的工时与工资项
   实时算钱：改任何一个数字，下面立刻显示这天能拿多少
   ============================================================ */

import { useEffect, useMemo, useState } from 'react';
import type { AppState, DayEntry } from '../lib/types';
import { computeDayPay, emptyEntry, normalizeEntry } from '../lib/pay';
import { dateLabel, formatHours, formatMoney, relativeLabel } from '../lib/date';
import { BottomSheet } from './BottomSheet';
import { Stepper } from './ui';
import { ClockIcon, CoffeeIcon, Icon, WalletIcon, SparklesIcon } from './Icon';
import { NumberTicker } from './magic';
import { Clock } from 'lucide';

interface EntrySheetProps {
  open: boolean;
  date: string;
  state: AppState;
  onSave: (entry: DayEntry) => void;
  onDelete: (date: string) => void;
  onClose: () => void;
}

const HOUR_CHIPS = [4, 6, 8, 10, 12];
const OT_CHIPS = [0, 1, 2, 3, 4];

export function EntrySheet({
  open,
  date,
  state,
  onSave,
  onDelete,
  onClose,
}: EntrySheetProps) {
  const existing = state.entries[date];
  const { settings } = state;

  const [hours, setHours] = useState(0);
  const [overtimeHours, setOvertimeHours] = useState(0);
  const [rate, setRate] = useState<string>('');
  const [allowance, setAllowance] = useState('0');
  const [deduction, setDeduction] = useState('0');
  const [note, setNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 每次打开时用当天的数据重置表单
  useEffect(() => {
    if (!open) return;
    const base = existing ?? emptyEntry(date);
    setHours(base.hours);
    setOvertimeHours(base.overtimeHours);
    setRate(typeof base.rate === 'number' ? String(base.rate) : '');
    setAllowance(String(base.allowance || 0));
    setDeduction(String(base.deduction || 0));
    setNote(base.note ?? '');
    setConfirmDelete(false);
  }, [open, date, existing]);

  const draft: DayEntry = useMemo(
    () =>
      normalizeEntry({
        date,
        hours,
        overtimeHours,
        rate: rate.trim() === '' ? undefined : Number(rate),
        allowance: Number(allowance) || 0,
        deduction: Number(deduction) || 0,
        note,
      }),
    [date, hours, overtimeHours, rate, allowance, deduction, note],
  );

  const pay = useMemo(() => computeDayPay(draft, settings), [draft, settings]);
  const hasAnything =
    pay.totalHours > 0 || pay.allowance > 0 || pay.deduction > 0 || !!draft.note;

  const activeRate = rate.trim() === '' ? settings.hourlyRate : Number(rate) || 0;
  const mult = settings.overtimeMultiplier;

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  const rel = relativeLabel(date);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={existing ? '编辑这天' : '记一笔工时'}
      subtitle={`${dateLabel(date)}${rel ? ` · ${rel}` : ''}`}
      footer={
        <>
          {existing ? (
            <button
              type="button"
              className={`btn btn-sm ${confirmDelete ? 'btn-danger-soft' : 'btn-ghost'}`}
              style={{ flex: 'none', paddingInline: 18, height: 50 }}
              onClick={() => {
                if (confirmDelete) {
                  onDelete(date);
                  onClose();
                } else {
                  setConfirmDelete(true);
                  window.setTimeout(() => setConfirmDelete(false), 3000);
                }
              }}
            >
              {confirmDelete ? '确认删除' : '删除'}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!hasAnything && !existing}
          >
            {hasAnything ? '保存' : '填点内容再保存'}
          </button>
        </>
      }
    >
      {/* ---------- 班次模板：一点就填好 ---------- */}
      {settings.templates.length > 0 ? (
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
          <span className="hint">按基础时薪算</span>
        </div>
        <Stepper
          value={hours}
          onChange={setHours}
          step={0.5}
          min={0}
          max={24}
          unit="小时"
          ariaLabel="正常工时"
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
            {mult > 1 ? `${mult} 倍时薪` : '倍率可在设置里调'}
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
        {overtimeHours > 0 ? (
          <div className="field-note">
            <span>{formatHours(overtimeHours)} 小时加班 × {formatMoney(activeRate)} × {mult}</span>
          </div>
        ) : null}
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
              aria-label="当天时薪"
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
          <span className="hint">可选</span>
        </div>
        <div className="money-row">
          <label className="money-input">
            <span className="sym">+</span>
            <input
              inputMode="decimal"
              value={allowance}
              onChange={(e) => setAllowance(e.target.value)}
              aria-label="补贴"
            />
            <span className="unit">补贴</span>
          </label>
          <label className="money-input">
            <span className="sym">−</span>
            <input
              inputMode="decimal"
              value={deduction}
              onChange={(e) => setDeduction(e.target.value)}
              aria-label="扣款"
            />
            <span className="unit">扣款</span>
          </label>
        </div>
      </div>

      {/* ---------- 备注 ---------- */}
      <div className="field">
        <div className="field-label">
          <span>今天干了什么</span>
          <span className="hint">可选</span>
        </div>
        <textarea
          className="text-input"
          rows={2}
          maxLength={500}
          placeholder="例如：门店晚班 / 仓库盘点 / 接了 3 单"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="备注"
        />
      </div>

      {/* ---------- 实时算钱 ---------- */}
      <div className="live-preview">
        <div>
          <div className="k">这天能拿</div>
          <div className="k tiny" style={{ marginTop: 2 }}>
            {formatHours(pay.totalHours)} 小时 · 时薪 {formatMoney(pay.rate)}
          </div>
        </div>
        <div className="v">
          <NumberTicker value={pay.net} format={(n) => formatMoney(n)} />
        </div>
      </div>

      {/* 明细：让用户能核对每一分钱是怎么来的 */}
      {pay.totalHours > 0 || pay.allowance > 0 || pay.deduction > 0 ? (
        <div className="breakdown">
          <div className="breakdown-row">
            <span className="k">
              正常 {formatHours(pay.normalHours)}h × {formatMoney(pay.rate)}
            </span>
            <span className="v">{formatMoney(pay.basePay)}</span>
          </div>
          {pay.overtimeHours > 0 ? (
            <div className="breakdown-row">
              <span className="k">
                加班 {formatHours(pay.overtimeHours)}h × {mult}
              </span>
              <span className="v">{formatMoney(pay.overtimePay)}</span>
            </div>
          ) : null}
          {pay.allowance > 0 ? (
            <div className="breakdown-row">
              <span className="k">补贴</span>
              <span className="v">+{formatMoney(pay.allowance)}</span>
            </div>
          ) : null}
          {pay.deduction > 0 ? (
            <div className="breakdown-row">
              <span className="k">扣款</span>
              <span className="v is-minus">−{formatMoney(pay.deduction)}</span>
            </div>
          ) : null}
          <div className="breakdown-row is-total">
            <span className="k">实得</span>
            <span className="v">{formatMoney(pay.net)}</span>
          </div>
        </div>
      ) : (
        <div className="field-note" style={{ marginTop: 16 }}>
          <Icon icon={Clock} size={13} />
          <span>填上工时，这里会立刻算出这天的工资</span>
        </div>
      )}
    </BottomSheet>
  );
}
