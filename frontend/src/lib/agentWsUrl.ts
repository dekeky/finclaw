/** 构建与当前 Agent 的 WebSocket 聊天 URL（含 /ws 前缀，走 Vite 或同源代理）。 */
export function buildAgentWsUrl(agentName: string | null): string | null {
  if (!agentName) return null;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws/chat/${encodeURIComponent(agentName)}`;
}
