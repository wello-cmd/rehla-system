// Dashboard Shell — Layout wrapper with sidebar
import Sidebar from './Sidebar';
import { Toaster } from 'react-hot-toast';

export default function DashboardShell({ children, title }) {
  return (
    <div style={{ display: 'flex' }}>
      <Sidebar />
      <main className="main-content">
        {title && (
          <div style={{ marginBottom: '32px' }}>
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
