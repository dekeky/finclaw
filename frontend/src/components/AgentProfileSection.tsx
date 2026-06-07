import { useCallback, useRef, useState } from 'react';
import { IconCamera, IconTrash } from '@tabler/icons-react';
import { AgentAvatar } from '@/components/AgentAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAgents } from '@/state/agents';
import { PRIMARY_BUTTON_CLASS } from '@/lib/primaryButton';

const MAX_AVATAR_BYTES = 512 * 1024;

export interface AgentProfileSectionProps {
  agentName: string;
  hasAvatar: boolean;
  className?: string;
  onRenamed?: (newName: string) => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('无法读取图片'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('无法读取图片'));
    reader.readAsDataURL(file);
  });
}

/** Agent 名称与头像编辑区。 */
export function AgentProfileSection({ agentName, hasAvatar, className, onRenamed }: AgentProfileSectionProps) {
  const { agentNames, avatarRevision, renameAgent, uploadAgentAvatar, deleteAgentAvatar } = useAgents();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [nameDraft, setNameDraft] = useState(agentName);
  const [prevAgentName, setPrevAgentName] = useState(agentName);
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // 切换 Agent 时在同一渲染周期内同步草稿，避免 useEffect 延迟导致误报「同名冲突」闪显。
  if (agentName !== prevAgentName) {
    setPrevAgentName(agentName);
    setNameDraft(agentName);
    setRenameError(null);
    setAvatarError(null);
  }

  const nameChanged = nameDraft.trim() !== agentName;
  const nameConflict = nameDraft.trim().length > 0 && agentNames.includes(nameDraft.trim()) && nameDraft.trim() !== agentName;

  const onRename = useCallback(async () => {
    const next = nameDraft.trim();
    if (!next || next === agentName || nameConflict) return;
    setRenameBusy(true);
    setRenameError(null);
    try {
      await renameAgent(agentName, next);
      onRenamed?.(next);
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : String(e));
    } finally {
      setRenameBusy(false);
    }
  }, [agentName, nameConflict, nameDraft, onRenamed, renameAgent]);

  const onPickAvatar = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onAvatarSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        setAvatarError('请选择图片文件（JPEG、PNG 或 GIF）');
        return;
      }
      if (file.size > MAX_AVATAR_BYTES) {
        setAvatarError('图片不能超过 512 KB');
        return;
      }
      setAvatarBusy(true);
      setAvatarError(null);
      try {
        const dataUrl = await readFileAsDataUrl(file);
        await uploadAgentAvatar(agentName, dataUrl);
      } catch (err) {
        setAvatarError(err instanceof Error ? err.message : String(err));
      } finally {
        setAvatarBusy(false);
      }
    },
    [agentName, uploadAgentAvatar],
  );

  const onRemoveAvatar = useCallback(async () => {
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      await deleteAgentAvatar(agentName);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : String(err));
    } finally {
      setAvatarBusy(false);
    }
  }, [agentName, deleteAgentAvatar]);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="relative shrink-0">
          <AgentAvatar
            name={agentName}
            hasAvatar={hasAvatar}
            avatarRevision={avatarRevision}
            size="xl"
          />
          <button
            type="button"
            onClick={onPickAvatar}
            disabled={avatarBusy}
            className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            title="更换头像"
            aria-label="更换头像"
          >
            <IconCamera className="h-3.5 w-3.5" stroke={1.75} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif"
            className="hidden"
            onChange={(e) => void onAvatarSelected(e)}
          />
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">名称</label>
            <div className="flex flex-wrap gap-2">
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                disabled={renameBusy}
                className="max-w-xs text-sm"
                maxLength={64}
              />
              <Button
                type="button"
                variant="default"
                size="sm"
                className={PRIMARY_BUTTON_CLASS}
                disabled={!nameChanged || nameConflict || !nameDraft.trim() || renameBusy}
                onClick={() => void onRename()}
              >
                {renameBusy ? '保存中…' : '保存名称'}
              </Button>
            </div>
            {nameConflict && <p className="mt-1 text-xs text-destructive">已存在同名 Agent</p>}
            {renameError && <p className="mt-1 text-xs text-destructive">{renameError}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] text-muted-foreground">支持 JPEG / PNG / GIF，最大 512 KB，边长不超过 512 px。</p>
            {hasAvatar && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={avatarBusy}
                onClick={() => void onRemoveAvatar()}
              >
                <IconTrash className="mr-1 h-3 w-3" stroke={1.75} />
                移除头像
              </Button>
            )}
          </div>
          {avatarError && <p className="text-xs text-destructive">{avatarError}</p>}
        </div>
      </div>
    </div>
  );
}
