import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { FinclawMark } from './FinclawMark';

const LS_SIDEBAR = 'finclaw.sidebarCollapsed';
const NAV_COMPACT_MQ = '(max-width: 1040px)';

type Item = {
  to: string;
  label: string;
  icon: string;
  disabled?: boolean;
  badge?: string;
};

const ITEMS: Item[] = [
  { to: '/news', label: '金融资讯', icon: '📰' },
  { to: '/agents', label: 'Agent 管理', icon: '🤖' },
  { to: '/backtest', label: '量化回测', icon: '📈', badge: 'Soon' },
  { to: '/skill', label: 'SkillHub', icon: '🧠', badge: 'Soon' },
  { to: '/settings', label: '设置', icon: '⚙️', badge: 'Soon' },
];

export function AppSidebar() {
  const narrow = useMediaQuery(NAV_COMPACT_MQ);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(LS_SIDEBAR) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LS_SIDEBAR, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const compact = narrow || collapsed;
  const showToggle = !narrow;

  return (
    <>
      <style>{CSS}</style>
      <aside
        className={`app-sb ${compact ? 'app-sb--compact' : ''}`}
        aria-label="主导航"
        data-collapsed={compact ? 'true' : 'false'}
      >
        <Link to="/" className="app-sb-brand" aria-label="Finclaw 首页">
          <div className="app-sb-logo" aria-hidden>
            <FinclawMark variant="mark" size={26} decorative />
          </div>
          <div className="app-sb-brand-copy">
            <div className="app-sb-brand-name">Finclaw</div>
          </div>
        </Link>

        <nav className="app-sb-nav">
          {ITEMS.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              className={({ isActive }) =>
                `app-sb-item ${isActive ? 'active' : ''} ${it.disabled ? 'disabled' : ''}`
              }
              title={it.label}
              aria-label={it.label}
              onClick={(e) => {
                if (it.disabled) e.preventDefault();
              }}
            >
              <span className="app-sb-ic" aria-hidden>
                {it.icon}
              </span>
              <span className="app-sb-copy">
                <span className="app-sb-txt">{it.label}</span>
                {it.badge ? <span className="app-sb-badge">{it.badge}</span> : null}
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="app-sb-divider" />

        <NavLink to="/news" className="app-sb-fav">
          <span className="app-sb-fav-ic" aria-hidden>
            ⭐
          </span>
          <span className="app-sb-fav-label">我的待读</span>
        </NavLink>

        {showToggle ? (
          <button
            type="button"
            className="app-sb-toggle"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
          >
            <span className="app-sb-toggle-ic" aria-hidden>
              {collapsed ? '›' : '‹'}
            </span>
            <span className="app-sb-toggle-txt">{collapsed ? '展开' : '收起'}</span>
          </button>
        ) : null}

        <footer className="app-sb-foot">v0.1</footer>
      </aside>
    </>
  );
}

const CSS = `
.app-sb {
  width: var(--fc-sidebar-width);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--fc-bg-raised);
  border-right: 1px solid var(--fc-border);
  min-height: 0;
  overflow: hidden;
  transition: width 0.22s ease;
}

.app-sb-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 16px 14px;
  margin: 0 12px;
  border-bottom: 1px solid var(--fc-border);
  text-decoration: none;
  color: inherit;
  outline: none;
}

.app-sb-brand:hover .app-sb-brand-name {
  color: var(--fc-primary-hover);
}

.app-sb-brand:focus-visible {
  box-shadow: var(--fc-focus);
  border-radius: 10px;
}

.app-sb-logo {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  flex-shrink: 0;
  background: linear-gradient(145deg, #fff9e6 0%, #ffe8a3 100%);
  border: 1px solid rgba(234, 179, 8, 0.35);
  box-shadow: 0 2px 12px rgba(234, 179, 8, 0.15);
}

.app-sb-brand-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.app-sb-brand-name {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--fc-primary);
  line-height: 1.15;
  transition: color 0.15s ease;
}

.app-sb-nav {
  flex: 1;
  padding: 14px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  min-height: 0;
}

.app-sb-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  text-decoration: none;
  color: var(--fc-text-secondary);
  border: 1px solid transparent;
  background: transparent;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.app-sb-item:hover:not(.disabled) {
  background: var(--fc-bg-muted);
  color: var(--fc-text);
}

.app-sb-item:focus-visible {
  box-shadow: var(--fc-focus);
}

.app-sb-item.active {
  background: #eef1f8;
  border-color: rgba(36, 104, 242, 0.12);
  color: var(--fc-primary);
  font-weight: 600;
}

.app-sb-item.disabled {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}

.app-sb-ic {
  font-size: 18px;
  line-height: 1;
  width: 26px;
  text-align: center;
  flex-shrink: 0;
}

.app-sb-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  min-width: 0;
  flex: 1;
}

.app-sb-txt {
  font-size: 14px;
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1.25;
}

.app-sb-badge {
  font-size: 10px;
  font-family: var(--fc-font-mono);
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid var(--fc-border);
  background: var(--fc-bg-app);
  color: var(--fc-text-muted);
}

.app-sb-item.active .app-sb-badge {
  border-color: rgba(36, 104, 242, 0.25);
  background: var(--fc-primary-soft);
  color: var(--fc-primary);
}

.app-sb-divider {
  height: 1px;
  margin: 4px 16px 10px;
  background: var(--fc-border);
  flex-shrink: 0;
}

.app-sb-fav {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 14px 8px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--fc-text-secondary);
  text-decoration: none;
  transition: background 0.15s ease, color 0.15s ease;
}

.app-sb-fav:hover {
  background: var(--fc-bg-muted);
  color: var(--fc-text);
}

.app-sb-toggle {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 0;
  padding: 12px 10px;
  border: none;
  border-top: 1px solid var(--fc-border);
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--fc-text-muted);
  font-family: inherit;
  transition: background 0.15s ease, color 0.15s ease;
}

.app-sb-toggle:hover {
  background: var(--fc-bg-muted);
  color: var(--fc-text);
}

.app-sb-toggle:focus-visible {
  box-shadow: var(--fc-focus);
  position: relative;
  z-index: 1;
}

.app-sb-toggle-ic {
  font-size: 18px;
  line-height: 1;
  font-weight: 600;
  opacity: 0.85;
}

.app-sb-foot {
  flex-shrink: 0;
  padding: 10px 18px 16px;
  font-size: 10px;
  font-family: var(--fc-font-mono);
  color: var(--fc-text-dim);
  letter-spacing: 0.06em;
  border-top: 1px solid var(--fc-border);
}

.app-sb.app-sb--compact {
  width: var(--fc-sidebar-rail);
}

.app-sb.app-sb--compact .app-sb-brand-copy,
.app-sb.app-sb--compact .app-sb-copy,
.app-sb.app-sb--compact .app-sb-divider,
.app-sb.app-sb--compact .app-sb-fav-label,
.app-sb.app-sb--compact .app-sb-foot,
.app-sb.app-sb--compact .app-sb-toggle-txt {
  display: none !important;
}

.app-sb.app-sb--compact .app-sb-brand {
  flex-direction: column;
  justify-content: center;
  padding: 16px 8px 12px;
  margin: 0 8px 0;
  gap: 0;
}

.app-sb.app-sb--compact .app-sb-nav {
  padding: 8px 8px 12px;
  align-items: stretch;
}

.app-sb.app-sb--compact .app-sb-item {
  flex-direction: column;
  justify-content: center;
  padding: 12px 8px;
  gap: 0;
}

.app-sb.app-sb--compact .app-sb-ic {
  width: auto;
  font-size: 22px;
}

.app-sb.app-sb--compact .app-sb-fav {
  justify-content: center;
  margin: 0 8px 8px;
  padding: 12px 8px;
  font-size: 0;
  line-height: 0;
}

.app-sb.app-sb--compact .app-sb-fav-ic {
  font-size: 20px;
}

.app-sb.app-sb--compact .app-sb-toggle {
  padding: 14px 8px;
}

.app-sb.app-sb--compact .app-sb-toggle-ic {
  font-size: 22px;
}
`;
