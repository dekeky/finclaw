import { ModelSwitcherMenu } from '@/components/ModelSwitcherMenu';

interface ChatModelSwitcherProps {
  agentName: string;
}

/** 对话页顶栏：当前 Agent 的模型切换。 */
export function ChatModelSwitcher({ agentName }: ChatModelSwitcherProps) {
  return <ModelSwitcherMenu agentName={agentName} variant="toolbar" />;
}
