/** localStorage keys + defaults for resizable left panels (px). */
export const PANEL_WIDTH_KEYS = {
  appSidebar: 'finclaw.panelWidth.appSidebar',
  agentAssets: 'finclaw.panelWidth.agentAssets',
  agentsList: 'finclaw.panelWidth.agentsList',
  docToc: 'finclaw.panelWidth.docToc',
  backtestList: 'finclaw.panelWidth.backtestList',
  backtestChat: 'finclaw.panelWidth.backtestChat',
} as const;

export const PANEL_WIDTH_DEFAULTS = {
  appSidebar: 272, // 17rem
  agentAssets: 240, // lg:w-60
  agentsList: 224, // 14rem
  docToc: 220,
  backtestList: 224,
  backtestChat: 360,
} as const;

export const PANEL_WIDTH_LIMITS = {
  appSidebar: { minWidth: 88, maxWidth: 400 },
  agentAssets: { minWidth: 180, maxWidth: 520 },
  agentsList: { minWidth: 120, maxWidth: 400 },
  docToc: { minWidth: 160, maxWidth: 420 },
  backtestList: { minWidth: 120, maxWidth: 360 },
  backtestChat: { minWidth: 280, maxWidth: 560 },
} as const;
