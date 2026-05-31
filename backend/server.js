// =============================================
// REHLA MANAGEMENT SYSTEM — Express API Server
// Version 2.0 — Full SRS v1.0 Compliance
// Stack: Node.js + Express + Supabase PostgreSQL
// =============================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

// Route modules
const authRoutes = require('./src/routes/auth');
const inventoryRoutes = require('./src/routes/inventory');
const warehouseRoutes = require('./src/routes/warehouses');
const orderRoutes = require('./src/routes/orders');
const deliveryRoutes = require('./src/routes/deliveries');
const driverRoutes = require('./src/routes/drivers');
const expenseRoutes = require('./src/routes/expenses');
const invoiceRoutes = require('./src/routes/invoices');
const clientRoutes = require('./src/routes/clients');
const analyticsRoutes = require('./src/routes/analytics');
const financialRoutes = require('./src/routes/financial');
const posRoutes = require('./src/routes/pos');
const shopifyRoutes = require('./src/routes/shopify');
const bostaRoutes = require('./src/routes/bosta');
const aiRoutes = require('./src/routes/ai');

// Services
const { startCronJobs } = require('./src/services/cronJobs');

const app = express();
const PORT = process.env.PORT || 5000;

// =============================================
// MIDDLEWARE
// =============================================

// CORS (NFR-SC-04)
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// CSP Middleware
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' https://*.supabase.co https://fonts.googleapis.com https://fonts.gstatic.com data:; " +
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "connect-src 'self' https://*.supabase.co https://app.bosta.co https://rehlaeg.online; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https://*.supabase.co https://images.unsplash.com;"
  );
  next();
});

// Raw body capture for webhook HMAC verification (NFR-SC-02, NFR-SC-03)
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// Serve frontend static build
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// =============================================
// API ROUTES
// =============================================

app.use('/api/auth', authRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/warehouses', warehouseRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/financial', financialRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/shopify', shopifyRoutes);
app.use('/api/bosta', bostaRoutes);
app.use('/api/ai', aiRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'operational',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    supabase: !!process.env.SUPABASE_URL,
    shopify: !!process.env.SHOPIFY_ACCESS_TOKEN,
    bosta: !!process.env.BOSTA_API_KEY
  });
});

// SPA fallback — serve React index.html for non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  }
});

// =============================================
// ERROR HANDLING
// =============================================

app.use((err, req, res, next) => {
  console.error('[Server Error]', err.stack);
  res.status(500).json({ error: 'Internal server error.' });
});

// =============================================
// START SERVER
// =============================================

app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   REHLA MANAGEMENT SYSTEM v2.0           ║');
  console.log('║   Server running on port ' + PORT + '             ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
  console.log(`[Config] Supabase: ${process.env.SUPABASE_URL ? '✓ Connected' : '✗ Not configured'}`);
  console.log(`[Config] Shopify:  ${process.env.SHOPIFY_ACCESS_TOKEN ? '✓ Connected' : '✗ Not configured'}`);
  console.log(`[Config] Bosta:    ${process.env.BOSTA_API_KEY ? '✓ Connected' : '✗ Not configured'}`);
  console.log('');

  // Start cron jobs (FR-SH-01: 30-min sync, FR-IV-06: daily overdue check)
  startCronJobs();
});

module.exports = app;
