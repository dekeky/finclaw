import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { IconChartAreaLine } from '@tabler/icons-react';

export default function BacktestPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-14 shrink-0 items-center border-b border-border/50 px-4">
        <h1 className="text-base font-medium tracking-tight text-foreground/90">量化回测</h1>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10">
              <IconChartAreaLine className="h-6 w-6 text-violet-500" />
            </div>
            <CardTitle>量化回测即将上线</CardTitle>
            <CardDescription>
              这里会放策略回测能力：数据源、策略编辑、回测结果与可视化、参数优化等。
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}