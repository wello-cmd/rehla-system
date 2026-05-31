import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from 'react-hot-toast';

// Import Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import InventoryPage from './pages/InventoryPage';
import WarehouseExitPage from './pages/WarehouseExitPage';
import DeliveryPage from './pages/DeliveryPage';
import InvoicesPage from './pages/InvoicesPage';
import InvoiceCreatePage from './pages/InvoiceCreatePage';
import ClientsPage from './pages/ClientsPage';
import ExpensesPage from './pages/ExpensesPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ProfitLossPage from './pages/ProfitLossPage';
import PosPage from './pages/PosPage';
import AiPage from './pages/AiPage';
import DriverPage from './pages/DriverPage';

// Protected Route Wrapper
function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
        color: 'var(--color-text)'
      }}>
        <div className="skeleton" style={{ width: '200px', height: '40px' }}></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // If not allowed, redirect to first page they have access to
    if (user.role === 'worker') return <Navigate to="/warehouse/exit" replace />;
    if (user.role === 'driver') return <Navigate to="/login" replace />; // Drivers normally use UUID link
    return <Navigate to="/" replace />;
  }

  return children;
}

function AppContent() {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          className: 'toast-custom',
          style: {
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
          },
        }}
      />
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/driver/:uuid" element={<DriverPage />} />

        {/* Protected Dashboard/CEO/Admin Routes */}
        <Route path="/" element={
          <ProtectedRoute allowedRoles={['ceo', 'admin']}>
            <DashboardPage />
          </ProtectedRoute>
        } />
        
        <Route path="/inventory" element={
          <ProtectedRoute allowedRoles={['ceo', 'admin']}>
            <InventoryPage />
          </ProtectedRoute>
        } />

        <Route path="/warehouse/exit" element={
          <ProtectedRoute allowedRoles={['ceo', 'admin', 'worker']}>
            <WarehouseExitPage />
          </ProtectedRoute>
        } />

        <Route path="/delivery" element={
          <ProtectedRoute allowedRoles={['ceo', 'admin', 'dispatcher']}>
            <DeliveryPage />
          </ProtectedRoute>
        } />

        <Route path="/invoices" element={
          <ProtectedRoute allowedRoles={['ceo', 'admin', 'accountant']}>
            <InvoicesPage />
          </ProtectedRoute>
        } />

        <Route path="/invoices/new" element={
          <ProtectedRoute allowedRoles={['ceo', 'admin']}>
            <InvoiceCreatePage />
          </ProtectedRoute>
        } />

        <Route path="/clients" element={
          <ProtectedRoute allowedRoles={['ceo', 'admin']}>
            <ClientsPage />
          </ProtectedRoute>
        } />

        <Route path="/expenses" element={
          <ProtectedRoute allowedRoles={['ceo', 'admin', 'accountant']}>
            <ExpensesPage />
          </ProtectedRoute>
        } />

        <Route path="/analytics" element={
          <ProtectedRoute allowedRoles={['ceo', 'admin', 'accountant']}>
            <AnalyticsPage />
          </ProtectedRoute>
        } />

        <Route path="/profit-loss" element={
          <ProtectedRoute allowedRoles={['ceo', 'admin', 'accountant']}>
            <ProfitLossPage />
          </ProtectedRoute>
        } />

        <Route path="/pos" element={
          <ProtectedRoute allowedRoles={['ceo', 'admin', 'worker']}>
            <PosPage />
          </ProtectedRoute>
        } />

        <Route path="/ai" element={
          <ProtectedRoute allowedRoles={['ceo']}>
            <AiPage />
          </ProtectedRoute>
        } />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}
