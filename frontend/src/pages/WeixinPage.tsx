import { useEffect, useRef, useState, type ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Dialog } from 'radix-ui';
import { IconRefresh, IconSwitchHorizontal } from '@tabler/icons-react';
import {
  fetchQrcode,
  fetchQrcodeStatus,
  saveQrcodeToLocal,
  getLocalQrcode,
  clearLocalQrcode,
  saveBoundBotId,
  getLocalBoundBotId,
  saveWeixinSettings,
  saveBoundAgent,
  getLocalBoundAgent,
  fetchWeixinSettings,
  clearLocalBoundBotId,
} from '@/api/weixin';
import { listAgents, type AgentSummary } from '@/api/agents';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AgentAvatar } from '@/components/AgentAvatar';
import { WechatIcon } from '@/components/WechatIcon';
import { ThemeToggle } from '@/components/chrome/ThemeToggle';
import { SidebarExpandTrigger } from '@/components/chrome/SidebarExpandTrigger';
import { cn } from '@/lib/cn';
import { TOOLBAR_ICON_BUTTON_CLASS } from '@/lib/toolbarButton';

type BindStatus = 'idle' | 'loading' | 'binding' | 'scaned' | 'bound' | 'expired' | 'error';

interface WeixinSettings {
  enabled: boolean;
  allowFrom: string[];
  proxy: string;
  boundBotId: string;
  boundAgent: string;
}

