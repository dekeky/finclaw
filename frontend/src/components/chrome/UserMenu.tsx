import { IconLogout } from '@tabler/icons-react';
import { useAuth } from '@/state/auth';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function userInitial(user: { display_name?: string; account: string }): string {
  const name = user.display_name?.trim();
  if (name) return name.charAt(0).toUpperCase();
  return user.account.charAt(0).toUpperCase();
}

function UserAvatar({ user, className }: { user: { display_name?: string; account: string }; className?: string }) {
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary ring-1 ring-primary/15',
        className,
      )}
    >
      {userInitial(user)}
    </span>
  );
}

export function UserMenu() {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
          'shrink-0 rounded-full p-0 hover:bg-transparent',
        )}
        title={user.display_name || user.account}
      >
        <UserAvatar user={user} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{user.display_name || '用户'}</span>
            <span className="text-xs text-muted-foreground">{user.account}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={logout}>
          <IconLogout className="size-4" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 侧边栏底部用户信息：整行可点击，弹出菜单退出登录。 */
export function SidebarUserBlock() {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          title={user.display_name || user.account}
        >
          <UserAvatar user={user} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-foreground">
              {user.display_name || '用户'}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">{user.account}</p>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{user.display_name || '用户'}</span>
            <span className="text-xs text-muted-foreground">{user.account}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={logout}>
          <IconLogout className="size-4" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
