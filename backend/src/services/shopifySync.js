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
  extractPageInfo(linkHeader) {
    if (!linkHeader) return null;
    const match = linkHeader.match(/<[^>]+page_info=([^>&]+)[^>]*>;\s*rel="next"/);
    return match ? match[1] : null;
  }

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
      return { data: response.data, headers: response.headers };
    } catch (err) {
      if (err.response?.status === 429 && this.retryCount < this.maxRetries) {
        try {
          this.retryCount++;
          const backoffMs = Math.pow(2, this.retryCount) * 1000;
          console.warn(`[Shopify] Rate limited. Retrying in ${backoffMs}ms (attempt ${this.retryCount})`);
          await this.delay(backoffMs);
          return await this.shopifyRequest(endpoint, method, data);
        } catch (retryErr) {
          throw retryErr;
        }
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

        const { data, headers } = await this.shopifyRequest(endpoint);
        const products = data.products || [];

        for (const shopifyProduct of products) {
          for (const variant of shopifyProduct.variants) {
      const sku = variant.sku || `SHP-${variant.id}`;

            // Check if product exists by SKU
            const { data: existing } = await supabase
              .from('products')
              .select('id, sku, price, stock_quantity, name')
              .eq('sku', sku)
              .maybeSingle();

            const newName = `${shopifyProduct.title}${variant.title !== 'Default Title' ? ` - ${variant.title}` : ''}`;
            const newPrice = parseFloat(variant.price) || 0;
            const newQty = variant.inventory_quantity || 0;

            if (existing) {
              if (existing.price === newPrice && existing.stock_quantity === newQty && existing.name === newName) {
                productsSkipped++;
                continue;
              }

              const { error: updateErr } = await supabase
                .from('products')
                .update({
                  name: newName,
                  price: newPrice,
                  stock_quantity: newQty,
                  shopify_variant_id: String(variant.id),
                  shopify_inventory_item_id: variant.inventory_item_id ? String(variant.inventory_item_id) : null,
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
                  name: newName,
                  description: shopifyProduct.body_html?.replace(/<[^>]*>/g, '') || '',
                  barcode,
                  price: newPrice,
                  cost_per_unit: parseFloat(variant.cost) || 0,
                  stock_quantity: variant.inventory_quantity || 0,
                  category: shopifyProduct.product_type || 'Uncategorized',
                  image_url: shopifyProduct.image?.src || '',
                  shopify_variant_id: String(variant.id),
                  shopify_inventory_item_id: variant.inventory_item_id ? String(variant.inventory_item_id) : null,
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
        pageInfo = this.extractPageInfo(headers?.link);
        hasNextPage = !!pageInfo;
      }

      const durationMs = Date.now() - startTime;
      const logWriteResponse = await supabase.from('sync_log').insert({
        products_updated: productsUpdated,
        products_skipped: productsSkipped,
        products_created: productsCreated,
        triggered_by: triggeredBy,
        status: 'success',
        error_details: '',
        duration_ms: durationMs
      });
      if (logWriteResponse && logWriteResponse.error) {
        console.error('[Shopify] Failed to write sync log:', logWriteResponse.error.message || logWriteResponse.error);
      }

      return {
        success: true,
        productsUpdated,
        productsSkipped,
        productsCreated,
        durationMs
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorDetails = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error('[Shopify] Product sync failed:', errorDetails);

      const logWriteResponse = await supabase.from('sync_log').insert({
        products_updated: productsUpdated,
        products_skipped: productsSkipped,
        products_created: productsCreated,
        triggered_by: triggeredBy,
        status: 'failed',
        error_details: errorDetails,
        duration_ms: durationMs
      });
      if (logWriteResponse && logWriteResponse.error) {
        console.error('[Shopify] Failed to write sync log:', logWriteResponse.error.message || logWriteResponse.error);
      }

      throw err;
    }
  }

  /**
   * Sync orders from Shopify (FR-SH-02/03)
   */
  async syncOrders(triggeredBy = 'auto') {
    if (!this.isConfigured()) {
      return { success: false, error: 'Shopify is not configured in .env' };
    }

    try {
      let hasNextPage = true;
      let pageInfo = null;
      let ordersSynced = 0;

      while (hasNextPage) {
        const endpoint = pageInfo
          ? `/orders.json?limit=50&page_info=${pageInfo}`
          : '/orders.json?status=any&limit=50';

        const { data, headers } = await this.shopifyRequest(endpoint);
        const orders = data.orders || [];

        for (const shopifyOrder of orders) {
          let retryCount = 0;
          while (retryCount < 3) {
            try {
              const result = await this.upsertShopifyOrder(shopifyOrder, { ensureDelivery: true });
              if (result.success) ordersSynced++;
              break;
            } catch (upsertErr) {
              if (upsertErr.message && upsertErr.message.includes('fetch failed')) {
                retryCount++;
                console.warn(`[Shopify] Upsert fetch failed for order. Retrying... (${retryCount}/3)`);
                if (retryCount >= 3) throw upsertErr;
                await new Promise(r => setTimeout(r, 2000 * retryCount));
              } else {
                throw upsertErr;
              }
            }
          }
        }

        pageInfo = this.extractPageInfo(headers?.link);
        hasNextPage = !!pageInfo;
      }

      await supabase.from('sync_log').insert({
        orders_synced: ordersSynced,
        triggered_by: triggeredBy,
        status: 'success'
      });

      return { success: true, ordersSynced };
    } catch (err) {
      const errorMsg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error('[Shopify] Order sync failed:', errorMsg);
      throw new Error(`Shopify order sync failed: ${errorMsg}`);
    }
  }

  /**
   * Process a single Shopify order payload from sync or webhook.
   */
  async upsertShopifyOrder(shopifyOrder, options = {}) {
    const { ensureDelivery = true } = options;
    const shopifyId = String(shopifyOrder.id);
    const items = normalizeShopifyItems(shopifyOrder.line_items || []);
    const orderPayload = buildOrderPayload(shopifyOrder, items);

    const { data: existing, error: existingErr } = await supabase
      .from('orders')
      .select('id')
      .eq('shopify_order_id', shopifyId)
      .maybeSingle();

    if (existingErr) throw existingErr;

    let orderId = existing?.id;

    if (orderId) {
      const { error: updateErr } = await supabase
        .from('orders')
        .update(orderPayload)
        .eq('id', orderId);
      if (updateErr) throw updateErr;
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('orders')
        .insert(orderPayload)
        .select('id')
        .single();
      if (insertErr) throw insertErr;
      orderId = inserted.id;
    }

    await this.replaceOrderItems(orderId, items);

    if (ensureDelivery) {
      await this.ensureDeliveryOrder(orderId, shopifyOrder);
    }

    return { success: true, orderId, created: !existing };
  }

  async replaceOrderItems(orderId, items) {
    const { error: deleteErr } = await supabase
      .from('order_items')
      .delete()
      .eq('order_id', orderId);

    if (deleteErr) throw deleteErr;
    if (items.length === 0) return;

    const enrichedItems = [];
    for (const item of items) {
      const { data: product } = await supabase
        .from('products')
        .select('id, cost_per_unit')
        .eq('sku', item.sku)
        .maybeSingle();

      enrichedItems.push({
        order_id: orderId,
        product_id: product?.id || null,
        sku: item.sku,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        cost_per_unit: product?.cost_per_unit || 0
      });
    }

    const { error: insertItemsErr } = await supabase
      .from('order_items')
      .insert(enrichedItems);

    if (insertItemsErr) throw insertItemsErr;
  }

  async ensureDeliveryOrder(orderId, shopifyOrder) {
    const { data: existingDelivery, error: deliveryFetchErr } = await supabase
      .from('delivery_orders')
      .select('id')
      .eq('order_id', orderId)
      .maybeSingle();

    if (deliveryFetchErr) throw deliveryFetchErr;

    const paymentStatus = mapShopifyPaymentStatus(shopifyOrder.financial_status);
    let bostaTrackingNumber = null;
    if (shopifyOrder.fulfillments && shopifyOrder.fulfillments.length > 0) {
      const bostaFulfillment = shopifyOrder.fulfillments.find(f => 
        (f.tracking_company && f.tracking_company.toLowerCase().includes('bosta')) ||
        (f.tracking_number && f.tracking_number.toString().startsWith('3'))
      );
      if (bostaFulfillment) bostaTrackingNumber = bostaFulfillment.tracking_number;
    }

    const deliveryPayload = {
      customer_address: formatShopifyAddress(shopifyOrder.shipping_address || shopifyOrder.billing_address),
      cod_amount: paymentStatus === 'paid' ? 0 : parseFloat(shopifyOrder.total_price) || 0,
      notes: shopifyOrder.note || '',
      ...(bostaTrackingNumber && { tracking_number: bostaTrackingNumber, delivery_type: 'bosta' }),
      updated_at: new Date().toISOString()
    };

    if (existingDelivery) {
      const { error: updateErr } = await supabase
        .from('delivery_orders')
        .update(deliveryPayload)
        .eq('id', existingDelivery.id);
      if (updateErr) throw updateErr;
      return;
    }

    const { error: insertErr } = await supabase
      .from('delivery_orders')
      .insert({
        order_id: orderId,
        delivery_type: 'own_driver',
        status: 'pending',
        ...deliveryPayload
      });

    if (insertErr) throw insertErr;
  }

  async handleOrderWebhook(payload, topic = 'orders/create') {
    const result = await this.upsertShopifyOrder(payload, { ensureDelivery: true });

    await supabase.from('sync_log').insert({
      orders_synced: 1,
      triggered_by: 'webhook',
      status: 'success',
      error_details: topic
    });

    return result;
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
        .eq('shopify_inventory_item_id', String(inventoryItemId))
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

  /**
   * Handle product update webhook (Part 3)
   */
  async handleProductUpdate(shopifyProduct) {
    if (!shopifyProduct || !shopifyProduct.variants) return;
    
    for (const variant of shopifyProduct.variants) {
      const sku = variant.sku || `SHP-${variant.id}`;

      const newName = `${shopifyProduct.title}${variant.title !== 'Default Title' ? ` - ${variant.title}` : ''}`;
      const newPrice = parseFloat(variant.price) || 0;
      const newQty = variant.inventory_quantity || 0;

      const { data: existing } = await supabase
        .from('products')
        .select('id')
        .eq('sku', sku)
        .maybeSingle();

      if (existing) {
        await supabase.from('products').update({
          name: newName,
          price: newPrice,
          stock_quantity: newQty,
          shopify_variant_id: String(variant.id),
          shopify_inventory_item_id: variant.inventory_item_id ? String(variant.inventory_item_id) : null,
          image_url: shopifyProduct.image?.src || '',
          last_synced_at: new Date().toISOString()
        }).eq('id', existing.id);
      } else {
        const barcode = variant.barcode || generateBarcodeString();
        await supabase.from('products').insert({
          sku: sku.toUpperCase(),
          name: newName,
          description: shopifyProduct.body_html?.replace(/<[^>]*>/g, '') || '',
          barcode,
          price: newPrice,
          cost_per_unit: parseFloat(variant.cost) || 0,
          stock_quantity: newQty,
          category: shopifyProduct.product_type || 'Uncategorized',
          image_url: shopifyProduct.image?.src || '',
          shopify_variant_id: String(variant.id),
          shopify_inventory_item_id: variant.inventory_item_id ? String(variant.inventory_item_id) : null,
          last_synced_at: new Date().toISOString()
        });
      }
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

function mapShopifyPaymentStatus(financialStatus) {
  switch (financialStatus) {
    case 'paid': return 'paid';
    case 'refunded':
    case 'partially_refunded':
      return 'refunded';
    case 'voided':
      return 'failed';
    default:
      return 'pending';
  }
}

function mapShopifyPaymentMethod(shopifyOrder) {
  const gateways = [
    shopifyOrder.gateway,
    ...(shopifyOrder.payment_gateway_names || [])
  ].filter(Boolean).join(' ').toLowerCase();

  if (gateways.includes('cash') || gateways.includes('cod')) return 'cash';
  if (gateways.includes('bank')) return 'bank_transfer';
  if (gateways.includes('install')) return 'installment';
  return 'card';
}

function normalizeShopifyItems(lineItems) {
  return lineItems.map(item => ({
    sku: (item.sku || `SHOPIFY-${item.variant_id || item.id}`).toUpperCase(),
    name: item.name || item.title || 'Shopify Item',
    quantity: Number(item.quantity) || 0,
    price: parseFloat(item.price) || 0
  }));
}

function buildOrderPayload(shopifyOrder, items) {
  return {
    shopify_order_id: String(shopifyOrder.id),
    customer_name: getShopifyCustomerName(shopifyOrder),
    customer_phone: shopifyOrder.customer?.phone || shopifyOrder.shipping_address?.phone || shopifyOrder.billing_address?.phone || 'N/A',
    customer_email: shopifyOrder.customer?.email || shopifyOrder.email || '',
    items,
    subtotal: parseFloat(shopifyOrder.subtotal_price) || 0,
    total: parseFloat(shopifyOrder.total_price) || 0,
    status: mapShopifyStatus(shopifyOrder.fulfillment_status),
    payment_status: mapShopifyPaymentStatus(shopifyOrder.financial_status),
    payment_method: mapShopifyPaymentMethod(shopifyOrder),
    source: 'shopify',
    created_at: shopifyOrder.created_at || new Date().toISOString()
  };
}

function getShopifyCustomerName(shopifyOrder) {
  const customer = shopifyOrder.customer;
  const shipping = shopifyOrder.shipping_address;
  return [
    customer?.first_name || shipping?.first_name || '',
    customer?.last_name || shipping?.last_name || ''
  ].join(' ').trim() || shipping?.name || 'Shopify Customer';
}

function formatShopifyAddress(address = {}) {
  return [
    address.address1,
    address.address2,
    address.city,
    address.province,
    address.country,
    address.zip
  ].filter(Boolean).join(', ');
}

module.exports = new ShopifySync();
