import { Header } from '../components/Header';

export default function SkillPage() {
  return (
    <div className="fc-page">
      <Header mode="rss" showBranding={false} />
      <div className="fc-page__main">
        <div className="fc-page__card">
          <div className="fc-page__title">skill（即将上线）</div>
          <div className="fc-page__sub">这里会放可复用的技能与工作流能力。</div>
        </div>
      </div>
    </div>
  );
}
