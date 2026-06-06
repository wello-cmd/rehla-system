// Sidebar Navigation Component — Mobile-Responsive
import { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocation, Link } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: 'dashboard', roles: ['ceo', 'admin'] },
  { path: '/inventory', label: 'Inventory', icon: 'inventory_2', roles: ['ceo', 'admin'] },
  { path: '/warehouse/exit', label: 'Warehouse Exit', icon: 'barcode_scanner', roles: ['ceo', 'admin', 'worker'] },
  { path: '/warehouse/logs', label: 'Warehouse Logs', icon: 'history', roles: ['ceo', 'admin', 'worker'] },
  { path: '/delivery', label: 'Delivery', icon: 'local_shipping', roles: ['ceo', 'admin', 'dispatcher', 'worker'] },
  { path: '/shopify', label: 'Shopify', icon: 'shopping_bag', roles: ['ceo', 'admin'] },
  { path: '/bosta', label: 'Bosta', icon: 'deployed_code', roles: ['ceo', 'admin', 'dispatcher'] },
  { path: '/channels', label: 'Channel Compare', icon: 'compare_arrows', roles: ['ceo', 'admin'] },
  { path: '/returns', label: 'Returns', icon: 'assignment_return', roles: ['ceo', 'admin', 'dispatcher'] },
  { path: '/invoices', label: 'Invoices', icon: 'receipt_long', roles: ['ceo', 'admin', 'accountant'] },
  { path: '/clients', label: 'Clients', icon: 'business', roles: ['ceo', 'admin'] },
  { path: '/users', label: 'Users', icon: 'people', roles: ['ceo', 'admin'] },
  { path: '/expenses', label: 'Expenses', icon: 'payments', roles: ['ceo', 'admin', 'accountant'] },
  { path: '/analytics', label: 'Analytics', icon: 'monitoring', roles: ['ceo', 'admin', 'accountant'] },
  { path: '/profit-loss', label: 'P&L', icon: 'trending_up', roles: ['ceo', 'admin', 'accountant'] },
  { path: '/pos', label: 'POS', icon: 'point_of_sale', roles: ['ceo', 'admin', 'worker'] },
  { path: '/ai', label: 'AI Assistant', icon: 'smart_toy', roles: ['ceo'] },
];

export default function Sidebar({ isOpen, onClose }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  const visibleItems = NAV_ITEMS.filter(item => item.roles.includes(user?.role));

  // Close sidebar on route change (mobile)
  useEffect(() => {
    if (isOpen && onClose) {
      onClose();
    }
  }, [location.pathname]);

  return (
    <>
      {/* Mobile backdrop overlay */}
      {isOpen && (
        <div
          className="sidebar-backdrop"
          onClick={onClose}
        />
      )}

      <aside className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}>
        {/* Brand Header */}
        <div style={{ padding: '24px 20px', borderBottom: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.04em', textTransform: 'uppercase', lineHeight: 1 }}>
              REHLA
            </h1>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: '4px' }}>
              Management System
            </p>
          </Link>
          {/* Close button — only visible on mobile */}
          <button
            className="sidebar-close-btn"
            onClick={onClose}
            aria-label="Close menu"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>close</span>
          </button>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
          {visibleItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 16px',
                  marginBottom: '2px',
                  borderRadius: '4px',
                  textDecoration: 'none',
                  fontSize: '14px',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)',
                  background: isActive ? 'var(--color-bg-hover)' : 'transparent',
                  transition: 'all 0.15s',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px', fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User Profile Footer */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--color-border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '4px',
              background: 'var(--color-bg-active)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: '14px', fontWeight: 700
            }}>
              {user?.name?.charAt(0) || 'R'}
            </div>
            <div>
              <p style={{ fontSize: '13px', fontWeight: 600, lineHeight: 1.2 }}>{user?.name}</p>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{user?.role}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="btn btn-secondary btn-sm"
            style={{ width: '100%', fontSize: '11px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>logout</span>
            Sign Out
          </button>
        </div>

        {/* System Status */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--color-border-light)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="pulse-dot" style={{ background: 'var(--color-success)' }}></div>
          <span className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>SYS_STATUS: ONLINE</span>
        </div>
      </aside>
    </>
  );
}
