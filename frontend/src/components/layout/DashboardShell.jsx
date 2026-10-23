import { translate } from '../../i18n/index.js';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getPageParent } from '../../lib/navigation';
import Sidebar from './Sidebar';
import { Toaster } from 'react-hot-toast';

export default function DashboardShell({ children, title, subtitle, actions }) {
  const {pathname} = useLocation();
  const parent = getPageParent(pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#main-content">{translate("Skip to content")}</a>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main id="main-content" tabIndex={-1} className="main-content">
        {/* Mobile header */}
        <div className="mobile-header">
          <button
            className="hamburger-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label={translate("Open menu")}
            aria-expanded={sidebarOpen}
            aria-controls="primary-navigation"
          >
            <span className="material-symbols-outlined" style={{ fontSize:22 }}>menu</span>
          </button>
          <span style={{ fontSize:16, fontWeight:800, letterSpacing:'-0.03em', textTransform:'uppercase' }}>
            REHLA
          </span>
          <div style={{ width:40 }} />
        </div>

        <div className="workspace-bar">
          <p>{translate("Workspace")} <span aria-hidden="true">/</span> {parent && <><Link to={parent.path}>{translate(parent.label)}</Link><span aria-hidden="true">/</span></>}<strong>{title === 'Business overview' ? translate("Overview") : title || translate("Rehla")}</strong></p>
          <span className="workspace-currency">{translate("EGP")} <span className="material-symbols-outlined" aria-hidden="true">language</span></span>
        </div>

        {/* Page header */}
        {title && (
          <div
            className="page-title-wrap"
            style={{
              display:'flex', justifyContent:'space-between', alignItems:'flex-start',
              marginBottom:24, gap:16, flexWrap:'wrap',
            }}
          >
            <div>
              <h1 className="page-heading">{translate(title)}</h1>
              {subtitle && (
                <p style={{ fontSize:13, color:'var(--color-text-muted)', marginTop:4 }}>{translate(subtitle)}</p>
              )}
            </div>
            {actions && (
              <div style={{ display:'flex', gap:8, flexShrink:0, flexWrap:'wrap' }}>
                {actions}
              </div>
            )}
          </div>
        )}

        {children}
      </main>

      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            borderRadius: '6px',
            boxShadow: 'var(--shadow-lg)',
          },
          success: { iconTheme: { primary: 'var(--color-success)', secondary: 'var(--color-bg-elevated)' } },
          error:   { iconTheme: { primary: 'var(--color-error)', secondary: 'var(--color-bg-elevated)' } },
        }}
      />
    </div>
  );
}
