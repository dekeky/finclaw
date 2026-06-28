import { SidebarExpandTrigger } from '@/components/chrome/SidebarExpandTrigger';
import { ThemeToggle } from '@/components/chrome/ThemeToggle';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { IconNews } from '@tabler/icons-react';

export default function NewsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/50 px-4">
        <SidebarExpandTrigger />
        <h1 className="min-w-0 flex-1 text-base font-medium tracking-tight text-foreground/90">金融资讯</h1>
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <IconNews className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>金融资讯即将上线</CardTitle>
            <CardDescription>
              <p>将提供 AI 驱动的金融资讯阅读体验</p>
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
