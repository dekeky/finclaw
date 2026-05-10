import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  IconAtom,
  IconBatteryCharging,
  IconBuildingBank,
  IconWorld,
  IconDeviceDesktop,
  IconBuildingFactory,
  IconShoppingCart,
  IconLeaf,
} from '@tabler/icons-react';

const TOPIC_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  '科技与算力': IconDeviceDesktop,
  '新能源': IconBatteryCharging,
  '利率与流动性': IconBuildingBank,
  '跨境与大宗': IconWorld,
};

export default function HomeHubPage() {
  const navigate = useNavigate();

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8">
      <div className="mx-auto max-w-[1280px]">
        <h1 className="mb-6 text-xl font-medium tracking-tight text-foreground/90">工作台</h1>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.35fr_0.95fr] md:grid-cols-2">
          {/* Today's Topics */}
          <Card>
            <CardHeader>
              <CardTitle>今日热点</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {TODAY_TOPICS.map((row) => {
                const Icon = TOPIC_ICONS[row.t] || IconAtom;
                return (
                  <button
                    key={row.t}
                    type="button"
                    className="flex items-start gap-3 rounded-xl border border-border bg-background p-3 text-left transition-colors hover:bg-muted/60"
                    onClick={() => navigate('/news')}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">{row.t}</div>
                      <div className="mt-1 text-xs text-muted-foreground leading-relaxed">{row.d}</div>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {/* FAQ */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>常见问题</CardTitle>
              <div className="flex gap-1">
                {['宏观', '市场', '公司'].map((tab, i) => (
                  <Badge
                    key={tab}
                    variant={i === 1 ? 'default' : 'outline'}
                    className="cursor-default"
                  >
                    {tab}
                  </Badge>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {QUERIES.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="rounded-lg border border-border bg-background px-3 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:border-violet-500/20 hover:bg-violet-500/5 hover:text-violet-600"
                    onClick={() => navigate('/news', { state: { hubQuery: q } })}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Focus Areas */}
          <Card>
            <CardHeader>
              <CardTitle>关注方向</CardTitle>
              <CardDescription>持续跟踪的核心赛道</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {EVENT_CARDS.map((ev) => (
                <button
                  key={ev.title}
                  type="button"
                  className={`flex flex-col gap-1.5 rounded-xl border border-border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${ev.bg}`}
                  onClick={() => navigate('/news')}
                >
                  <div className="flex items-center gap-2">
                    <ev.Icon className={`size-4 ${ev.iconColor}`} />
                    <span className="text-sm font-semibold text-foreground">{ev.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{ev.sub}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

const TODAY_TOPICS = [
  { t: '科技与算力', d: '景气链条与 capex 预期仍在博弈，关注季报指引。' },
  { t: '新能源', d: '排产与价格信号分化，紧盯政策与海外需求。' },
  { t: '利率与流动性', d: '海外路径与国内宽松节奏共同影响风险偏好。' },
  { t: '跨境与大宗', d: '汇率与库存周期对周期股弹性影响显著。' },
];

const QUERIES = [
  '今日要闻里有哪些政策表述变化？',
  '海外宏观数据发布后，市场预期如何漂移？',
  '哪些赛道在资金流向上出现连续异动？',
  '把本周重要财报要点按表格汇总',
  '列表里有无明显矛盾或风险提示？',
  '从估值与景气匹配度看，哪些更值得跟踪？',
];

const EVENT_CARDS = [
  { title: '算力与应用', sub: '云 + 模型商业化', Icon: IconDeviceDesktop, iconColor: 'text-blue-500', bg: 'bg-blue-50/50 dark:bg-blue-950/20' },
  { title: '先进制造', sub: '产业升级与出海', Icon: IconBuildingFactory, iconColor: 'text-pink-500', bg: 'bg-pink-50/50 dark:bg-pink-950/20' },
  { title: '消费修复', sub: '可选与必选分化', Icon: IconShoppingCart, iconColor: 'text-amber-500', bg: 'bg-amber-50/50 dark:bg-amber-950/20' },
  { title: '绿色转型', sub: '政策与招投标', Icon: IconLeaf, iconColor: 'text-emerald-500', bg: 'bg-emerald-50/50 dark:bg-emerald-950/20' },
];
