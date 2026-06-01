import { SidebarExpandTrigger } from '@/components/chrome/SidebarExpandTrigger';
import { ThemeToggle } from '@/components/chrome/ThemeToggle';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { IconSparkles } from '@tabler/icons-react';

export default function SkillPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/50 px-4">
        <SidebarExpandTrigger />
        <h1 className="min-w-0 flex-1 text-base font-medium tracking-tight text-foreground/90">SkillHub</h1>
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10">
              <IconSparkles className="h-6 w-6 text-violet-500" />
            </div>
            <CardTitle>SkillHub 即将上线</CardTitle>
            <CardDescription>
              可扩展的 Skill 市场，支持自定义技能工作流与第三方集成。
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}