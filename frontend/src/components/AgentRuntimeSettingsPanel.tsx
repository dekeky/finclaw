import type { ReactNode } from 'react';
import { AgentLLMSettingsSection } from '@/components/AgentLLMSettingsSection';
import { HintTooltip } from '@/components/HintTooltip';
import { ModelSwitcherMenu } from '@/components/ModelSwitcherMenu';
import { cn } from '@/lib/cn';

export interface AgentRuntimeSettingsPanelProps {
  agentName: string;
  active?: boolean;
  reloadToken?: number;
  onModelSwitched?: () => void;
  className?: string;
}

const MODEL_SECTION_HINT =
  '选择本 Agent 对话时使用的模型。切换后立即生效，历史上下文保留；与下方对话参数无关。运行时配置均可热更新。API 接入请在左侧栏「模型中心」管理。';

const DIALOG_PARAMS_HINT =
  '调整回复随机性与是否启用深度思考；与上方模型选择无关，修改后需保存生效。';

function SettingsSection({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 border-b border-border/80 pb-3">
        <h3 className="text-[15px] font-semibold leading-none tracking-tight text-foreground">{title}</h3>
        <HintTooltip text={hint} side="top" />
      </div>
      <div>{children}</div>
    </section>
  );
}

/** Agent 运行时设置：模型选择与对话参数，排版分区、相互独立。 */
export function AgentRuntimeSettingsPanel({
  agentName,
  active = true,
  reloadToken = 0,
  onModelSwitched,
  className,
}: AgentRuntimeSettingsPanelProps) {
  return (
    <div className={cn('space-y-10', className)}>
      <SettingsSection title="模型" hint={MODEL_SECTION_HINT}>
        <div className="pl-5">
          <ModelSwitcherMenu
            agentName={agentName}
            variant="panel"
            active={active}
            onModelSwitched={onModelSwitched}
          />
        </div>
      </SettingsSection>

      <SettingsSection title="对话参数" hint={DIALOG_PARAMS_HINT} className="pt-2">
        <AgentLLMSettingsSection
          agentName={agentName}
          active={active}
          reloadToken={reloadToken}
          embedded
        />
      </SettingsSection>
    </div>
  );
}
