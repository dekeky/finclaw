import { ChatAgentComposerPicker } from '@/components/chrome/ChatAgentComposerPicker';
import { ChatModelSwitcher } from '@/components/chrome/ChatModelSwitcher';
import { ChatThinkingToggle } from '@/components/chrome/ChatThinkingToggle';
import { useAgents } from '@/state/agents';

/** 输入框底部工具条：Agent / 模型 / 深度思考，对齐 Cursor composer 下沿。 */
export function ChatComposerToolbar() {
  const { currentAgent } = useAgents();
  return (
    <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
      <ChatAgentComposerPicker />
      {currentAgent ? (
        <>
          <ChatModelSwitcher agentName={currentAgent} />
          <ChatThinkingToggle agentName={currentAgent} variant="composer" />
        </>
      ) : null}
    </div>
  );
}
