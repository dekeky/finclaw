import { NavLink } from 'react-router-dom';

type Item = {
  to: string;
  label: string;
  icon: string;
  disabled?: boolean;
  badge?: string;
};

const ITEMS: Item[] = [
  { to: '/news', label: '金融资讯', icon: '📰' },
  { to: '/backtest', label: '量化回测', icon: '📈', badge: 'Soon' },
  { to: '/skill', label: 'skill', icon: '🧠', badge: 'Soon' },
  { to: '/settings', label: '设置', icon: '⚙️', badge: 'Soon' },
];

export function AppSidebar() {
  return (
    <>
      <style>{CSS}</style>
      <aside className="app-sb" aria-label="功能栏">
        <div className="app-sb-top">
          <div className="app-sb-logo" aria-hidden>
            F
          </div>
        </div>

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
              <span className="app-sb-txt">{it.label}</span>
              {it.badge && <span className="app-sb-badge">{it.badge}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="app-sb-bottom">
          <div className="app-sb-hint">Finclaw</div>
        </div>
      </aside>
    </>
  );
}

const CSS = `
.app-sb{
  width: 96px;
  flex-shrink: 0;
  display:flex;
  flex-direction:column;
  background: rgba(10,10,13,0.96);
  border-right: 1px solid rgba(255,255,255,0.08);
  min-height: 100vh;
}
.app-sb-top{ padding: 18px 0 10px; display:flex; justify-content:center; }
.app-sb-logo{
  width: 44px; height: 44px; border-radius: 12px;
  display:flex; align-items:center; justify-content:center;
  background: linear-gradient(135deg, #c9a84c 0%, #e8b84a 100%);
  color:#0c0c0e; font-weight:700; font-size: 20px;
  box-shadow: 0 0 20px rgba(201,168,76,0.16);
}
.app-sb-nav{ padding: 10px 10px; display:flex; flex-direction:column; gap: 8px; flex:1; }
.app-sb-item{
  position:relative;
  display:flex; flex-direction:column; align-items:center; gap: 6px;
  padding: 12px 8px;
  border-radius: 14px;
  text-decoration:none;
  color:#a0a0a8;
  border: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.02);
  transition: transform .15s ease, background .15s ease, border-color .15s ease;
}
.app-sb-item:hover{
  transform: translateY(-1px);
  background: rgba(255,255,255,0.04);
  border-color: rgba(201,168,76,0.18);
}
.app-sb-item.active{
  background: rgba(201,168,76,0.12);
  border-color: rgba(201,168,76,0.28);
  color: #e8c96a;
}
.app-sb-ic{ font-size: 20px; line-height: 1; }
.app-sb-txt{ font-size: 11px; font-family: JetBrains Mono, monospace; letter-spacing: .02em; }
.app-sb-badge{
  position:absolute;
  right: 8px;
  top: 8px;
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  color: #7a7a82;
  font-family: JetBrains Mono, monospace;
}
.app-sb-item.active .app-sb-badge{
  border-color: rgba(201,168,76,0.25);
  background: rgba(201,168,76,0.12);
  color:#e8c96a;
}
.app-sb-bottom{ padding: 14px 10px 16px; display:flex; justify-content:center; }
.app-sb-hint{
  font-size: 10px;
  font-family: JetBrains Mono, monospace;
  color:#5a5a5e;
}
@media (max-width: 760px){
  .app-sb{ width: 76px; }
  .app-sb-txt{ display:none; }
  .app-sb-item{ padding: 12px 6px; border-radius: 12px; }
  .app-sb-badge{ right: 6px; top: 6px; }
}
`;

