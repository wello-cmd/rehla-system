// Webhook Verification Middleware
// HMAC-SHA256 for Shopify (NFR-SC-02) and Bosta (NFR-SC-03)

const crypto = require('crypto');

function verifyShopifyWebhook(req, res, next) {
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

  if (!hmacHeader || !secret) {
    return res.status(401).json({ error: 'Webhook verification failed: missing HMAC or secret.' });
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    return res.status(400).json({ error: 'Raw body not available for verification.' });
  }

  const generatedHmac = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');

  if (!crypto.timingSafeEqual(Buffer.from(hmacHeader), Buffer.from(generatedHmac))) {
    console.warn('[Webhook] Shopify HMAC verification failed');
    return res.status(401).json({ error: 'Invalid webhook signature.' });
  }

  next();
}

function verifyBostaWebhook(req, res, next) {
  const secret = process.env.BOSTA_WEBHOOK_SECRET;
  const signature = req.headers['x-bosta-signature'] || req.headers['x-webhook-signature'];

  if (!secret) {
    return res.status(401).json({ error: 'Bosta webhook verification failed: missing secret.' });
  }

  if (!signature) {
    return res.status(401).json({ error: 'Missing Bosta webhook signature.' });
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    return res.status(400).json({ error: 'Raw body not available for verification.' });
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    console.warn('[Webhook] Bosta signature verification failed');
    return res.status(401).json({ error: 'Invalid Bosta webhook signature.' });
  }

  next();
}

module.exports = { verifyShopifyWebhook, verifyBostaWebhook };
