/* ============================================================
   弹簧动画引擎
   ------------------------------------------------------------
   为什么不用 CSS transition：抽屉要能「半路被抓住再反向」，
   CSS 过渡做不到；弹簧天然可打断，并且能继承手指的速度。

   参数用 Apple 的两个友好维度：
     response        —— 到达目标大约需要多久（秒），越小越干脆
     dampingRatio    —— 1 = 不过冲（临界阻尼），< 1 = 有回弹
   ============================================================ */

export interface SpringOptions {
  from: number;
  to: number;
  /** 初始速度，单位/秒（交接手指速度） */
  velocity?: number;
  /** 秒 */
  response?: number;
  /** 阻尼比 */
  dampingRatio?: number;
  onUpdate: (value: number) => void;
  onComplete?: () => void;
  /** 静止阈值 */
  restDistance?: number;
  restVelocity?: number;
}

export interface SpringHandle {
  /** 改目标（可打断：从当前位置与当前速度继续） */
  retarget: (to: number, velocity?: number) => void;
  /** 立即停在当前值 */
  stop: () => void;
  /** 当前值 */
  value: () => number;
}

export function runSpring(opts: SpringOptions): SpringHandle {
  const {
    onUpdate,
    onComplete,
    restDistance = 0.5,
    restVelocity = 0.5,
    response = 0.36,
    dampingRatio = 0.9,
  } = opts;

  let value = opts.from;
  let target = opts.to;
  let velocity = opts.velocity ?? 0;

  let raf = 0;
  let last = 0;
  let stopped = false;

  // 由 response / dampingRatio 推出物理参数（质量固定为 1）
  const omega0 = (2 * Math.PI) / Math.max(0.05, response);
  const stiffness = omega0 * omega0;
  const damping = 2 * dampingRatio * omega0;

  const step = (now: number) => {
    if (stopped) return;
    if (!last) last = now;
    // 单帧最长按 1/30 秒积分，切后台回来不会「瞬移」
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;

    // 半隐式欧拉：先算加速度，再更新速度、位置
    const accel = -stiffness * (value - target) - damping * velocity;
    velocity += accel * dt;
    value += velocity * dt;

    if (
      Math.abs(value - target) < restDistance &&
      Math.abs(velocity) < restVelocity
    ) {
      value = target;
      velocity = 0;
      onUpdate(value);
      stopped = true;
      onComplete?.();
      return;
    }

    onUpdate(value);
    raf = requestAnimationFrame(step);
  };

  raf = requestAnimationFrame(step);

  return {
    retarget(next: number, v?: number) {
      target = next;
      if (typeof v === 'number') velocity = v;
      if (stopped) {
        stopped = false;
        last = 0;
        raf = requestAnimationFrame(step);
      }
    },
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
    },
    value: () => value,
  };
}

/* ------------------------------------------------------------
   苹果的动量投影：松手后会「滑」到哪里
   project(v) = v/1000 * d / (1 - d)
   ------------------------------------------------------------ */
export function project(initialVelocity: number, decelerationRate = 0.998): number {
  return ((initialVelocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/* ------------------------------------------------------------
   橡皮筋：越界后越拖越沉，而不是硬停
   ------------------------------------------------------------ */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  if (dimension <= 0) return 0;
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/* ------------------------------------------------------------
   指针速度历史：松手时算真实速度（px/s）
   ------------------------------------------------------------ */
export class VelocityTracker {
  private samples: { t: number; v: number }[] = [];

  reset(): void {
    this.samples = [];
  }

  add(value: number, time = performance.now()): void {
    this.samples.push({ t: time, v: value });
    // 只保留最近 100ms，太久远的样本会拖慢速度响应
    const cutoff = time - 100;
    while (this.samples.length > 2 && this.samples[0].t < cutoff) this.samples.shift();
  }

  /** px/s（正数表示朝正方向移动） */
  velocity(): number {
    const n = this.samples.length;
    if (n < 2) return 0;
    const last = this.samples[n - 1];

    // 从后往前找第一个时间差够大的样本。
    // 浏览器的 pointermove 有时会在 1ms 内连发好几个，
    // 用这么小的 dt 去除会算出天文数字的速度，必须给个下限。
    let first = this.samples[0];
    for (let i = n - 1; i >= 0; i--) {
      const dt = (last.t - this.samples[i].t) / 1000;
      if (dt >= MIN_DT) {
        first = this.samples[i];
        break;
      }
    }

    const dt = (last.t - first.t) / 1000;
    if (dt < MIN_DT) return 0; // 采样窗口太短，宁可不判定，也不要瞎猜
    const raw = (last.v - first.v) / dt;
    // 再加一道上限，防止极端抖动
    return Math.max(-MAX_V, Math.min(MAX_V, raw));
  }
}

/** 计算速度所需的最短时间窗口（秒） */
const MIN_DT = 0.02;
/** 速度上限（px/s），超过就认为是采样噪声 */
const MAX_V = 6000;
