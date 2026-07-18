import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconChevronDown, IconCpu, IconLoader2 } from '@tabler/icons-react';
import { getAgent } from '@/api/agents';
import {
  getCachedModels,
  listModels,
  modelDisplayName,
  prefetchModels,
  type ModelProfileSummary,
} from '@/api/models';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAgents } from '@/state/agents';
import { cn } from '@/lib/cn';
import {
  modelSwitchToastError,
  modelSwitchToastLoading,
  modelSwitchToastSuccess,
} from '@/lib/modelSwitchToast';
import { TOOLBAR_ICON_BUTTON_CLASS } from '@/lib/toolbarButton';

const MENU_CONTENT_CLASS =
  'z-50 min-w-[13rem] w-[13rem] max-h-60 overflow-y-auto border-border/60 p-1 shadow-lg motion-reduce:animate-none data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0';

const SWITCHED_HIGHLIGHT_CLASS =
  'bg-violet-500/12 text-violet-600 shadow-[0_0_0_1px_rgba(139,92,246,0.35)] dark:text-violet-300';

export interface ModelSwitcherMenuProps {
  agentName: string;
  /** toolbar：对话顶栏图标；panel：Agent 配置页全宽按钮。 */
  variant?: 'toolbar' | 'panel';
  /** panel 模式下是否激活（用于懒加载模型列表）。 */
  active?: boolean;
  /** 模型切换成功后回调。 */
  onModelSwitched?: () => void;
}

export function ModelSwitcherMenu({
  agentName,
  variant = 'toolbar',
  active = true,
  onModelSwitched,
}: ModelSwitcherMenuProps) {
  const { updateAgent } = useAgents();
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [profiles, setProfiles] = useState<ModelProfileSummary[]>(() => getCachedModels() ?? []);
  const [profilesReady, setProfilesReady] = useState(() => getCachedModels() !== null);
  const [switching, setSwitching] = useState(false);
  const [justSwitched, setJustSwitched] = useState(false);
  const [open, setOpen] = useState(false);

  const isToolbar = variant === 'toolbar';

  const loadCurrentModel = useCallback(async () => {
    setModelLoading(true);
    try {
      const d = await getAgent(agentName);
      setCurrentModel(d.model_profile || d.model_provider.model || null);
    } catch {
      setCurrentModel(null);
    } finally {
      setModelLoading(false);
    }
  }, [agentName]);

  const refreshProfiles = useCallback(async () => {
    const cached = getCachedModels();
    if (cached) {
      setProfiles(cached);
      setProfilesReady(true);
    }
    try {
      const list = cached ? await listModels() : await prefetchModels();
      setProfiles(list);
    } catch {
      if (!cached) setProfiles([]);
    } finally {
      setProfilesReady(true);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void loadCurrentModel();
  }, [active, loadCurrentModel]);

  useEffect(() => {
    if (!active) return;
    void refreshProfiles();
  }, [active, refreshProfiles]);

  const handleSwitch = useCallback(
    async (displayName: string) => {
      if (switching || displayName === currentModel) return;
      setSwitching(true);
      const toastId = modelSwitchToastLoading(displayName);
      try {
        await updateAgent(agentName, { model: displayName });
        setCurrentModel(displayName);
        setJustSwitched(true);
        window.setTimeout(() => setJustSwitched(false), 2000);
        modelSwitchToastSuccess(toastId, displayName);
        setOpen(false);
        onModelSwitched?.();
      } catch (err) {
        modelSwitchToastError(
          toastId,
          err instanceof Error ? err.message : '切换模型失败',
        );
      } finally {
        setSwitching(false);
      }
    },
    [agentName, currentModel, onModelSwitched, switching, updateAgent],
  );

  const menuBody = (
    <>
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">切换模型</DropdownMenuLabel>
      <DropdownMenuSeparator />
      {!profilesReady && profiles.length === 0 ? (
        <DropdownMenuItem disabled className="gap-2">
          <IconLoader2 className="size-3.5 animate-spin" />
          加载模型列表…
        </DropdownMenuItem>
      ) : profiles.length === 0 ? (
        <DropdownMenuItem asChild>
          <Link to="/models" className="cursor-pointer text-violet-600 dark:text-violet-300">
            前往配置模型
          </Link>
        </DropdownMenuItem>
      ) : (
        profiles.map((profile) => {
          const name = modelDisplayName(profile);
          const inUse = currentModel === profile.display_name;
          return (
            <DropdownMenuItem
              key={profile.display_name}
              disabled={switching || inUse}
              className={cn(
                'flex items-center justify-between gap-2',
                inUse && 'bg-violet-500/10 font-medium text-violet-700 dark:text-violet-300',
              )}
              onSelect={(e) => {
                e.preventDefault();
                void handleSwitch(profile.display_name);
              }}
            >
              <span className="truncate">{name}</span>
              {inUse ? (
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  使用中
                </Badge>
              ) : switching ? null : (
                <span className="shrink-0 text-[10px] text-muted-foreground">切换</span>
              )}
            </DropdownMenuItem>
          );
        })
      )}
    </>
  );

  const triggerButton = isToolbar ? (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      disabled={switching}
      aria-label={currentModel ? `切换模型（${currentModel}）` : '切换模型'}
      className={cn(
        TOOLBAR_ICON_BUTTON_CLASS,
        'relative',
        (justSwitched || open) && SWITCHED_HIGHLIGHT_CLASS,
      )}
    >
      {switching ? (
        <IconLoader2 className="size-[18px] animate-spin" stroke={1.75} />
      ) : (
        <IconCpu className="size-[18px]" stroke={1.75} />
      )}
    </Button>
  ) : (
    <Button
      type="button"
      variant="outline"
      disabled={switching || modelLoading}
      className={cn(
        'h-11 w-full max-w-md justify-between gap-2 rounded-xl border-border/70 bg-background/80 px-3 shadow-xs',
        (justSwitched || open) && 'border-violet-500/35 bg-violet-500/8',
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        {switching ? (
          <IconLoader2 className="size-4 shrink-0 animate-spin" stroke={1.75} />
        ) : (
          <IconCpu className="size-4 shrink-0 text-violet-600 dark:text-violet-300" stroke={1.75} />
        )}
        <span className="truncate text-sm font-medium">
          {modelLoading ? '加载中…' : currentModel ?? '未配置模型'}
        </span>
      </span>
      <IconChevronDown
        className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        stroke={1.75}
      />
    </Button>
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={6}
        avoidCollisions={false}
        className={MENU_CONTENT_CLASS}
      >
        {menuBody}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