export default function WeixinPage() {
  const [bindStatus, setBindStatus] = useState<BindStatus>('idle');
  const [qrcodeImgContent, setQrcodeImgContent] = useState<string>('');
  const [error, setError] = useState<string>('');
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [settings, setSettings] = useState<WeixinSettings>({
    enabled: true,
    allowFrom: [],
    proxy: '',
    boundBotId: '',
    boundAgent: '',
  });
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState<string>('');
  const [savedAgent, setSavedAgent] = useState('');
  const [switchOpen, setSwitchOpen] = useState(false);
  const [switchTarget, setSwitchTarget] = useState('');
  const [agentSaving, setAgentSaving] = useState(false);

  const currentAgent = agents.find(a => a.name === savedAgent);
  const switchTargetAgent = agents.find(a => a.name === switchTarget);
  const canSwitch = agents.length > 1 && !agentsLoading && !agentsError;

  const isBound = settings.boundBotId !== '' || bindStatus === 'bound';

  // 初始化：检查本地存储的绑定状态
  useEffect(() => {
    const savedAgentLocal = getLocalBoundAgent();
    if (savedAgentLocal) {
      setSettings(prev => ({ ...prev, boundAgent: savedAgentLocal }));
      setSavedAgent(savedAgentLocal);
    }

    const savedBoundBotId = getLocalBoundBotId();
    if (savedBoundBotId) {
      setSettings(prev => ({ ...prev, boundBotId: savedBoundBotId }));
      setBindStatus('bound');
      return;
    }

    const savedQrcode = getLocalQrcode();
    if (savedQrcode) {
      setQrcodeImgContent(savedQrcode.qrcodeContent);
      setBindStatus('binding');
      startPolling(savedQrcode.qrcode);
    }
  }, []);

  // 加载 Agent 列表 + 后端绑定状态
  useEffect(() => {
    let cancelled = false;
    setAgentsLoading(true);
    setAgentsError('');
    Promise.all([
      listAgents(),
      fetchWeixinSettings().catch(() => null),
    ])
      .then(([list, remote]) => {
        if (cancelled) return;
        setAgents(list);

        const remoteAgent = remote?.bound_agent ?? '';
        const remoteAccountId = remote?.account_id ?? '';
        setSettings(prev => {
          let next = prev.boundAgent;
          if (remoteAgent && list.some(a => a.name === remoteAgent)) {
            next = remoteAgent;
          } else if (next && list.some(a => a.name === next)) {
            // 保持 next
          } else {
            next = list[0]?.name ?? '';
          }
          if (next !== prev.boundAgent) {
            saveBoundAgent(next);
          }
          const nextBotId = remoteAccountId || prev.boundBotId;
          if (remoteAccountId) {
            saveBoundBotId(remoteAccountId);
            setBindStatus('bound');
          }
          setSavedAgent(next);
          return { ...prev, boundAgent: next, boundBotId: nextBotId };
        });

        if (!remoteAgent) {
          const local = getLocalBoundAgent();
          if (local && list.some(a => a.name === local)) {
            void saveWeixinSettings({ bound_agent: local }).catch(err => {
              console.error('回写 bound_agent 失败:', err);
            });
          }
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setAgentsError(err instanceof Error ? err.message : '加载 Agent 失败');
      })
      .finally(() => {
        if (!cancelled) setAgentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openSwitchDialog = () => {
    setSwitchTarget(savedAgent);
    setSwitchOpen(true);
  };

  const handleConfirmSwitch = async () => {
    if (!switchTarget || switchTarget === savedAgent) return;

    setAgentSaving(true);
    try {
      await saveWeixinSettings({ bound_agent: switchTarget });
      saveBoundAgent(switchTarget);
      setSavedAgent(switchTarget);
      setSettings(prev => ({ ...prev, boundAgent: switchTarget }));
      setSwitchOpen(false);
    } catch (err) {
      console.error('保存 bound_agent 到后端失败:', err);
    } finally {
      setAgentSaving(false);
    }
  };

  const loadQrcode = async () => {
    setBindStatus('loading');
    setError('');
    try {
      const resp = await fetchQrcode();
      setQrcodeImgContent(resp.qrcode_img_content);
      setBindStatus('binding');
      saveQrcodeToLocal(resp.qrcode, resp.qrcode_img_content);
      startPolling(resp.qrcode);
    } catch {
      setBindStatus('error');
      setError('获取二维码失败');
    }
  };

  const startPolling = (qrcode: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current!);
    pollTimerRef.current = setInterval(async () => {
      try {
        const resp = await fetchQrcodeStatus(qrcode);
        if (resp.status === 'scaned') {
          setBindStatus('scaned');
        } else if (resp.status === 'confirmed') {
          setBindStatus('bound');
          const botId = resp.ilink_user_id || '';
          const botToken = resp.bot_token || '';
          if (botId) {
            setSettings(prev => ({ ...prev, boundBotId: botId }));
            saveBoundBotId(botId);
            clearLocalQrcode();
            saveWeixinSettings({
              token: botToken,
              account_id: botId,
              base_url: 'https://ilinkai.weixin.qq.com/',
              proxy: settings.proxy,
              enabled: true,
            }).catch(err => console.error('保存设置失败:', err));
          }
          clearInterval(pollTimerRef.current!);
        } else if (resp.status === 'expired') {
          setBindStatus('expired');
          clearLocalQrcode();
          clearInterval(pollTimerRef.current!);
        }
      } catch (err) {
        console.error('轮询错误:', err);
      }
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current!);
    };
  }, []);

  // 后端绑定状态确认为「未绑定」后，自动拉取二维码展示，无需用户手动点击。
  useEffect(() => {
    if (!agentsLoading && !isBound && bindStatus === 'idle') {
      void loadQrcode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentsLoading, isBound, bindStatus]);

  const handleRebind = async () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    clearLocalQrcode();
    clearLocalBoundBotId();
    setSettings(prev => ({ ...prev, boundBotId: '' }));
    setBindStatus('idle');

    try {
      await saveWeixinSettings({
        account_id: '',
        token: '',
        enabled: false,
      });
    } catch (err) {
      console.error('解除绑定失败:', err);
    }

    void loadQrcode();
  };

  const renderIconActionButton = (
    label: string,
    icon: ReactNode,
    onClick: () => void,
    disabled?: boolean,
  ) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={TOOLBAR_ICON_BUTTON_CLASS}
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );

  const renderAgentControls = () => (
    <>
      {agentsLoading ? (
        <span className="text-sm text-muted-foreground">加载中…</span>
      ) : agentsError ? (
        <span className="text-sm text-red-500">{agentsError}</span>
      ) : agents.length === 0 ? (
        <span className="text-sm text-muted-foreground">尚未创建 Agent</span>
      ) : (
        <>
          <span className="flex min-w-0 items-center gap-1.5">
            {currentAgent && (
              <AgentAvatar
                name={currentAgent.name}
                hasAvatar={currentAgent.has_avatar}
                size="sm"
                className="!h-6 !w-6 !text-[10px]"
              />
            )}
            <span className="max-w-[8rem] truncate text-sm font-medium">{savedAgent || '—'}</span>
          </span>
          {renderIconActionButton(
            '切换',
            <IconSwitchHorizontal className="size-3.5" stroke={1.75} />,
            openSwitchDialog,
            !canSwitch || agentSaving,
          )}
        </>
      )}
    </>
  );

  const renderAgentFooter = () => (
    <div className="flex flex-wrap items-center justify-center gap-2.5">
      {renderAgentControls()}
    </div>
  );

  const renderBoundSection = () => (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="flex items-center gap-3">
        <WechatIcon className="h-7 w-7 text-emerald-600" />
        <span className="text-sm font-medium text-emerald-600">已绑定</span>
        {renderIconActionButton(
          '重新绑定',
          <IconRefresh className="size-3.5" stroke={1.75} />,
          () => void handleRebind(),
        )}
      </div>
      {renderAgentFooter()}
    </div>
  );

  const renderIdleSection = () => (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        正在准备二维码…
      </div>
      {renderAgentFooter()}
    </div>
  );

  const renderBindingSection = () => {
    if (isBound) return renderBoundSection();
    if (bindStatus === 'idle') return renderIdleSection();

    return (
      <div className="flex flex-col items-center gap-4 py-6">
        {bindStatus === 'loading' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            正在获取二维码…
          </div>
        )}

        {bindStatus === 'binding' && qrcodeImgContent && (
          <>
            <QRCodeSVG value={qrcodeImgContent} size={176} level="M" />
            <span className="text-xs text-muted-foreground">请使用微信扫描二维码完成绑定</span>
          </>
        )}

        {bindStatus === 'scaned' && (
          <span className="text-sm font-medium text-amber-600">已扫码，请在微信中确认</span>
        )}

        {(bindStatus === 'expired' || bindStatus === 'error') && (
          <>
            <span className="text-sm font-medium text-red-500">
              {bindStatus === 'expired' ? '二维码已过期' : error || '加载失败'}
            </span>
            <Button onClick={() => void loadQrcode()} size="sm">
              重新获取二维码
            </Button>
          </>
        )}

        {renderAgentFooter()}
      </div>
    );
  };

  const renderBindContent = () => renderBindingSection();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/50 px-4">
        <SidebarExpandTrigger />
        <h1 className="min-w-0 flex-1 text-base font-medium tracking-tight text-foreground/90">微信</h1>
        <ThemeToggle />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-4xl space-y-6">
          <div className="rounded-xl bg-card text-sm text-card-foreground shadow-sm ring-1 ring-foreground/10 shrink-0">
            <div className="border-b border-foreground/10 px-6 py-3">
              <p className="font-semibold text-foreground">微信账号绑定</p>
              <p className="mt-0.5 text-muted-foreground">使用微信账户与您的 Agent 聊天</p>
            </div>
            <div className="px-6">
              {renderBindContent()}
            </div>
          </div>
        </div>
      </div>

      <Dialog.Root open={switchOpen} onOpenChange={setSwitchOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[1200] bg-black/45 supports-backdrop-filter:backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Content
            className={cn(
              'fixed left-1/2 top-1/2 z-[1201] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2',
              'rounded-xl border border-border bg-background p-5 shadow-2xl',
              'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            )}
          >
            <Dialog.Title className="text-sm font-semibold text-foreground">切换 Agent</Dialog.Title>
            <Dialog.Description asChild>
              <div className="mt-2 space-y-2 text-xs leading-relaxed text-muted-foreground">
                <p>
                  微信消息当前由 <strong className="text-foreground">{savedAgent || '—'}</strong> 处理。
                </p>
                <p>
                  切换后，<strong className="text-foreground">后续</strong>来自微信的新消息将转交给新 Agent 处理。
                </p>
              </div>
            </Dialog.Description>

            <div className="mt-4 max-h-52 space-y-1 overflow-y-auto">
              {agents.map(agent => {
                const selected = switchTarget === agent.name;
                const isCurrent = savedAgent === agent.name;
                return (
                  <button
                    key={agent.name}
                    type="button"
                    onClick={() => setSwitchTarget(agent.name)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      selected
                        ? 'bg-violet-500/10 ring-1 ring-violet-500/30'
                        : 'hover:bg-muted/70',
                    )}
                  >
                    <AgentAvatar
                      name={agent.name}
                      hasAvatar={agent.has_avatar}
                      size="sm"
                      className="!h-6 !w-6 !text-[10px]"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">{agent.name}</span>
                    {isCurrent && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">当前</span>
                    )}
                  </button>
                );
              })}
            </div>

            {switchTarget && switchTarget !== savedAgent && switchTargetAgent && (
              <p className="mt-3 rounded-lg bg-amber-500/8 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
                确认后，微信消息将由 <strong>{switchTargetAgent.name}</strong> 接管处理。
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setSwitchOpen(false)} disabled={agentSaving}>
                取消
              </Button>
              <Button
                size="sm"
                disabled={agentSaving || !switchTarget || switchTarget === savedAgent}
                onClick={() => void handleConfirmSwitch()}
              >
                {agentSaving ? '切换中…' : '确认切换'}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
