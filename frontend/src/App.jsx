import useLanguage from './i18n/useLanguage';
import { translate } from './i18n/index.js';
import { lazy, Suspense } from 'react';
import { getRoleLandingPath, INVOICE_CREATE_ROLES } from './lib/roles';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from 'react-hot-toast';

// Import Pages
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const InventoryPage = lazy(() => import('./pages/InventoryPage'));
const WarehouseExitPage = lazy(() => import('./pages/WarehouseExitPage'));
const StockLookupPage = lazy(() => import('./pages/StockLookupPage'));
const DeliveryPage = lazy(() => import('./pages/DeliveryPage'));
const InvoicesPage = lazy(() => import('./pages/InvoicesPage'));
const InvoiceCreatePage = lazy(() => import('./pages/InvoiceCreatePage'));
const ClientsPage = lazy(() => import('./pages/ClientsPage'));
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const ProfitLossPage = lazy(() => import('./pages/ProfitLossPage'));
const PosPage = lazy(() => import('./pages/PosPage'));
const AiPage = lazy(() => import('./pages/AiPage'));
const DriverPage = lazy(() => import('./pages/DriverPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const WarehouseLogsPage = lazy(() => import('./pages/WarehouseLogsPage'));
const FinancialDashboardPage = lazy(() => import('./pages/FinancialDashboardPage'));
const ShopifyPage = lazy(() => import('./pages/ShopifyPage'));
const BostaPage = lazy(() => import('./pages/BostaPage'));
const ChannelsPage = lazy(() => import('./pages/ChannelsPage'));
const ReturnsPage = lazy(() => import('./pages/ReturnsPage'));
const CustomersPage = lazy(() => import('./pages/CustomersPage'));

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
    return <Navigate to={getRoleLandingPath(user.role)} replace />;
  }

  return children;
}

function ForbiddenPage() {
  const { logout } = useAuth();
  return (
    <main style={{ maxWidth: 520, margin: '15vh auto', padding: 24 }}>
      <h1>{translate("Access unavailable")}</h1>
      <p style={{ margin: '16px 0' }}>{translate("Your account does not have access to this workspace. Contact your administrator for help. Drivers should use their delivery link.")}</p>
      <button className="btn btn-secondary" onClick={logout}>{translate("Sign out")}</button>
    </main>
  );
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
      <Suspense fallback={<div role="status" style={{ padding: 32 }}>{translate("Loading page…")}</div>}>
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

        <Route path="/stock-lookup" element={
          <ProtectedRoute allowedRoles={['ceo', 'admin', 'worker', 'dispatcher']}>
            <StockLookupPage />
          </ProtectedRoute>
        } />

        <Route path="/delivery" element={
          <ProtectedRoute allowedRoles={['ceo', 'admin', 'dispatcher', 'worker']}>
            <DeliveryPage />
          </ProtectedRoute>
        } />

        <Route path="/invoices" element={
          <ProtectedRoute allowedRoles={['ceo', 'admin', 'accountant']}>
            <InvoicesPage />
          </ProtectedRoute>
        } />

        <Route path="/invoices/new" element={
          <ProtectedRoute allowedRoles={INVOICE_CREATE_ROLES}>
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

        <Route path="/finance-dashboard" element={
          <ProtectedRoute allowedRoles={['ceo', 'admin', 'accountant']}>
            <FinancialDashboardPage />
          </ProtectedRoute>
        } />

        <Route path="/users" element={
          <ProtectedRoute allowedRoles={['ceo', 'admin']}>
            <UsersPage />
          </ProtectedRoute>
        } />

        <Route path="/warehouse/logs" element={
          <ProtectedRoute allowedRoles={['ceo', 'admin', 'worker']}>
            <WarehouseLogsPage />
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

        <Route path="/shopify" element={
          <ProtectedRoute allowedRoles={['ceo', 'admin']}>
            <ShopifyPage />
          </ProtectedRoute>
        } />

        <Route path="/bosta" element={
          <ProtectedRoute allowedRoles={['ceo', 'admin', 'dispatcher']}>
            <BostaPage />
          </ProtectedRoute>
        } />

        <Route path="/channels" element={
          <ProtectedRoute allowedRoles={['ceo', 'admin']}>
            <ChannelsPage />
          </ProtectedRoute>
        } />

        <Route path="/returns" element={
          <ProtectedRoute allowedRoles={['ceo', 'admin', 'dispatcher']}>
            <ReturnsPage />
          </ProtectedRoute>
        } />

        <Route path="/customers" element={
          <ProtectedRoute allowedRoles={['ceo', 'admin']}>
            <CustomersPage />
          </ProtectedRoute>
        } />

        <Route path="/forbidden" element={
          <ProtectedRoute><ForbiddenPage /></ProtectedRoute>
        } />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </>
  );
}

export default function App() {
  useLanguage();
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}
