/* ============================================================
   图标
   ------------------------------------------------------------
   两套「同名的 IconNode」结构不同，这里统一掉：

   · lucide 导出的是   [tag, attrs, children[]]  ← 一个元组
   · morphicons 要的是 [ [tag, attrs], ... ]     ← children 列表

   所以喂给 morphicons 时取 icon[2]（children），
   自己渲染时也用同一份 children，两边画的几何完全一致。
   ============================================================ */

import { createElement, type ComponentProps, type SVGProps } from 'react';
import { MorphIcon } from 'morphicons/react';
import type { IconNode as MorphIconNode } from 'morphicons/react';
import {
  Bell,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  ChartColumn,
  Clock,
  Coffee,
  Download,
  Flame,
  Moon,
  Pencil,
  Plus,
  Settings,
  Sparkles,
  Sun,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  Wallet,
  X,
  type IconNode,
} from 'lucide';

export type { IconNode };
export type MorphNodes = MorphIconNode;

/** lucide 图标 → morphicons 能吃的 [tag, attrs] 列表 */
export function toMorphNodes(icon: IconNode): MorphIconNode {
  return (icon[2] ?? []) as MorphIconNode;
}

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  icon: IconNode;
  size?: number;
  strokeWidth?: number;
  /** 传了就对读屏可见（role=img + title），不传则隐藏 */
  label?: string;
}

export function Icon({
  icon,
  size = 22,
  strokeWidth = 1.9,
  label,
  ...rest
}: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-hidden={label ? undefined : true}
      focusable="false"
      {...rest}
    >
      {label ? <title>{label}</title> : null}
      {(icon[2] ?? []).map(([tag, attrs], i) =>
        createElement(tag, { key: i, ...attrs }),
      )}
    </svg>
  );
}

/* ------------------------------------------------------------
   会变形的图标（morphicons）
   状态在外面：icon 一变就自动弹簧变形，组件只管画。
   ------------------------------------------------------------ */

export interface MorphingIconProps {
  icon: IconNode;
  size?: number;
  strokeWidth?: number;
  className?: string;
  label?: string;
  /** 弹簧预设名，或 { stiffness, damping } */
  spring?: ComponentProps<typeof MorphIcon>['spring'];
  /** 图标是短促微交互，默认永远动画；要跟随系统就传 "user" */
  reducedMotion?: 'never' | 'user' | 'always';
}

export function MorphingIcon({
  icon,
  size = 22,
  strokeWidth = 1.9,
  className,
  label,
  spring = 'snappy',
  reducedMotion = 'never',
}: MorphingIconProps) {
  return (
    <MorphIcon
      icon={toMorphNodes(icon)}
      size={size}
      strokeWidth={strokeWidth}
      absoluteStrokeWidth
      className={className}
      label={label}
      spring={spring}
      reducedMotion={reducedMotion}
    />
  );
}

/* ------------------------------------------------------------
   常用图标的语义化包装（统一尺寸与线宽）
   ------------------------------------------------------------ */
const wrap =
  (node: IconNode) =>
  (props: Omit<IconProps, 'icon'>) => <Icon icon={node} {...props} />;

export const CalendarIcon = wrap(Calendar);
export const ClockIcon = wrap(Clock);
export const WalletIcon = wrap(Wallet);
export const TargetIcon = wrap(Target);
export const SettingsIcon = wrap(Settings);
export const TrendIcon = wrap(TrendingUp);
export const ChartIcon = wrap(ChartColumn);
export const ChevronLeftIcon = wrap(ChevronLeft);
export const ChevronRightIcon = wrap(ChevronRight);
export const TrashIcon = wrap(Trash2);
export const DownloadIcon = wrap(Download);
export const UploadIcon = wrap(Upload);
export const BellIcon = wrap(Bell);
export const FlameIcon = wrap(Flame);
export const CoffeeIcon = wrap(Coffee);
export const PencilIcon = wrap(Pencil);
export const CheckIcon = wrap(Check);
export const SparklesIcon = wrap(Sparkles);
export const SunIcon = wrap(Sun);
export const MoonIcon = wrap(Moon);

/** 变形端点：加号 ↔ 叉、太阳 ↔ 月亮 */
export { Plus, X, Sun, Moon, Check, Calendar, Clock, ChartColumn, Target, Settings };

/** 原始图标数据：需要直接当 icon={} 用时取这里 */
export const Icons = { Plus, X, Sun, Moon, Check, Calendar, Clock, ChartColumn, Target, Settings } as const;
