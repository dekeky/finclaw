import { useState, type ComponentProps } from 'react';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

export interface SecretInputProps extends Omit<ComponentProps<'input'>, 'type'> {
  /** Defaults to「显示密钥」/「隐藏密钥」. */
  revealLabel?: { show: string; hide: string };
}

/** Password-style input with an eye toggle to reveal the value. */
export function SecretInput({
  className,
  revealLabel,
  disabled,
  ...props
}: SecretInputProps) {
  const [visible, setVisible] = useState(false);
  const showLabel = revealLabel?.show ?? '显示密钥';
  const hideLabel = revealLabel?.hide ?? '隐藏密钥';

  return (
    <div className="relative">
      <Input
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        className={cn('pr-9 font-mono text-sm', className)}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        aria-label={visible ? hideLabel : showLabel}
      >
        {visible ? <IconEyeOff className="size-4" stroke={1.75} /> : <IconEye className="size-4" stroke={1.75} />}
      </button>
    </div>
  );
}
