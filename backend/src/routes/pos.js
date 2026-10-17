const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const operationError = require('../services/operationError');

// One database transaction creates the sale, lines, invoice, stock audit and sync queue.
router.post('/checkout', authenticate, authorize('admin','ceo','worker'), async (req, res) => {
  const { idempotency_key, ...payload } = req.body;
  if (typeof idempotency_key !== 'string' || !idempotency_key.trim() || idempotency_key.length > 128) {
    return res.status(400).json({ error: 'A checkout request key is required.' });
  }
  try {
    const { data, error } = await supabase.rpc('rehla_checkout', {
      p_payload: payload, p_actor: req.user.id, p_request_key: idempotency_key
    });
    if (error) return operationError(res,error);
    res.status(201).json(data);
  } catch (err) { return operationError(res,err); }
});
module.exports = router;
