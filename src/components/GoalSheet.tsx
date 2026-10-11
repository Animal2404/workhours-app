/* ============================================================
   存款目标：新建 / 编辑
   ------------------------------------------------------------
   关键设计点是「起算日」——它决定哪些收入算进这个目标。
   默认今天：设目标那天开始攒，符合直觉（「从今天起我要攒钱买 X」）。
   也提供「今年开始 / 第一次记账那天」，方便把已经攒的钱一并算进来。
   ============================================================ */

import { useEffect, useMemo, useState } from 'react';
import type { AppState, SavingsGoal } from '../lib/types';
import { allEntryKeys } from '../lib/pay';
import { formatMoney, monthStartKey, todayKey } from '../lib/date';
import { BottomSheet } from './BottomSheet';

interface GoalSheetProps {
  open: boolean;
  /** 传 null = 新建 */
  goal: SavingsGoal | null;
  state: AppState;
  onSave: (goal: SavingsGoal) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const NAME_PICKS = ['换手机', '买电脑', '去旅游', '存一笔', '买相机', '交学费'];

export function GoalSheet({
  open,
  goal,
  state,
  onSave,
  onDelete,
  onClose,
}: GoalSheetProps) {
  const { settings } = state;
  const today = todayKey();

  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [initial, setInitial] = useState('0');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 第一次记账那天（用来「把已经攒的也算进来」）
  const firstEntry = useMemo(() => allEntryKeys(state)[0] ?? today, [state, today]);

  useEffect(() => {
    if (!open) return;
    if (goal) {
      setName(goal.name);
      setTarget(String(goal.target));
      setStartDate(goal.startDate);
      setInitial(String(goal.initial || 0));
    } else {
      setName('');
      setTarget('');
      setStartDate(today);
      setInitial('0');
    }
    setConfirmDelete(false);
  }, [open, goal, today]);

  const targetNum = Number(target) || 0;
  const initialNum = Number(initial) || 0;
  const canSave = name.trim().length > 0 && targetNum > 0;

  const handleSave = () => {
    if (!canSave) return;
    const next: SavingsGoal = {
      id: goal?.id ?? `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim().slice(0, 20),
      target: Math.round(targetNum * 100) / 100,
      startDate,
      initial: Math.round(Math.max(0, initialNum) * 100) / 100,
      createdAt: goal?.createdAt ?? Date.now(),
      ...(goal?.achievedAt ? { achievedAt: goal.achievedAt } : {}),
    };
    onSave(next);
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={goal ? '编辑目标' : '添加存款目标'}
      subtitle="设定金额，看还要多久能攒够"
      footer={
        <>
          {goal ? (
            <button
              type="button"
              className={`btn btn-sm ${confirmDelete ? 'btn-danger-soft' : 'btn-ghost'}`}
              style={{ flex: 'none', paddingInline: 16, height: 50 }}
              onClick={() => {
                if (confirmDelete) {
                  onDelete(goal.id);
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
          <button type="button" className="btn btn-primary" disabled={!canSave} onClick={handleSave}>
            {goal ? '保存' : '添加'}
          </button>
        </>
      }
    >
      {/* ---------- 目标名 ---------- */}
      <div className="field">
        <div className="field-label">
          <span>想买什么</span>
          <span className="hint">起个名，比如「买 iPhone 18」</span>
        </div>
        <input
          className="text-input"
          type="text"
          maxLength={20}
          placeholder="买 iPhone 18"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="目标名称"
        />
        <div className="chips" style={{ marginTop: 10 }}>
          {NAME_PICKS.map((p) => (
            <button
              key={p}
              type="button"
              className={`chip ${name === p ? 'is-on' : ''}`}
              onClick={() => setName(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- 目标金额 ---------- */}
      <div className="field">
        <div className="field-label">
          <span>目标金额</span>
          <span className="hint">攒够这么多就算达成</span>
        </div>
        <div className="money-row">
          <label className="money-input">
            <span className="sym">{settings.currency}</span>
            <input
              inputMode="decimal"
              placeholder="7999"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              aria-label="目标金额"
            />
            <span className="unit">元</span>
          </label>
        </div>
        {targetNum > 0 ? (
          <div className="field-note" style={{ marginTop: 10 }}>
            <span>目标 {formatMoney(targetNum, 0)} 元</span>
          </div>
        ) : null}
      </div>

      {/* ---------- 起算日 ---------- */}
      <div className="field">
        <div className="field-label">
          <span>从哪天开始算</span>
          <span className="hint">这天的收入开始计入</span>
        </div>
        <input
          className="text-input"
          type="date"
          value={startDate}
          max={today}
          onChange={(e) => setStartDate(e.target.value || today)}
          aria-label="起算日"
        />
        <div className="seg-row" style={{ marginTop: 10 }}>
          <button
            type="button"
            className={`chip ${startDate === today ? 'is-on' : ''}`}
            onClick={() => setStartDate(today)}
          >
            今天起
          </button>
          <button
            type="button"
            className={`chip ${startDate === monthStartKey(new Date().getFullYear(), new Date().getMonth()) ? 'is-on' : ''}`}
            onClick={() => setStartDate(monthStartKey(new Date().getFullYear(), new Date().getMonth()))}
          >
            本月 1 号
          </button>
          <button
            type="button"
            className={`chip ${startDate === `${new Date().getFullYear()}-01-01` ? 'is-on' : ''}`}
            onClick={() => setStartDate(`${new Date().getFullYear()}-01-01`)}
          >
            今年开始
          </button>
          {firstEntry !== today ? (
            <button
              type="button"
              className={`chip ${startDate === firstEntry ? 'is-on' : ''}`}
              onClick={() => setStartDate(firstEntry)}
            >
              全部记录
            </button>
          ) : null}
        </div>
      </div>

      {/* ---------- 已存 ---------- */}
      <div className="field">
        <div className="field-label">
          <span>已经攒了多少</span>
          <span className="hint">可选 · 之前攒的也可以算进来</span>
        </div>
        <div className="money-row">
          <label className="money-input">
            <span className="sym">{settings.currency}</span>
            <input
              inputMode="decimal"
              placeholder="0"
              value={initial}
              onChange={(e) => setInitial(e.target.value)}
              aria-label="已有存款"
            />
            <span className="unit">元</span>
          </label>
        </div>
      </div>

      <div className="field-note" style={{ marginTop: 4 }}>
        <span>
          进度 = 已攒 + 起算日之后的收入。所以想连老账一起算，把起算日往前调即可。
        </span>
      </div>
    </BottomSheet>
  );
}
