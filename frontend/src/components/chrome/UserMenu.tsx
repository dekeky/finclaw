import { IconLogout, IconUser } from '@tabler/icons-react';
import { useAuth } from '@/state/auth';
import { Button, buttonVariants } from '@/components/ui/button';
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

export function UserMenu() {
  const { user, logout } = useAuth();

  if (!user) return null;

  const handleLogout = () => {
    logout();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'rounded-full')}
        title={user.display_name || user.account}
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
          {userInitial(user)}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{user.display_name || '用户'}</span>
            <span className="text-xs text-muted-foreground">{user.account}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled className="text-muted-foreground">
          <IconUser className="size-4" />
          账户设置（即将推出）
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={handleLogout}>
          <IconLogout className="size-4" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 侧边栏底部退出入口，避免下拉菜单在某些环境下点击无效。 */
export function SidebarLogoutButton() {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 w-full justify-start gap-2 px-2 text-muted-foreground hover:text-destructive"
      onClick={logout}
    >
      <IconLogout className="size-4" />
      <span>退出登录</span>
    </Button>
  );
}
