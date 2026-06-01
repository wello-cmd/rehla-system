// Dashboard Shell — Layout wrapper with sidebar + mobile header
import { useState } from 'react';
import Sidebar from './Sidebar';
import { Toaster } from 'react-hot-toast';

export default function DashboardShell({ children, title }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="main-content">
        {/* Mobile Header Bar */}
        <div className="mobile-header">
          <button
            className="hamburger-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>menu</span>
          </button>
          <h1 style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.03em', textTransform: 'uppercase' }}>
            REHLA
          </h1>
          <div style={{ width: '40px' }}></div> {/* Spacer for centering */}
        </div>

        {title && (
          <div style={{ marginBottom: '32px' }} className="page-title-wrap">
            <h1 className="text-headline">{title}</h1>
          </div>
        )}
        {children}
      </main>

      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#2a2a2a',
            color: '#e5e2e1',
            border: '1px solid #4c4546',
            fontFamily: 'Inter, sans-serif',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#4caf50', secondary: '#2a2a2a' } },
          error: { iconTheme: { primary: '#ef5350', secondary: '#2a2a2a' } },
        }}
      />
    </div>
  );
}
