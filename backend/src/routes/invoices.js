// Invoice Routes — FR-IV-01 through FR-IV-10
const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { FINANCE_ROLES } = require('../utils/permissions');
const { generateInvoicePDF } = require('../services/pdfGenerator');

// GET /api/invoices — List all invoices
router.get('/', authenticate, authorize(...FINANCE_ROLES), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*, clients(company_name, contact_person)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invoices/summary — Dashboard summary (FR-IV-10)
router.get('/summary', authenticate, authorize(...FINANCE_ROLES), async (req, res) => {
  try {
    const { data: invoices } = await supabase.from('invoices').select('total, status');

    const summary = {
      total_invoiced: 0,
      total_paid: 0,
      total_outstanding: 0,
      total_overdue: 0
    };

    for (const inv of invoices || []) {
      const amount = Number(inv.total);
      summary.total_invoiced += amount;
      if (inv.status === 'Paid') summary.total_paid += amount;
      if (inv.status === 'Sent' || inv.status === 'Draft') summary.total_outstanding += amount;
      if (inv.status === 'Overdue') summary.total_overdue += amount;
    }

    // Outstanding includes overdue
    summary.total_outstanding += summary.total_overdue;

    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Map known database validation failures without exposing infrastructure as a 400.
function invoiceErrorStatus(error) {
  if (error.code === 'P0002') return 404;
  if (error.code === '42501') return 403;
  if (error.code?.startsWith('22') || ['23502', '23503', '23514'].includes(error.code)) return 400;
  return 500;
}

// POST /api/invoices — Header, lines and number allocation commit together.
router.post('/', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  const { client_id, customer_name, customer_email, issue_date, due_date, notes, items } = req.body;
  if (typeof customer_name !== 'string' || !customer_name.trim()) {
    return res.status(400).json({ error: 'Customer name is required.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one invoice item is required.' });
  }
  try {
    const { data, error } = await supabase.rpc('rehla_create_invoice', {
      p_payload: { client_id, customer_name, customer_email, issue_date, due_date, notes, items },
      p_actor: req.user.id
    });
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(invoiceErrorStatus(err)).json({ error: err.message });
  }
});

// GET /api/invoices/:id — Get invoice with items
router.get('/:id', authenticate, authorize(...FINANCE_ROLES), async (req, res) => {
  try {
    const { data: invoice, error: invoiceErr } = await supabase
      .from('invoices')
      .select('*, clients(*)')
      .eq('id', req.params.id)
      .maybeSingle();

    if (invoiceErr) throw invoiceErr;
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });

    const { data: items } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', req.params.id)
      .order('id');

    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .eq('invoice_id', req.params.id)
      .order('paid_at', { ascending: false });

    res.json({ ...invoice, items: items || [], payments: payments || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/invoices/:id/status — Paid requires recorded payment coverage.
router.put('/:id/status', authenticate, authorize(...FINANCE_ROLES), async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['Draft', 'Sent', 'Paid', 'Overdue'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be: ${validStatuses.join(', ')}` });
  }
  try {
    const { data, error } = await supabase.rpc('rehla_set_invoice_status', {
      p_invoice_id: req.params.id, p_status: status, p_actor: req.user.id
    });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(invoiceErrorStatus(err)).json({ error: err.message });
  }
});

// POST /api/invoices/flag-overdue — Auto-flag overdue invoices (FR-IV-06)
router.post('/flag-overdue', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('invoices')
      .update({ status: 'Overdue' })
      .lt('due_date', today)
      .not('status', 'in', '("Paid","Overdue")')
      .select();

    if (error) throw error;
    res.json({ success: true, flagged: data?.length || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invoices/:id/pdf — Generate branded PDF (FR-IV-07, FR-IV-08)
router.get('/:id/pdf', authenticate, authorize(...FINANCE_ROLES), async (req, res) => {
  try {
    const { data: invoice, error: invoiceErr } = await supabase
      .from('invoices')
      .select('*, clients(*)')
      .eq('id', req.params.id)
      .maybeSingle();

    if (invoiceErr) throw invoiceErr;
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });

    const { data: items } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', req.params.id);

    const pdf = await generateInvoicePDF(invoice, items || [], invoice.clients);

    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="${invoice.invoice_number}.pdf"`);
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/invoices/:id/payments — Payment and balance status are one transaction.
router.post('/:id/payments', authenticate, authorize(...FINANCE_ROLES), async (req, res) => {
  const { amount, payment_method } = req.body;
  const validMethods = ['Cash', 'Bank Transfer', 'Instalment'];
  const numericAmount = (typeof amount === 'number' || (typeof amount === 'string' && amount.trim())) ? Number(amount) : NaN;
  if (!Number.isFinite(numericAmount) || Math.round(numericAmount * 100) <= 0) {
    return res.status(400).json({ error: 'Amount must be a finite positive number of at least 0.01.' });
  }
  if (!validMethods.includes(payment_method)) {
    return res.status(400).json({ error: `Invalid method. Must be: ${validMethods.join(', ')}` });
  }
  try {
    const { data, error } = await supabase.rpc('rehla_record_payment', {
      p_invoice_id: req.params.id, p_amount: numericAmount, p_method: payment_method, p_actor: req.user.id
    });
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(invoiceErrorStatus(err)).json({ error: err.message });
  }
});

module.exports = router;
