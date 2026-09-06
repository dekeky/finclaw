import { ModelSwitcherMenu } from '@/components/ModelSwitcherMenu';

interface ChatModelSwitcherProps {
  agentName: string;
}

/** 对话输入框底部：当前 Agent 的模型切换。 */
export function ChatModelSwitcher({ agentName }: ChatModelSwitcherProps) {
  return <ModelSwitcherMenu agentName={agentName} variant="composer" />;
}
