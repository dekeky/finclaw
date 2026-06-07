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
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10">
              <IconNews className="h-6 w-6 text-violet-500" />
            </div>
            <CardTitle>金融资讯即将上线</CardTitle>
            <CardDescription className="space-y-2">
              <p>即将提供 AI 驱动的金融资讯阅读体验：</p>
              <ul className="list-inside list-disc space-y-1 text-left">
                <li>多源财经 RSS 聚合</li>
                <li>智能摘要与深度解读</li>
                <li>待读列表与文章分析助手</li>
              </ul>
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
