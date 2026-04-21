import { Header } from '../components/Header';
import { GLOBAL_CSS } from '../styles/globalCss';

export default function BacktestPage() {
  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div style={layout.shell}>
        <Header mode="rss" />
        <div style={layout.body}>
          <div style={layout.card}>
            <div style={layout.title}>量化回测（即将上线）</div>
            <div style={layout.sub}>
              这里会放策略回测能力：数据源、策略编辑、回测结果与可视化、参数优化等。
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const layout: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#0c0c0e',
  },
  body: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: 'min(760px, 100%)',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)',
    padding: 22,
  },
  title: {
    fontSize: 18,
    fontWeight: 650,
    color: '#e8e8ec',
    marginBottom: 8,
    letterSpacing: '-0.02em',
  },
  sub: {
    fontSize: 13,
    color: '#8a8a92',
    lineHeight: 1.65,
  },
};

