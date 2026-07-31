const BASE_URL = '';

export interface QrcodeResponse {
  qrcode: string;
  qrcode_img_content: string;
}

export interface QrcodeStatusResponse {
  status: 'wait' | 'scaned' | 'confirmed' | 'expired' | 'error';
  bot_token?: string;
  ilink_user_id?: string;
}

export interface WeixinSettings {
  enabled: boolean;
  allowFrom: string[];
  proxy: string;
  boundBotId: string;
  boundAgent: string;
}

/** GET /api/weixin/auth/settings 后端响应字段。 */
export interface WeixinSettingsResponse {
  account_id: string;
  base_url: string;
  proxy: string;
  enabled: boolean;
  bound_agent: string;
}

export async function fetchQrcode(): Promise<QrcodeResponse> {
  const res = await fetch(`${BASE_URL}/api/weixin/auth/qrcode`);
  if (!res.ok) throw new Error(`获取二维码失败: ${res.status}`);
  const data = await res.json();
  console.log("请求数据打印", data);
  return data;
}

export async function fetchQrcodeStatus(qrcode: string): Promise<QrcodeStatusResponse> {
  const res = await fetch(`${BASE_URL}/api/weixin/auth/qrcode/status?qrcode=${encodeURIComponent(qrcode)}`);
  if (!res.ok) throw new Error(`查询状态失败: ${res.status}`);
  const data = await res.json();
  console.log('查询状态结果:', data);
  return data;
}

// 保存微信设置到后端
export interface WeixinBackendSettings {
  token?: string;
  account_id?: string;
  base_url?: string;
  proxy?: string;
  enabled?: boolean;
  bound_agent?: string;
}

export async function saveWeixinSettings(settings: WeixinBackendSettings): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/weixin/auth/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`保存设置失败: ${res.status}`);
}

// 从后端获取微信设置
export async function fetchWeixinSettings(): Promise<WeixinSettingsResponse> {
  const res = await fetch(`${BASE_URL}/api/weixin/auth/settings`);
  if (!res.ok) throw new Error(`获取设置失败: ${res.status}`);
  return res.json();
}

// 本地存储 keys（按用户 id 隔离，避免未登录或切换账号时串数据）
const STORAGE_KEYS = {
  QRCODE: 'weixin_qrcode',
  QRCODE_CONTENT: 'weixin_qrcode_content',
  BOUND_BOT_ID: 'weixin_bound_bot_id',
  SETTINGS: 'weixin_settings',
  BOUND_AGENT: 'weixin_bound_agent',
} as const;

function scopedKey(base: string, userId: string): string {
  return `${base}:${userId}`;
}

// 本地保存二维码信息
export function saveQrcodeToLocal(qrcode: string, qrcodeContent: string, userId: string): void {
  localStorage.setItem(scopedKey(STORAGE_KEYS.QRCODE, userId), qrcode);
  localStorage.setItem(scopedKey(STORAGE_KEYS.QRCODE_CONTENT, userId), qrcodeContent);
}

// 获取本地保存的二维码信息
export function getLocalQrcode(userId: string): { qrcode: string; qrcodeContent: string } | null {
  const qrcode = localStorage.getItem(scopedKey(STORAGE_KEYS.QRCODE, userId));
  const qrcodeContent = localStorage.getItem(scopedKey(STORAGE_KEYS.QRCODE_CONTENT, userId));
  if (qrcode && qrcodeContent) {
    return { qrcode, qrcodeContent };
  }
  return null;
}

// 清除本地二维码信息
export function clearLocalQrcode(userId: string): void {
  localStorage.removeItem(scopedKey(STORAGE_KEYS.QRCODE, userId));
  localStorage.removeItem(scopedKey(STORAGE_KEYS.QRCODE_CONTENT, userId));
}

// 保存绑定信息
export function saveBoundBotId(botId: string, userId: string): void {
  localStorage.setItem(scopedKey(STORAGE_KEYS.BOUND_BOT_ID, userId), botId);
}

// 获取本地绑定信息
export function getLocalBoundBotId(userId: string): string | null {
  return localStorage.getItem(scopedKey(STORAGE_KEYS.BOUND_BOT_ID, userId));
}

// 清除本地绑定信息
export function clearLocalBoundBotId(userId: string): void {
  localStorage.removeItem(scopedKey(STORAGE_KEYS.BOUND_BOT_ID, userId));
}

// 保存绑定 Agent
export function saveBoundAgent(name: string, userId: string): void {
  const key = scopedKey(STORAGE_KEYS.BOUND_AGENT, userId);
  if (name) localStorage.setItem(key, name);
  else localStorage.removeItem(key);
}

// 获取本地绑定的 Agent 名
export function getLocalBoundAgent(userId: string): string | null {
  return localStorage.getItem(scopedKey(STORAGE_KEYS.BOUND_AGENT, userId));
}