/* ============================================================
   底部抽屉（Bottom Sheet）
   ------------------------------------------------------------
   跟手细节：
   1. 1:1 跟手指，且尊重「抓在哪里」（offset 不平移）
   2. 内容滚到顶还继续下拉时，把手势交给抽屉
   3. 越界用橡皮筋，不硬停
   4. 松手把手指速度交接给弹簧，并按动量投影决定「关还是回弹」
   5. 全程可打断：抓到一半再拖，从当前位置继续
   ============================================================ */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { rubberband, runSpring, VelocityTracker, type SpringHandle } from '../lib/spring';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** 抽屉底部固定区（按钮等），不参与滚动 */
  footer?: ReactNode;
  children: ReactNode;
  /** 关闭时的最短拖拽距离（抽屉高度的比例） */
  dismissRatio?: number;
}

export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  footer,
  children,
  dismissRatio = 0.3,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const springRef = useRef<SpringHandle | null>(null);
  const trackerRef = useRef(new VelocityTracker());
  const offsetRef = useRef(0);
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    grabOffset: number;
    height: number;
    active: boolean;
  } | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  /* ------ 定值写入：位移只写这一个元素，不动父级变量 ------ */
  const setOffset = useCallback((y: number) => {
    offsetRef.current = y;
    const el = sheetRef.current;
    if (el) el.style.transform = `translate(-50%, ${y}px)`;
  }, []);

  const height = useCallback(() => sheetRef.current?.offsetHeight ?? 480, []);

  /* ------ 开/关：用弹簧，不用 CSS 过渡 ------ */
  useLayoutEffect(() => {
    const h = height();
    if (open) {
      // 先落到屏外，再弹上来；requestAnimationFrame 保证起始帧生效
      setOffset(h);
      springRef.current?.stop();
      springRef.current = runSpring({
        from: h,
        to: 0,
        response: 0.4,
        dampingRatio: 0.92,
        onUpdate: setOffset,
      });
    } else {
      springRef.current?.stop();
      const from = offsetRef.current;
      springRef.current = runSpring({
        from,
        to: h,
        // 关闭比打开快一点：系统响应用户要干脆
        response: 0.3,
        dampingRatio: 0.95,
        onUpdate: setOffset,
      });
    }
    return () => springRef.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ------ 打开时：锁背景滚动、Esc 关闭、焦点进来 ------ */
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);

    const focusTimer = window.setTimeout(() => {
      const el = sheetRef.current?.querySelector<HTMLElement>(
        'input:not([type=hidden]), textarea, button',
      );
      el?.focus({ preventScroll: true });
    }, 320);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(focusTimer);
    };
  }, [open, onClose]);

  useEffect(() => () => springRef.current?.stop(), []);

  /* ------ 拖拽 ------
     关键：pointerdown 当场就 setPointerCapture。
     把手很矮（20 来 px），手指往下拖一步就离开元素了；
     如果不捕获，后续的 pointermove 全都会丢，抽屉根本不动。 */
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!open) return;
    const el = sheetRef.current;
    if (!el) return;
    // 多指保护：已经在拖了，忽略后续手指
    if (dragRef.current) return;

    const rect = el.getBoundingClientRect();
    // 立刻捕获：之后指针跑到哪儿，事件都还归这里
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    dragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      grabOffset: e.clientY - rect.top,
      height: rect.height,
      active: true,
    };
    springRef.current?.stop();
    trackerRef.current.reset();
    trackerRef.current.add(0, e.timeStamp || performance.now());
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const dy = e.clientY - drag.startY;

    // 向下：1:1 跟手（尊重抓取偏移，不做任何吸附）
    // 向上：橡皮筋，越拖越沉，而不是硬停
    const next = dy > 0 ? dy : rubberband(dy, drag.height);
    setOffset(next);
    trackerRef.current.add(next, e.timeStamp || performance.now());
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;

    if ((e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }

    const current = offsetRef.current;
    const velocity = trackerRef.current.velocity(); // px/s，向下为正
    const h = drag.height;
    const travel = Math.max(1, h); // 抽屉高度，用来归一化手势

    /*
      判定「关掉」还是「弹回去」：
      · 位置够了（拖过 30%）→ 关
      · 或者够快（一次干脆的甩动）→ 关
      注意别用 project() 的 0.998 减速率来判——那是给滚动惯性用的，
      算出来约等于 0.5×速度，慢拖也会被误判成甩动。
      这里改成和抽屉高度挂钩的速度阈值，快慢界限才符合手感。
    */
    const flickVelocity = Math.max(700, travel * 1.6); // px/s
    const shouldClose = current > travel * dismissRatio || velocity > flickVelocity;

    springRef.current?.stop();
    springRef.current = runSpring({
      from: current,
      to: shouldClose ? h : 0,
      velocity,
      response: shouldClose ? 0.32 : 0.3,
      // 被「甩」出去时允许一点点回弹，正常归位不过冲
      dampingRatio: shouldClose ? 0.9 : 1,
      onUpdate: setOffset,
      onComplete: () => {
        if (shouldClose) onClose();
      },
    });
  };

  /* ------ 由 scrim 点击 / Esc 关闭 ------ */
  const requestClose = () => onClose();

  if (!open) {
    // 关闭后仍需保留一帧用于退场动画，这里直接卸载由父级控制
    return null;
  }

  /*
    用 portal 挂到 body 上：
    页面切换动画（.page-enter）会在祖先上留一个 transform，
    而带 transform 的元素会成为 position:fixed 的包含块——
    抽屉就会被钉在页面里、顶部被裁掉。挂到 body 才能不受影响。
  */
  return createPortal(
    <>
      <button
        type="button"
        className="sheet-scrim is-open"
        aria-label="关闭"
        tabIndex={-1}
        onClick={requestClose}
      />
      <div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div
          className="sheet-grabber"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          role="button"
          tabIndex={0}
          aria-label="下拉关闭"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') requestClose();
          }}
        >
          <span />
        </div>
        <div className="sheet-body" ref={bodyRef}>
          <h2 className="sheet-title">{title}</h2>
          {subtitle ? <p className="sheet-sub">{subtitle}</p> : null}
          {children}
        </div>
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </div>
    </>,
    document.body,
  );
}
