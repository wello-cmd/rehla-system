import { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocation, Link } from 'react-router-dom';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { path: '/',          label: 'Dashboard',      icon: 'space_dashboard',    roles: ['ceo','admin'] },
      { path: '/analytics', label: 'Analytics',       icon: 'monitoring',         roles: ['ceo','admin','accountant'] },
      { path: '/profit-loss',label: 'P&L',            icon: 'trending_up',        roles: ['ceo','admin','accountant'] },
    ],
  },
  {
    label: 'Operations',
    items: [
      { path: '/inventory',       label: 'Inventory',       icon: 'inventory_2',      roles: ['ceo','admin'] },
      { path: '/warehouse/exit',  label: 'Warehouse Exit',  icon: 'barcode_scanner',  roles: ['ceo','admin','worker'] },
      { path: '/warehouse/logs',  label: 'Warehouse Logs',  icon: 'history',           roles: ['ceo','admin','worker'] },
      { path: '/delivery',        label: 'Delivery',         icon: 'local_shipping',   roles: ['ceo','admin','dispatcher','worker'] },
    ],
  },
  {
    label: 'Commerce',
    items: [
      { path: '/shopify',   label: 'Shopify',          icon: 'shopping_bag',       roles: ['ceo','admin'] },
      { path: '/bosta',     label: 'Bosta',            icon: 'deployed_code',      roles: ['ceo','admin','dispatcher'] },
      { path: '/channels',  label: 'Channel Compare',  icon: 'compare_arrows',     roles: ['ceo','admin'] },
      { path: '/returns',   label: 'Returns',          icon: 'assignment_return',  roles: ['ceo','admin','dispatcher'] },
    ],
  },
  {
    label: 'Finance',
    items: [
      { path: '/invoices',  label: 'Invoices',   icon: 'receipt_long', roles: ['ceo','admin','accountant'] },
      { path: '/expenses',  label: 'Expenses',   icon: 'payments',     roles: ['ceo','admin','accountant'] },
    ],
  },
  {
    label: 'Customers',
    items: [
      { path: '/customers', label: 'Customers',  icon: 'contacts',     roles: ['ceo','admin'] },
      { path: '/clients',   label: 'Clients',    icon: 'business',     roles: ['ceo','admin'] },
      { path: '/users',     label: 'Users',      icon: 'people',       roles: ['ceo','admin'] },
    ],
  },
  {
    label: 'Tools',
    items: [
      { path: '/pos', label: 'POS',          icon: 'point_of_sale', roles: ['ceo','admin','worker'] },
      { path: '/ai',  label: 'AI Assistant', icon: 'smart_toy',     roles: ['ceo'] },
    ],
  },
];

// Pastel colours for avatar by initial
const AVATAR_COLORS = ['#6366f1','#3fb950','#f0883e','#58a6ff','#f85149','#a371f7'];
function avatarColor(name) {
  const code = (name?.charCodeAt(0) || 65) - 65;
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

export default function Sidebar({ isOpen, onClose }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (isOpen && onClose) onClose();
  }, [location.pathname]);

  return (
    <>
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} />}

      <aside className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}>

        {/* ── Brand header ── */}
        <div style={{
          padding: '18px 16px',
          borderBottom: '1px solid var(--color-border-light)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <Link to="/" style={{ textDecoration:'none', color:'inherit' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{
                width: 30, height: 30,
                background: 'var(--color-brand)',
                borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize:18, color:'#fff' }}>storefront</span>
              </div>
              <div>
                <p style={{ fontSize:15, fontWeight:800, letterSpacing:'-0.03em', lineHeight:1.1 }}>REHLA</p>
                <p style={{ fontSize:10, color:'var(--color-text-dim)', letterSpacing:'0.04em', textTransform:'uppercase', marginTop:1 }}>Management</p>
              </div>
            </div>
          </Link>
          <button className="sidebar-close-btn" onClick={onClose} aria-label="Close menu">
            <span className="material-symbols-outlined" style={{ fontSize:20 }}>close</span>
          </button>
        </div>

        {/* ── Navigation ── */}
        <nav style={{ flex:1, padding:'8px 8px', overflowY:'auto' }}>
          {NAV_GROUPS.map(group => {
            const visible = group.items.filter(i => i.roles.includes(user?.role));
            if (!visible.length) return null;
            return (
              <div key={group.label}>
                <p className="section-label" style={{ padding:'10px 10px 4px', marginBottom:0 }}>{group.label}</p>
                {visible.map(item => {
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      style={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 9,
                        padding: '8px 10px',
                        marginBottom: 1,
                        borderRadius: 5,
                        textDecoration: 'none',
                        fontSize: 13,
                        fontWeight: isActive ? 600 : 400,
                        color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)',
                        background: isActive ? 'var(--color-brand-dim)' : 'transparent',
                        transition: 'all 0.12s',
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--color-bg-hover)'; e.currentTarget.style.color = 'var(--color-text)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = isActive ? 'var(--color-brand-dim)' : 'transparent'; e.currentTarget.style.color = isActive ? 'var(--color-text)' : 'var(--color-text-muted)'; }}
                    >
                      {isActive && (
                        <span style={{
                          position:'absolute', left:0, top:6, bottom:6,
                          width:3, background:'var(--color-brand)',
                          borderRadius:'0 3px 3px 0',
                        }} />
                      )}
                      <span
                        className="material-symbols-outlined"
                        style={{
                          fontSize: 18,
                          color: isActive ? 'var(--color-brand-hover)' : 'inherit',
                          fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
                          transition: 'color 0.12s',
                        }}
                      >
                        {item.icon}
                      </span>
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* ── User footer ── */}
        <div style={{ padding:'12px 12px', borderTop:'1px solid var(--color-border-light)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
            <div style={{
              width:32, height:32, borderRadius:6,
              background: avatarColor(user?.name),
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:13, fontWeight:700, color:'#fff', flexShrink:0,
            }}>
              {user?.name?.charAt(0)?.toUpperCase() || 'R'}
            </div>
            <div style={{ minWidth:0 }}>
              <p style={{ fontSize:13, fontWeight:600, lineHeight:1.2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.name}</p>
              <p style={{ fontSize:10, color:'var(--color-text-dim)', textTransform:'uppercase', letterSpacing:'0.04em', marginTop:1 }}>{user?.role}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="btn btn-ghost btn-sm"
            style={{ width:'100%', justifyContent:'flex-start', color:'var(--color-text-dim)', fontSize:12 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize:15 }}>logout</span>
            Sign Out
          </button>
        </div>

        {/* ── Status bar ── */}
        <div style={{
          padding:'8px 16px',
          borderTop:'1px solid var(--color-border-light)',
          display:'flex', alignItems:'center', gap:7,
          background:'var(--color-bg)',
        }}>
          <div className="pulse-dot" style={{ background:'var(--color-success)', flexShrink:0 }} />
          <span style={{ fontSize:10, color:'var(--color-text-dim)', fontFamily:'var(--font-mono)', letterSpacing:'0.04em' }}>SYSTEM ONLINE</span>
        </div>
      </aside>
    </>
  );
}
