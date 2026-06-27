import { IconCheck } from '@tabler/icons-react';
import { toast } from 'sonner';

/** 模型切换提示统一在屏幕中部，避免手机端挡住底部输入框。 */
export const MODEL_SWITCH_TOAST_POSITION = 'top-center' as const;

export const MODEL_SWITCH_TOAST_STYLE = {
  top: '38%',
} as const;

/** 成功/失败提示自动消失时长（毫秒）。 */
export const MODEL_SWITCH_TOAST_DURATION_MS = 5000;

const MODEL_SWITCH_TOAST_NEUTRAL_CLASS = 'border-border/60 bg-background text-foreground shadow-lg';

const sharedToastOpts = {
  position: MODEL_SWITCH_TOAST_POSITION,
  style: MODEL_SWITCH_TOAST_STYLE,
} as const;

/** Sonner 从 loading 更新同 id toast 时 duration 可能仍为 Infinity，需手动 dismiss。 */
function scheduleToastDismiss(id: string | number, ms = MODEL_SWITCH_TOAST_DURATION_MS) {
  window.setTimeout(() => {
    toast.dismiss(id);
  }, ms);
}

export function modelSwitchToastLoading(displayName: string) {
  return toast.loading(`正在切换至「${displayName}」…`, {
    ...sharedToastOpts,
    className: MODEL_SWITCH_TOAST_NEUTRAL_CLASS,
    description: '模型热更新中，当前对话将保留',
  });
}

export function modelSwitchToastSuccess(toastId: string | number, displayName: string) {
  toast.dismiss(toastId);
  const id = toast(`模型已切换为「${displayName}」`, {
    ...sharedToastOpts,
    className: 'fc-toast-soft-violet',
    description: '下一条消息将使用新模型',
    duration: MODEL_SWITCH_TOAST_DURATION_MS,
    icon: <IconCheck className="size-4 text-violet-600 dark:text-violet-300" stroke={2} />,
  });
  scheduleToastDismiss(id);
  return id;
}

export function modelSwitchToastError(toastId: string | number, message: string) {
  toast.dismiss(toastId);
  const id = toast.error(message, {
    ...sharedToastOpts,
    duration: MODEL_SWITCH_TOAST_DURATION_MS,
  });
  scheduleToastDismiss(id);
  return id;
}
