import LanguageToggle from '../ui/LanguageToggle';
import { translate } from '../../i18n/index.js';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocation, Link } from 'react-router-dom';
import { isNavigationActive } from '../../lib/navigation';
import ThemeToggle from '../ui/ThemeToggle';

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
      { path: '/stock-lookup',    label: 'Stock Lookup',    icon: 'search',           roles: ['ceo','admin','worker','dispatcher'] },
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

export default function Sidebar({ isOpen, onClose }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const sidebarRef = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches);
  const [apiStatus, setApiStatus] = useState('Checking API…');

  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)');
    const update = () => { setMobile(media.matches); if (!media.matches) closeRef.current?.(); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    let active = true;
    let controller;
    async function check() {
      controller?.abort();
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch('/api/health', { signal:controller.signal, cache:'no-store' });
        const data = await response.json();
        if (active) setApiStatus(response.ok && data.status === 'operational' ? 'API reachable' : 'API unavailable');
      } catch { if (active) setApiStatus(navigator.onLine ? 'API unavailable' : 'Offline'); }
      finally { clearTimeout(timeout); }
    }
    check();
    const interval = setInterval(check, 60000);
    window.addEventListener('online', check);
    window.addEventListener('offline', check);
    return () => { active = false; controller?.abort(); clearInterval(interval); window.removeEventListener('online', check); window.removeEventListener('offline', check); };
  }, []);

  useEffect(() => {
    if (!mobile || !isOpen) return;
    const opener = document.activeElement;
    const sidebar = sidebarRef.current;
    const main = document.getElementById('main-content');
    const previousOverflow = document.body.style.overflow;
    if (main) main.inert = true;
    document.body.style.overflow = 'hidden';
    sidebar.querySelector('.sidebar-close-btn')?.focus();
    function keydown(event) {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current?.(); }
      if (event.key !== 'Tab') return;
      const controls = [...sidebar.querySelectorAll('a[href],button')].filter(el => !el.disabled && el.getClientRects().length);
      const first = controls[0]; const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', keydown);
    return () => {
      if (main) main.inert = false;
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keydown);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [mobile, isOpen]);

  useEffect(() => {
    closeRef.current?.();
  }, [location.pathname]);

  return (
    <>
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} />}
      <aside id="primary-navigation" ref={sidebarRef} aria-label={translate("Main navigation")} inert={mobile && !isOpen} role={mobile && isOpen ? 'dialog' : undefined} aria-modal={mobile && isOpen ? true : undefined} className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar-brand">
          <Link to="/" className="brand-lockup" aria-label={translate("Rehla workspace")}>
            <span className="brand-name">REHLA <span className="brand-mark" aria-hidden="true"><span className="material-symbols-outlined">route</span></span></span>
            <span className="brand-caption">{translate("Management workspace")}</span>
          </Link>
          <button className="sidebar-close-btn" onClick={onClose} aria-label={translate("Close menu")}><span className="material-symbols-outlined">close</span></button>
        </div>
        <nav aria-label={translate("Main")} className="sidebar-nav">
          {NAV_GROUPS.map(group => {
            const visible = group.items.filter(i => i.roles.includes(user?.role));
            return visible.length ? <div className="nav-group" key={group.label}>
              <p className="nav-group-label">{translate(group.label)}</p>
              {visible.map(item => <Link key={item.path} to={item.path} aria-current={isNavigationActive(item.path, location.pathname) ? 'page' : undefined} className="nav-link">
                <span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span><span>{translate(item.label)}</span>
              </Link>)}
            </div> : null;
          })}
        </nav>
        <div className="sidebar-footer">
          <LanguageToggle />
          <ThemeToggle />
          <div className="sidebar-profile">
            <span className="profile-avatar" aria-hidden="true">{user?.name?.charAt(0)?.toUpperCase() || 'R'}</span>
            <div><p>{user?.name}</p><span>{translate(user?.role)}</span></div>
            <button onClick={logout} className="sidebar-signout" aria-label={translate("Sign out")} title={translate("Sign out")}><span className="material-symbols-outlined">logout</span></button>
          </div>
          <p className="sidebar-status"><span aria-hidden="true" className={apiStatus === 'API reachable' ? 'status-dot is-reachable' : 'status-dot'} />{translate(apiStatus)}</p>
        </div>
      </aside>
    </>
  );
}
