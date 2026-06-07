import { SidebarExpandTrigger } from '@/components/chrome/SidebarExpandTrigger';
import { ThemeToggle } from '@/components/chrome/ThemeToggle';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { IconChartAreaLine } from '@tabler/icons-react';

export default function BacktestPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/50 px-4">
        <SidebarExpandTrigger />
        <h1 className="min-w-0 flex-1 text-base font-medium tracking-tight text-foreground/90">量化回测</h1>
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10">
              <IconChartAreaLine className="h-6 w-6 text-violet-500" />
            </div>
            <CardTitle>量化回测即将上线</CardTitle>
            <CardDescription className="space-y-2">
              <p>即将提供两大核心能力：</p>
              <ul className="list-inside list-disc space-y-1 text-left">
                <li>量化策略智能生成</li>
                <li>回测验证</li>
              </ul>
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}