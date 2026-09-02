import { Navigate } from 'react-router-dom';

/** 旧路由兼容：合并进 `/agents` 的「Agent 市场」分段。 */
export default function AgentMarketPage() {
  return <Navigate to="/agents" replace state={{ showMarket: true }} />;
}
