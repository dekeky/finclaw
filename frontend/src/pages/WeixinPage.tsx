import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { fetchQrcode, fetchQrcodeStatus, saveQrcodeToLocal, getLocalQrcode, clearLocalQrcode, saveBoundBotId, getLocalBoundBotId, saveWeixinSettings } from '@/api/weixin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

type BindStatus = 'idle' | 'loading' | 'binding' | 'scaned' | 'bound' | 'expired' | 'error';

interface WeixinSettings {
  enabled: boolean;
  allowFrom: string[];
  proxy: string;
  boundBotId: string;
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
  });
  const [allowFromInput, setAllowFromInput] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  // 初始化：检查本地存储的绑定状态
  useEffect(() => {
    const savedBoundBotId = getLocalBoundBotId();
    if (savedBoundBotId) {
      setSettings(prev => ({ ...prev, boundBotId: savedBoundBotId }));
      setBindStatus('bound');
      return;
    }

    // 检查是否有未过期的二维码
    const savedQrcode = getLocalQrcode();
    if (savedQrcode) {
      // 有保存的二维码，先检查状态
      setQrcodeImgContent(savedQrcode.qrcodeContent);
      setBindStatus('binding');
      startPolling(savedQrcode.qrcode);
    }
  }, []);

  const loadQrcode = async () => {
    setBindStatus('loading');
    setError('');
    try {
      const resp = await fetchQrcode();
      console.log(resp, "请求链接结果");
      setQrcodeImgContent(resp.qrcode_img_content);
      setBindStatus('binding');
      // 保存到本地
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
        console.log('轮询状态:', resp.status, resp);
        if (resp.status === 'scaned') {
          setBindStatus('scaned');
        } else if (resp.status === 'confirmed') {
          console.log('确认绑定成功', resp);
          setBindStatus('bound');
          const botId = resp.ilink_user_id || '';
          const botToken = resp.bot_token || '';
          if (botId) {
            setSettings(prev => ({ ...prev, boundBotId: botId }));
            saveBoundBotId(botId);
            // 清除二维码本地存储
            clearLocalQrcode();
            // 保存设置到后端
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

  const handleRebind = () => {
    setSettings(prev => ({ ...prev, boundBotId: '' }));
    clearLocalQrcode();
    void loadQrcode();
  };

  const handleSave = () => {
    setIsDirty(false);
  };

  const handleReset = () => {
    setSettings({
      enabled: true,
      allowFrom: [],
      proxy: '',
      boundBotId: '',
    });
    setAllowFromInput('');
    setIsDirty(false);
  };

  const renderBindContent = () => {
    // 已绑定状态
    if (settings.boundBotId || bindStatus === 'bound') {
      return (
        <div className="flex flex-col items-center gap-3 py-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
            <svg className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l5 5l10 -10" />
            </svg>
          </div>
          <p className="text-sm font-medium text-emerald-600">微信已绑定</p>
          <p className="font-mono text-xs text-muted-foreground">{settings.boundBotId}</p>
          <Button variant="outline" size="sm" onClick={handleRebind} className="mt-1">
            <svg className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
            </svg>
            重新绑定
          </Button>
        </div>
      );
    }

    // 未绑定状态 - 显示绑定按钮
    if (bindStatus === 'idle') {
      return (
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <svg className="h-7 w-7 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348z"/>
            </svg>
          </div>
          <p className="text-sm text-muted-foreground">未绑定微信账号</p>
          <Button onClick={() => void loadQrcode()} size="sm">
            绑定微信
          </Button>
        </div>
      );
    }

    // 绑定中状态 - 显示二维码
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <div className="relative flex aspect-square w-56 items-center justify-center rounded-xl border border-border bg-background">
          {bindStatus === 'loading' && (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
              <span className="text-sm">加载中...</span>
            </div>
          )}

          {bindStatus === 'binding' && qrcodeImgContent && (
            <div className="flex flex-col items-center gap-2">
              <QRCodeSVG
                value={qrcodeImgContent}
                size={192}
                level="M"
              />
              <span className="text-xs text-muted-foreground">请使用微信扫描上方二维码</span>
            </div>
          )}

          {bindStatus === 'scaned' && (
            <div className="flex flex-col items-center gap-2 text-amber-600">
              <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium">已扫码，请在微信确认</span>
            </div>
          )}

          {bindStatus === 'expired' && (
            <div className="flex flex-col items-center gap-2 text-red-500">
              <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span className="text-sm font-medium">二维码已过期</span>
            </div>
          )}

          {bindStatus === 'error' && (
            <div className="flex flex-col items-center gap-2 text-red-500">
              <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span className="text-sm font-medium">{error || '加载失败'}</span>
            </div>
          )}
        </div>

        {(bindStatus === 'expired' || bindStatus === 'error') && (
          <Button onClick={() => void loadQrcode()} size="sm">
            重新获取二维码
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <h1 className="text-xl font-medium text-foreground/90">微信</h1>
        </div>

        {/* Enable Switch */}
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-6 py-4 shadow-sm shrink-0">
          <p className="text-sm font-medium">启用频道</p>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(checked: boolean) => {
              setSettings(prev => ({ ...prev, enabled: checked }));
              setIsDirty(true);
            }}
          />
        </div>

        {/* WeChat Account Binding Card */}
        <div className="rounded-xl bg-card py-6 text-sm text-card-foreground shadow-sm ring-1 ring-foreground/10 shrink-0">
          <div className="px-6 pb-4 border-b border-border/60">
            <div className="text-sm font-medium">微信账号绑定</div>
            <div className="text-sm text-muted-foreground">使用微信扫描二维码以绑定您的个人微信账号。</div>
          </div>
          <div className="p-0">
            {renderBindContent()}
          </div>
        </div>

        {/* Settings Card */}
        <div className="rounded-xl bg-card py-6 text-sm text-card-foreground shadow-sm ring-1 ring-foreground/10">
          <div className="divide-y divide-border/60 px-6 py-0">
            {/* Allow From */}
            <div className="py-5">
              <div className="space-y-1">
                <label className="text-sm font-medium">允许来源</label>
                <p className="text-xs text-muted-foreground">
                  允许访问的用户或群组 ID。可逐项添加，也支持一次粘贴多个值。
                </p>
              </div>
              <div className="mt-3 space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="例如 123456, 789012"
                    value={allowFromInput}
                    onChange={(e) => setAllowFromInput(e.target.value)}
                    className="h-9"
                  />
                  <Button size="sm" disabled={!allowFromInput.trim()}>
                    确认
                  </Button>
                </div>
              </div>
            </div>

            {/* HTTP Proxy */}
            <div className="py-5">
              <div className="space-y-1">
                <label className="text-sm font-medium">HTTP 代理</label>
                <p className="text-xs text-muted-foreground">HTTP 代理地址，用于网络访问</p>
              </div>
              <Input
                placeholder="http://localhost:7890"
                value={settings.proxy}
                onChange={(e) => {
                  setSettings(prev => ({ ...prev, proxy: e.target.value }));
                  setIsDirty(true);
                }}
                className="mt-3 h-9"
              />
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="flex justify-end gap-2 border-t border-border/60 pt-4 shrink-0">
          <Button variant="outline" onClick={handleReset} disabled={!isDirty}>
            重置
          </Button>
          <Button onClick={handleSave} disabled={!isDirty}>
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}