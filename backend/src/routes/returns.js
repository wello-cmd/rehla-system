// Returns Routes — customer return management
const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const operationError = require('../services/operationError');

// GET /api/returns — list all returns with filters
router.get('/', authenticate, authorize('admin','ceo','dispatcher'), async (req, res) => {
  try {
    const { status, start, end } = req.query;
    let query = supabase
      .from('returns')
      .select('*, orders(order_number, shopify_order_name, customer_name, total)')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (start) query = query.gte('created_at', start);
    if (end) query = query.lte('created_at', `${end}T23:59:59.999Z`);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/returns — create a new return
router.post('/', authenticate, authorize('admin', 'ceo', 'dispatcher'), async (req, res) => {
  const { order_id, customer_name, items, reason, notes } = req.body;
  if (!Array.isArray(items) || !items.length || items.length > 200 || typeof reason !== 'string' || !reason.trim() || items.some(i => !i || !Number.isSafeInteger(Number(i.quantity)) || Number(i.quantity) <= 0 || (!i.variant_id && !i.sku))) {
    return res.status(400).json({ error: 'Items and reason are required.' });
  }
  try {
    const { data, error } = await supabase
      .from('returns')
      .insert({
        order_id: order_id || null,
        customer_name: customer_name || '',
        items,
        reason,
        notes: notes || '',
        handler_name: req.user?.name || '',
        status: 'pending'
      })
      .select().single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/returns/:id/approve — approve a return
router.patch('/:id/approve', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('returns')
      .update({ status: 'approved', handler_name: req.user?.name || '' })
      .eq('id', req.params.id)
      .eq('status','pending')
      .select().maybeSingle();
    if (error) throw error;
    if (!data) return res.status(409).json({error:'Only pending returns can be approved.'});
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/returns/:id/restock — mark restocked and add stock back
router.patch('/:id/restock', authenticate, authorize('admin','ceo'), async (req,res) => {
  try {
    const {data,error} = await supabase.rpc('rehla_restock_return',{p_return_id:req.params.id,p_actor:req.user.id});
    if(error) return operationError(res,error);
    res.json(data);
  } catch(err) { return operationError(res,err); }
});

// POST /api/returns/scan-restock — scan a returned item straight back into main
// stock, recording which delivery method (Bosta / Rehla own-driver) brought it back.
router.post('/scan-restock', authenticate, authorize('admin','ceo','dispatcher','worker'), async(req,res) => {
  const code=String(req.body.sku || req.body.barcode || '').trim().toUpperCase();
  const qty=req.body.quantity === undefined ? 1 : Number(req.body.quantity);
  const method=req.body.delivery_method;
  if(!code || req.body.quantity===null || req.body.quantity==='' || !Number.isSafeInteger(qty) || qty<=0 || !['bosta','own_driver'].includes(method)) {
    return res.status(400).json({error:'SKU, a positive integer quantity and a valid delivery method are required.'});
  }
  try {
    let variant;
    for(const column of ['sku','barcode']) {
      const {data,error}=await supabase.from('product_variants').select('id').eq(column,code).maybeSingle();
      if(error) throw error;
      if(data) {variant=data;break;}
    }
    if(!variant) return res.status(404).json({error:'Product not found.'});
    const {data,error}=await supabase.rpc('rehla_stock_move',{
      p_variant_id:variant.id,p_delta:qty,p_actor:req.user.id,p_event:'return',p_notes:`Return scan via ${method}`,
      p_order_id:null,p_request_key:req.body.idempotency_key || null
    });
    if(error) return operationError(res,error);
    res.json({success:true,item:{...data,quantity_returned:qty,delivery_method:method}});
  } catch(err) { return operationError(res,err); }
});

// PATCH /api/returns/:id/refund — mark as refunded
router.patch('/:id/refund', authenticate, authorize('admin','ceo'), async(req,res) => {
  try {
    const {data,error}=await supabase.rpc('rehla_refund_return',{p_return_id:req.params.id,p_actor:req.user.id});
    if(error) return operationError(res,error);
    res.json(data);
  } catch(err) { return operationError(res,err); }
});

module.exports = router;
