/** 主按钮（FinClaw 深蓝 / violet-600）。 */
export const PRIMARY_BUTTON_CLASS =
  'bg-violet-600 text-white hover:bg-violet-600/90';

/** 可选中 / 标签式按钮的选中态（实心，亮暗色都清晰）。 */
export const PRIMARY_TAB_ACTIVE_CLASS =
  'bg-violet-600 font-medium text-white shadow-sm shadow-violet-600/25 dark:bg-violet-500 dark:shadow-violet-500/30';

/** 列表项等轻量选中态（浅紫底，非实心）。 */
export const PRIMARY_LIST_ITEM_SELECTED_CLASS =
  'bg-violet-500/12 font-medium text-violet-700 dark:bg-violet-500/18 dark:text-violet-200';

/** 可选中 / 标签式按钮的未选中态（含悬停）。 */
export const PRIMARY_TAB_INACTIVE_CLASS =
  'text-muted-foreground hover:bg-violet-500/10 hover:text-violet-700 dark:hover:bg-violet-500/14 dark:hover:text-violet-300';

/** @deprecated 使用 PRIMARY_TAB_INACTIVE_CLASS */
export const PRIMARY_TAB_INACTIVE_HOVER_CLASS = PRIMARY_TAB_INACTIVE_CLASS;

/** 分段控件轨道。 */
export const SEGMENTED_CONTROL_TRACK_CLASS =
  'inline-flex items-center rounded-lg border border-border/70 bg-muted/70 p-0.5 dark:border-border/50 dark:bg-muted/50';

/** 分段控件选项基础尺寸。 */
export const SEGMENTED_CONTROL_ITEM_CLASS =
  'h-7 rounded-md px-3 text-[12.5px] transition-colors';

/** 顶栏图标按钮悬停。 */
export const TOOLBAR_ICON_BUTTON_CLASS =
  'size-8 shrink-0 text-muted-foreground transition-all duration-150 hover:bg-violet-500/10 hover:text-violet-700 hover:shadow-[0_0_0_1px_rgba(139,92,246,0.22)] active:scale-[0.96] dark:hover:bg-violet-500/14 dark:hover:text-violet-300 dark:hover:shadow-[0_0_0_1px_rgba(167,139,250,0.28)] focus-visible:bg-violet-500/10 focus-visible:text-violet-700 focus-visible:ring-2 focus-visible:ring-violet-500/35 dark:focus-visible:text-violet-300';

/** AI 润色条等区域的图标渐变底。 */
export const PRIMARY_ICON_GRADIENT_CLASS =
  'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-500/30';

/** AI 润色条容器边框与背景。 */
export const PRIMARY_AI_PANEL_CLASS =
  'border border-violet-500/25 bg-gradient-to-r from-violet-500/[0.08] via-fuchsia-500/[0.05] to-violet-500/[0.08]';

export const PRIMARY_AI_PANEL_HOVER_CLASS =
  'hover:from-violet-500/12 hover:via-fuchsia-500/8 hover:to-violet-500/12';

/** 保存按钮无改动时的轻量态（浅紫底，非实心深蓝）。 */
export const SAVE_BUTTON_IDLE_CLASS =
  'bg-violet-500/10 text-violet-600 hover:bg-violet-500/15 dark:bg-violet-500/14 dark:text-violet-300 dark:hover:bg-violet-500/20';
