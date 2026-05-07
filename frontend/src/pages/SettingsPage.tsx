import { Header } from '../components/Header';

export default function SettingsPage() {
  return (
    <div className="fc-page">
      <Header mode="rss" showBranding={false} />
      <div className="fc-page__main">
        <div className="fc-page__card">
          <div className="fc-page__title">设置（即将上线）</div>
          <div className="fc-page__sub">这里会放偏好配置、数据源管理、模型与提示词等设置。</div>
        </div>
      </div>
    </div>
  );
}
