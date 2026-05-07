import { Header } from '../components/Header';

export default function BacktestPage() {
  return (
    <div className="fc-page">
      <Header mode="rss" showBranding={false} />
      <div className="fc-page__main">
        <div className="fc-page__card">
          <div className="fc-page__title">量化回测（即将上线）</div>
          <div className="fc-page__sub">
            这里会放策略回测能力：数据源、策略编辑、回测结果与可视化、参数优化等。
          </div>
        </div>
      </div>
    </div>
  );
}
