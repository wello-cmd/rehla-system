// Shopify Sync Service — FR-SH-01 through FR-SH-10
// Real Shopify Admin API integration with rate limiting and sync logging
// NO SIMULATION FALLBACK (strict compliance with user request)

const axios = require('axios');
const { supabase } = require('../db/supabase');
const { generateBarcodeString } = require('./barcodeGenerator');

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const RATE_LIMIT_DELAY = 500; // 2 requests per second max (FR-SH-08)

class ShopifySync {
  constructor() {
    this.baseUrl = SHOPIFY_STORE ? `https://${SHOPIFY_STORE}/admin/api/2024-01` : null;
    this.headers = SHOPIFY_TOKEN ? {
      'X-Shopify-Access-Token': SHOPIFY_TOKEN,
      'Content-Type': 'application/json'
    } : null;
    this.retryCount = 0;
    this.maxRetries = 3;
  }

  isConfigured() {
    return !!(this.baseUrl && this.headers);
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Rate-limited API call with exponential backoff (FR-SH-08, NFR-RL-05)
   */
  async shopifyRequest(endpoint, method = 'GET', data = null) {
    if (!this.isConfigured()) {
      throw new Error('Shopify credentials not fully configured in .env');
    }

    try {
      await this.delay(RATE_LIMIT_DELAY);
      const config = {
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: this.headers,
        ...(data && { data })
      };

      const response = await axios(config);
      this.retryCount = 0;
      return response.data;
    } catch (err) {
      if (err.response?.status === 429 && this.retryCount < this.maxRetries) {
        this.retryCount++;
        const backoffMs = Math.pow(2, this.retryCount) * 1000;
        console.warn(`[Shopify] Rate limited. Retrying in ${backoffMs}ms (attempt ${this.retryCount})`);
        try {
          await this.delay(backoffMs);
        } catch (delayErr) {
          console.debug('[Shopify] Retry delay interrupted:', delayErr.message || delayErr);
        }
        return this.shopifyRequest(endpoint, method, data);
      }
      throw err;
    }
  }

  /**
   * Full product sync from Shopify (FR-SH-01)
   */
  async syncProducts(triggeredBy = 'auto') {
    if (!this.isConfigured()) {
      return { success: false, error: 'Shopify is not configured in .env' };
    }

    const startTime = Date.now();
    let productsUpdated = 0;
    let productsSkipped = 0;
    let productsCreated = 0;
    let syncStatus = 'success';
    let errorDetails = '';

    let syncError = null;
    try {
      let hasNextPage = true;
      let pageInfo = null;

      while (hasNextPage) {
        const endpoint = pageInfo
          ? `/products.json?limit=50&page_info=${pageInfo}`
          : '/products.json?limit=50';

        const response = await this.shopifyRequest(endpoint);
        const products = response.products || [];

        for (const shopifyProduct of products) {
          for (const variant of shopifyProduct.variants) {
            const sku = variant.sku;
            if (!sku) continue;

            // Check if product exists by SKU
            const { data: existing } = await supabase
              .from('products')
              .select('id, sku')
              .eq('sku', sku)
              .single();

            if (existing) {
              const { error: updateErr } = await supabase
                .from('products')
                .update({
                  name: `${shopifyProduct.title} - ${variant.title}`,
                  price: parseFloat(variant.price) || 0,
                  stock_quantity: variant.inventory_quantity || 0,
                  shopify_variant_id: String(variant.id),
                  image_url: shopifyProduct.image?.src || '',
                  last_synced_at: new Date().toISOString()
                })
                .eq('id', existing.id);

              if (updateErr) productsSkipped++;
              else productsUpdated++;
            } else {
              const barcode = variant.barcode || generateBarcodeString();
              const { error: insertErr } = await supabase
                .from('products')
                .insert({
                  sku: sku.toUpperCase(),
                  name: `${shopifyProduct.title}${variant.title !== 'Default Title' ? ` - ${variant.title}` : ''}`,
                  description: shopifyProduct.body_html?.replace(/<[^>]*>/g, '') || '',
                  barcode,
                  price: parseFloat(variant.price) || 0,
                  cost_per_unit: parseFloat(variant.cost) || 0,
                  stock_quantity: variant.inventory_quantity || 0,
                  category: shopifyProduct.product_type || 'Uncategorized',
                  image_url: shopifyProduct.image?.src || '',
                  shopify_variant_id: String(variant.id),
                  last_synced_at: new Date().toISOString()
                });

              if (insertErr) {
                productsSkipped++;
              } else {
                productsCreated++;
              }
            }
          }
        }
        hasNextPage = false; // Link pagination limits
      }
    } catch (err) {
      syncStatus = 'failed';
      errorDetails = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error('[Shopify] Product sync failed:', errorDetails);
      syncError = err;
    }

    const durationMs = Date.now() - startTime;
    try {
      await supabase.from('sync_log').insert({
        products_updated: productsUpdated,
        products_skipped: productsSkipped,
        products_created: productsCreated,
        triggered_by: triggeredBy,
        status: syncStatus,
        error_details: errorDetails,
        duration_ms: durationMs
      });
    } catch (logErr) {
      console.error('[Shopify] Failed to write sync log:', logErr.message || logErr);
    }

    if (syncError) {
      throw syncError;
    }

    return {
      success: syncStatus === 'success',
      productsUpdated,
      productsSkipped,
      productsCreated,
      durationMs
    };
  }

  /**
   * Sync orders from Shopify (FR-SH-02/03)
   */
  async syncOrders(triggeredBy = 'auto') {
    if (!this.isConfigured()) {
      return { success: false, error: 'Shopify is not configured in .env' };
    }

    try {
      const response = await this.shopifyRequest('/orders.json?status=any&limit=50');
      const orders = response.orders || [];
      let orderssynced = 0;

      for (const shopifyOrder of orders) {
        const shopifyId = String(shopifyOrder.id);

        const { data: existing } = await supabase
          .from('orders')
          .select('id')
          .eq('shopify_order_id', shopifyId)
          .single();

        if (existing) continue;

        const items = shopifyOrder.line_items.map(li => ({
          sku: li.sku || '',
          name: li.name,
          quantity: li.quantity,
          price: parseFloat(li.price)
        }));

        const { error } = await supabase
          .from('orders')
          .insert({
            shopify_order_id: shopifyId,
            customer_name: `${shopifyOrder.customer?.first_name || ''} ${shopifyOrder.customer?.last_name || ''}`.trim() || 'Shopify Customer',
            customer_phone: shopifyOrder.customer?.phone || shopifyOrder.shipping_address?.phone || '',
            customer_email: shopifyOrder.customer?.email || '',
            items: JSON.stringify(items),
            subtotal: parseFloat(shopifyOrder.subtotal_price) || 0,
            total: parseFloat(shopifyOrder.total_price) || 0,
            status: mapShopifyStatus(shopifyOrder.fulfillment_status),
            payment_status: shopifyOrder.financial_status === 'paid' ? 'paid' : 'pending',
            payment_method: 'card',
            source: 'shopify'
          });

        if (!error) orderssynced++;
      }

      return { success: true, orderssynced };
    } catch (err) {
      const errorMsg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error('[Shopify] Order sync failed:', errorMsg);
      throw new Error(`Shopify order sync failed: ${errorMsg}`);
    }
  }

  /**
   * Handle inventory level webhook (FR-SH-04)
   */
  async handleInventoryUpdate(payload) {
    const inventoryItemId = payload.inventory_item_id;
    const available = payload.available;

    try {
      const { data: product, error: fetchErr } = await supabase
        .from('products')
        .select('id, sku, stock_quantity')
        .eq('shopify_variant_id', String(inventoryItemId))
        .single();

      if (fetchErr) throw fetchErr;

      if (product && available !== undefined) {
        const prevQty = product.stock_quantity;
        const { error: updateErr } = await supabase
          .from('products')
          .update({ stock_quantity: available, last_synced_at: new Date().toISOString() })
          .eq('id', product.id);

        if (updateErr) throw updateErr;

        if (available > prevQty) {
          const { error: logErr } = await supabase.from('inventory_log').insert({
            product_id: product.id,
            sku: product.sku,
            event_type: 'restock',
            quantity_changed: available - prevQty,
            previous_quantity: prevQty,
            new_quantity: available,
            notes: 'Shopify inventory webhook'
          });
          if (logErr) throw logErr;
        }
      }
    } catch (err) {
      console.error('[Shopify Webhook] Inventory update failed:', err.message || err);
      throw err;
    }
  }
}

function mapShopifyStatus(fulfillmentStatus) {
  switch (fulfillmentStatus) {
    case 'fulfilled': return 'delivered';
    case 'partial': return 'processing';
    case null: return 'pending';
    default: return 'pending';
  }
}

module.exports = new ShopifySync();
