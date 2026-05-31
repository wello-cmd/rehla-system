// Invoice Routes — FR-IV-01 through FR-IV-10
const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { generateInvoicePDF } = require('../services/pdfGenerator');

// GET /api/invoices — List all invoices
router.get('/', authenticate, async (req, res) => {
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
router.get('/summary', authenticate, async (req, res) => {
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

// POST /api/invoices — Create invoice with auto-number (FR-IV-02, FR-IV-03)
router.post('/', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  const { client_id, customer_name, customer_email, issue_date, due_date, notes, items } = req.body;

  if (!customer_name) {
    return res.status(400).json({ error: 'Customer name is required.' });
  }

  try {
    // FR-IV-03: Auto-generate invoice number INV-YYYY-XXXX
    const year = new Date().getFullYear();
    const { data: lastInvoice } = await supabase
      .from('invoices')
      .select('invoice_number')
      .like('invoice_number', `INV-${year}-%`)
      .order('invoice_number', { ascending: false })
      .limit(1)
      .single();

    let nextNum = 1;
    if (lastInvoice) {
      const parts = lastInvoice.invoice_number.split('-');
      nextNum = parseInt(parts[2]) + 1;
    }
    const invoiceNumber = `INV-${year}-${String(nextNum).padStart(4, '0')}`;

    // Calculate totals from items
    let subtotal = 0;
    const lineItems = items || [];
    for (const item of lineItems) {
      item.subtotal = item.quantity * item.unit_price;
      subtotal += item.subtotal;
    }

    // Insert invoice
    const { data: invoice, error } = await supabase
      .from('invoices')
      .insert({
        client_id: client_id || null,
        invoice_number: invoiceNumber,
        customer_name,
        customer_email: customer_email || '',
        issue_date: issue_date || new Date().toISOString().split('T')[0],
        due_date: due_date || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
        subtotal,
        total: subtotal,
        notes: notes || '',
        status: 'Draft'
      })
      .select()
      .single();

    if (error) throw error;

    // FR-IV-04: Insert line items
    if (lineItems.length > 0) {
      const itemsToInsert = lineItems.map(item => ({
        invoice_id: invoice.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.subtotal
      }));

      await supabase.from('invoice_items').insert(itemsToInsert);
    }

    res.status(201).json({ ...invoice, items: lineItems });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invoices/:id — Get invoice with items
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { data: invoice } = await supabase
      .from('invoices')
      .select('*, clients(*)')
      .eq('id', req.params.id)
      .single();

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

// PUT /api/invoices/:id/status — Update status (FR-IV-05)
router.put('/:id/status', authenticate, async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['Draft', 'Sent', 'Paid', 'Overdue'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be: ${validStatuses.join(', ')}` });
  }

  try {
    const { error } = await supabase
      .from('invoices')
      .update({ status })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
router.get('/:id/pdf', authenticate, async (req, res) => {
  try {
    const { data: invoice } = await supabase
      .from('invoices')
      .select('*, clients(*)')
      .eq('id', req.params.id)
      .single();

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

// POST /api/invoices/:id/payments — Record payment (FR-IV-09)
router.post('/:id/payments', authenticate, authorize('admin', 'ceo', 'accountant'), async (req, res) => {
  const { amount, payment_method } = req.body;
  const validMethods = ['Cash', 'Bank Transfer', 'Instalment'];

  if (!amount || !payment_method) {
    return res.status(400).json({ error: 'Amount and payment_method required.' });
  }
  if (!validMethods.includes(payment_method)) {
    return res.status(400).json({ error: `Invalid method. Must be: ${validMethods.join(', ')}` });
  }

  try {
    const { data, error } = await supabase
      .from('payments')
      .insert({
        invoice_id: req.params.id,
        amount,
        payment_method
      })
      .select()
      .single();

    if (error) throw error;

    // Check if fully paid
    const { data: allPayments } = await supabase
      .from('payments')
      .select('amount')
      .eq('invoice_id', req.params.id);

    const { data: invoice } = await supabase
      .from('invoices')
      .select('total')
      .eq('id', req.params.id)
      .single();

    const totalPaid = (allPayments || []).reduce((s, p) => s + Number(p.amount), 0);
    if (totalPaid >= Number(invoice.total)) {
      await supabase.from('invoices').update({ status: 'Paid' }).eq('id', req.params.id);
    }

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
