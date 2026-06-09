import { useState } from 'react';
import Sidebar from './Sidebar';
import { Toaster } from 'react-hot-toast';

export default function DashboardShell({ children, title, subtitle, actions }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div style={{ display:'flex' }}>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="main-content">
        {/* Mobile header */}
        <div className="mobile-header">
          <button
            className="hamburger-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <span className="material-symbols-outlined" style={{ fontSize:22 }}>menu</span>
          </button>
          <span style={{ fontSize:16, fontWeight:800, letterSpacing:'-0.03em', textTransform:'uppercase' }}>
            REHLA
          </span>
          <div style={{ width:40 }} />
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
              <h1 style={{ fontSize:22, fontWeight:700, letterSpacing:'-0.02em', lineHeight:1.2 }}>{title}</h1>
              {subtitle && (
                <p style={{ fontSize:13, color:'var(--color-text-muted)', marginTop:4 }}>{subtitle}</p>
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
            background: '#1e1e1e',
            color: '#ede9e8',
            border: '1px solid #333030',
            fontFamily: 'Inter, sans-serif',
            fontSize: '13px',
            borderRadius: '6px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          },
          success: { iconTheme: { primary: '#3fb950', secondary: '#1e1e1e' } },
          error:   { iconTheme: { primary: '#f85149', secondary: '#1e1e1e' } },
        }}
      />
    </div>
  );
}
