import { genSessionId, loadSessionId, saveSessionId } from '@/lib/agentSessions';
import { listConversations } from '@/lib/chatPersistence';

/**
 * 对话标签页持久化：每个 Agent 维护一组「同时打开的对话」。
 *
 * 标签页的 id 就是该对话的 conversationId（同时也是 WS sessionId），
 * 因此一个标签页 = 一条可独立持久化 / 独立连接的会话。
 * 打开的标签集合与当前激活标签都会落盘，刷新后原样恢复。
 */

const TABS_KEY = 'finclaw.chat.tabs.v1';
const TABS_VERSION = 1 as const;

export interface ChatTab {
  /** conversationId == sessionId */
  id: string;
  /** 标签标题；空串表示尚未产生用户消息（UI 显示占位文案） */
  title: string;
}

export interface AgentTabs {
  tabs: ChatTab[];
  activeId: string | null;
}

interface TabsRoot {
  v: typeof TABS_VERSION;
  agents: Record<string, AgentTabs>;
}

function emptyRoot(): TabsRoot {
  return { v: TABS_VERSION, agents: {} };
}

function readRoot(): TabsRoot {
  if (typeof localStorage === 'undefined') return emptyRoot();
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (!raw) return emptyRoot();
    const data = JSON.parse(raw) as TabsRoot;
    if (data?.v !== TABS_VERSION || typeof data.agents !== 'object' || !data.agents) {
      return emptyRoot();
    }
    return data;
  } catch {
    return emptyRoot();
  }
}

function writeRoot(root: TabsRoot): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify(root));
  } catch {
    // quota / private mode — ignore
  }
}

function normalizeTabs(entry: AgentTabs | undefined): AgentTabs | null {
  if (!entry || !Array.isArray(entry.tabs)) return null;
  const seen = new Set<string>();
  const tabs: ChatTab[] = [];
  for (const tab of entry.tabs) {
    const id = typeof tab?.id === 'string' ? tab.id.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    tabs.push({ id, title: typeof tab.title === 'string' ? tab.title : '' });
  }
  if (tabs.length === 0) return null;
  const activeId =
    entry.activeId && tabs.some((t) => t.id === entry.activeId) ? entry.activeId : tabs[0]!.id;
  return { tabs, activeId };
}

/**
 * 读取指定 Agent 已打开的标签页；首次使用时以该 Agent 当前会话指针种子化一条标签，
 * 保证「一个对话界面」默认只有一条与现有历史无缝衔接的对话。
 */
export function loadAgentTabs(agentId: string, resolveTitle?: (id: string) => string): AgentTabs {
  if (!agentId) return { tabs: [], activeId: null };
  const root = readRoot();
  const normalized = normalizeTabs(root.agents[agentId]);
  if (normalized) return normalized;

  const sid = loadSessionId(agentId) ?? genSessionId();
  // 指针同步到种子标签，避免刷新后 session 指针与标签不一致
  saveSessionId(agentId, sid);
  const title =
    resolveTitle?.(sid) ??
    listConversations(agentId).find((c) => c.id === sid)?.title ??
    '';
  const seeded: AgentTabs = { tabs: [{ id: sid, title }], activeId: sid };
  root.agents[agentId] = seeded;
  writeRoot(root);
  return seeded;
}

/** 写入指定 Agent 的标签页集合与激活标签；集合为空时清除该 Agent 的记录。 */
export function saveAgentTabs(agentId: string, tabs: ChatTab[], activeId: string | null): void {
  if (!agentId) return;
  const root = readRoot();
  if (tabs.length === 0) {
    delete root.agents[agentId];
  } else {
    root.agents[agentId] = { tabs, activeId };
  }
  writeRoot(root);
}

/** 生成一个新的对话 / 标签 id。 */
export function newConversationId(): string {
  return genSessionId();
}
