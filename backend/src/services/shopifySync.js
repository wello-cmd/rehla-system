// Shopify Sync Service — FR-SH-01 through FR-SH-10
// Real Shopify Admin API integration with rate limiting and sync logging
// NO SIMULATION FALLBACK (strict compliance with user request)

const axios = require('axios');
const { supabase } = require('../db/supabase');


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
      const isRateLimit = err.response?.status === 429;
      const isNetworkErr = ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'ENOTFOUND'].includes(err.code) ||
        err.message?.includes('read ECONNRESET') || err.message?.includes('socket hang up');
      if ((isRateLimit || isNetworkErr) && this.retryCount < this.maxRetries) {
        this.retryCount++;
        const backoffMs = isRateLimit
          ? Math.pow(2, this.retryCount) * 1000
          : this.retryCount * 3000;
        console.warn(`[Shopify] ${isRateLimit ? 'Rate limited' : 'Network error'} (${err.code || err.message?.slice(0, 40)}). Retrying in ${backoffMs}ms (attempt ${this.retryCount}/${this.maxRetries})`);
        await this.delay(backoffMs);
        return await this.shopifyRequest(endpoint, method, data);
      }
      throw err;
    }
  }

  /**
   * Full product sync from Shopify (FR-SH-01)
   * One row in `products` per Shopify product; each variant goes into `product_variants`.
   */
  async syncProducts(triggeredBy = 'auto') {
    if (!this.isConfigured()) {
      return { success: false, error: 'Shopify is not configured in .env' };
    }

    const startTime = Date.now();
    let productsCreated = 0;
    let productsUpdated = 0;
    let productsSkipped = 0;

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
          const shopifyProductId = String(shopifyProduct.id);
          const firstVariant = shopifyProduct.variants[0];
          const totalStock = shopifyProduct.variants.reduce(
            (sum, v) => sum + (v.inventory_quantity || 0), 0
          );

          // Upsert parent product row (one per Shopify product)
          const { data: parentProduct, error: parentErr } = await supabase
            .from('products')
            .upsert({
              shopify_product_id: shopifyProductId,
              name: shopifyProduct.title,
              description: shopifyProduct.body_html?.replace(/<[^>]*>/g, '') || '',
              category: shopifyProduct.product_type || 'Uncategorized',
              image_url: shopifyProduct.image?.src || '',
              brand: shopifyProduct.vendor || 'REHLA',
              sku: firstVariant ? (firstVariant.sku || `SHP-${firstVariant.id}`).toUpperCase() : null,
              price: parseFloat(firstVariant?.price) || 0,
              cost_per_unit: parseFloat(firstVariant?.cost) || 0,
              stock_quantity: totalStock,
              barcode: firstVariant?.barcode || null,
              last_synced_at: new Date().toISOString()
            }, { onConflict: 'shopify_product_id' })
            .select('id')
            .single();

          if (parentErr) {
            productsSkipped++;
            continue;
          }

          const isNew = !parentProduct; // upsert always returns the row
          if (isNew) productsCreated++; else productsUpdated++;

          // Upsert each variant into product_variants
          for (const variant of shopifyProduct.variants) {
            const variantSku = (variant.sku || `SHP-${variant.id}`).toUpperCase();
            const variantName = variant.title !== 'Default Title' ? variant.title : null;

            await supabase
              .from('product_variants')
              .upsert({
                product_id: parentProduct.id,
                shopify_variant_id: String(variant.id),
                sku: variantSku,
                variant_name: variantName,
                size: variant.option1 || null,
                color: variant.option2 || null,
                price: parseFloat(variant.price) || 0,
                cost_per_unit: parseFloat(variant.cost) || 0,
                stock_quantity: variant.inventory_quantity || 0,
                barcode: variant.barcode || null,
                shopify_inventory_item_id: variant.inventory_item_id ? String(variant.inventory_item_id) : null,
                image_url: shopifyProduct.image?.src || '',
                last_synced_at: new Date().toISOString()
              }, { onConflict: 'shopify_variant_id' });
          }
        }

        pageInfo = this.extractPageInfo(headers?.link);
        hasNextPage = !!pageInfo;
      }

      const durationMs = Date.now() - startTime;
      await supabase.from('sync_log').insert({
        products_updated: productsUpdated,
        products_skipped: productsSkipped,
        products_created: productsCreated,
        triggered_by: triggeredBy,
        status: 'success',
        error_details: '',
        duration_ms: durationMs
      });

      return { success: true, productsCreated, productsUpdated, productsSkipped, durationMs };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error('[Shopify] Product sync failed:', errorMsg);
      await supabase.from('sync_log').insert({
        products_updated: productsUpdated,
        products_skipped: productsSkipped,
        products_created: productsCreated,
        triggered_by: triggeredBy,
        status: 'failed',
        error_details: errorMsg,
        duration_ms: durationMs
      });
      throw err;
    }
  }

  /**
   * Sync orders from Shopify (FR-SH-02/03)
   * @param {string} triggeredBy - 'auto', 'manual', 'cron'
   * @param {object} options
   * @param {string} [options.updatedAtMin] - ISO timestamp; only fetch orders updated after this (incremental sync)
   */
  async syncOrders(triggeredBy = 'auto', options = {}) {
    if (!this.isConfigured()) {
      return { success: false, error: 'Shopify is not configured in .env' };
    }

    const { updatedAtMin = null } = options;

    try {
      let hasNextPage = true;
      let pageInfo = null;
      let ordersSynced = 0;

      while (hasNextPage) {
        let endpoint;
        if (pageInfo) {
          endpoint = `/orders.json?limit=250&page_info=${pageInfo}`;
        } else if (updatedAtMin) {
          endpoint = `/orders.json?status=any&limit=250&updated_at_min=${encodeURIComponent(updatedAtMin)}`;
        } else {
          endpoint = '/orders.json?status=any&limit=250';
        }

        const { data, headers } = await this.shopifyRequest(endpoint);
        const orders = data.orders || [];

        // Upsert this page's orders in parallel (5 at a time) for speed
        const CONCURRENCY = 5;
        for (let i = 0; i < orders.length; i += CONCURRENCY) {
          const batch = orders.slice(i, i + CONCURRENCY);
          await Promise.all(batch.map(async (shopifyOrder) => {
            let retryCount = 0;
            while (retryCount < 3) {
              try {
                const result = await this.upsertShopifyOrder(shopifyOrder, { ensureDelivery: true });
                if (result.success) ordersSynced++;
                break;
              } catch (upsertErr) {
                retryCount++;
                if (retryCount >= 3) throw upsertErr;
                await new Promise(r => setTimeout(r, 2000 * retryCount));
              }
            }
          }));
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
      // Look up by shopify_variant_id first, fall back to SKU
      let variantQuery = supabase
        .from('product_variants')
        .select('id, product_id, cost_per_unit');

      if (item.shopify_variant_id) {
        variantQuery = variantQuery.eq('shopify_variant_id', item.shopify_variant_id);
      } else {
        variantQuery = variantQuery.eq('sku', item.sku);
      }

      const { data: variant } = await variantQuery.maybeSingle();

      enrichedItems.push({
        order_id: orderId,
        product_id: variant?.product_id || null,
        variant_id: variant?.id || null,
        sku: item.sku,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        cost_per_unit: variant?.cost_per_unit || 0
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
   * Updates the specific variant's stock, then recalculates the parent product total.
   */
  async handleInventoryUpdate(payload) {
    const inventoryItemId = payload.inventory_item_id;
    const available = payload.available;

    try {
      const { data: variant, error: fetchErr } = await supabase
        .from('product_variants')
        .select('id, product_id, sku, stock_quantity')
        .eq('shopify_inventory_item_id', String(inventoryItemId))
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      if (!variant || available === undefined) return;

      const prevQty = variant.stock_quantity;

      // Update the variant's stock
      await supabase
        .from('product_variants')
        .update({ stock_quantity: available, last_synced_at: new Date().toISOString() })
        .eq('id', variant.id);

      // Recalculate and update the parent product's total stock
      const { data: allVariants } = await supabase
        .from('product_variants')
        .select('stock_quantity')
        .eq('product_id', variant.product_id);

      const totalStock = (allVariants || []).reduce((sum, v) => sum + (v.stock_quantity || 0), 0);
      await supabase
        .from('products')
        .update({ stock_quantity: totalStock, last_synced_at: new Date().toISOString() })
        .eq('id', variant.product_id);

      // Log restock events
      if (available > prevQty) {
        await supabase.from('inventory_log').insert({
          product_id: variant.product_id,
          sku: variant.sku,
          event_type: 'restock',
          quantity_changed: available - prevQty,
          previous_quantity: prevQty,
          new_quantity: available,
          notes: 'Shopify inventory webhook'
        });
      }
    } catch (err) {
      console.error('[Shopify Webhook] Inventory update failed:', err.message || err);
      throw err;
    }
  }

  /**
   * Handle product update webhook (Part 3)
   * Upserts parent product then syncs all variant rows.
   */
  async handleProductUpdate(shopifyProduct) {
    if (!shopifyProduct || !shopifyProduct.variants) return;

    const shopifyProductId = String(shopifyProduct.id);
    const firstVariant = shopifyProduct.variants[0];
    const totalStock = shopifyProduct.variants.reduce(
      (sum, v) => sum + (v.inventory_quantity || 0), 0
    );

    const { data: parentProduct, error: parentErr } = await supabase
      .from('products')
      .upsert({
        shopify_product_id: shopifyProductId,
        name: shopifyProduct.title,
        description: shopifyProduct.body_html?.replace(/<[^>]*>/g, '') || '',
        category: shopifyProduct.product_type || 'Uncategorized',
        image_url: shopifyProduct.image?.src || '',
        brand: shopifyProduct.vendor || 'REHLA',
        sku: firstVariant ? (firstVariant.sku || `SHP-${firstVariant.id}`).toUpperCase() : null,
        price: parseFloat(firstVariant?.price) || 0,
        cost_per_unit: parseFloat(firstVariant?.cost) || 0,
        stock_quantity: totalStock,
        last_synced_at: new Date().toISOString()
      }, { onConflict: 'shopify_product_id' })
      .select('id')
      .single();

    if (parentErr || !parentProduct) return;

    for (const variant of shopifyProduct.variants) {
      const variantSku = (variant.sku || `SHP-${variant.id}`).toUpperCase();
      await supabase
        .from('product_variants')
        .upsert({
          product_id: parentProduct.id,
          shopify_variant_id: String(variant.id),
          sku: variantSku,
          variant_name: variant.title !== 'Default Title' ? variant.title : null,
          size: variant.option1 || null,
          color: variant.option2 || null,
          price: parseFloat(variant.price) || 0,
          cost_per_unit: parseFloat(variant.cost) || 0,
          stock_quantity: variant.inventory_quantity || 0,
          barcode: variant.barcode || null,
          shopify_inventory_item_id: variant.inventory_item_id ? String(variant.inventory_item_id) : null,
          image_url: shopifyProduct.image?.src || '',
          last_synced_at: new Date().toISOString()
        }, { onConflict: 'shopify_variant_id' });
    }
  }

  /**
   * Sync all customers from Shopify into the customers table.
   * @param {string} triggeredBy
   * @param {object} options
   * @param {string} [options.updatedAtMin] - ISO timestamp for incremental sync
   */
  async syncCustomers(triggeredBy = 'auto', options = {}) {
    if (!this.isConfigured()) return { success: false, error: 'Shopify not configured' };

    const { updatedAtMin = null } = options;
    let synced = 0;
    let pageInfo = null;
    let hasNext = true;

    try {
      while (hasNext) {
        let endpoint;
        if (pageInfo) {
          endpoint = `/customers.json?limit=250&page_info=${pageInfo}`;
        } else if (updatedAtMin) {
          endpoint = `/customers.json?limit=250&updated_at_min=${encodeURIComponent(updatedAtMin)}`;
        } else {
          endpoint = '/customers.json?limit=250';
        }

        const { data, headers } = await this.shopifyRequest(endpoint);
        const customers = data.customers || [];

        if (customers.length > 0) {
          const rows = customers.map(c => buildCustomerPayload(c));
          const { error } = await supabase.from('customers').upsert(rows, { onConflict: 'shopify_customer_id' });
          if (error) throw error;
          synced += customers.length;
        }

        pageInfo = this.extractPageInfo(headers?.link);
        hasNext = !!pageInfo;
      }

      await supabase.from('sync_log').insert({ triggered_by: triggeredBy, status: 'success', error_details: `customers:${synced}` });
      return { success: true, synced };
    } catch (err) {
      console.error('[Shopify] Customer sync failed:', err.message);
      throw err;
    }
  }

  async handleCustomerWebhook(payload) {
    if (!payload?.id) return;
    const { error } = await supabase
      .from('customers')
      .upsert(buildCustomerPayload(payload), { onConflict: 'shopify_customer_id' });
    if (error) throw error;
  }

  /**
   * Sync all Shopify refunds into `shopify_refunds` table.
   * Refunds are keyed by processed_at so analytics can bucket them correctly
   * (a May order refunded in June appears as a June return — matching Shopify analytics).
   * Supports incremental sync via processedAtMin.
   */
  async syncRefunds(triggeredBy = 'auto', options = {}) {
    if (!this.isConfigured()) return { synced: 0 };

    const statuses = ['refunded', 'partially_refunded', 'voided'];
    let totalSynced = 0;

    for (const status of statuses) {
      let pageInfo = null;
      do {
        // Shopify cursor pagination: page_info can only be combined with limit
        const endpoint = pageInfo
          ? `/orders.json?limit=250&page_info=${pageInfo}`
          : `/orders.json?status=any&financial_status=${status}&limit=250&fields=id,name,refunds${options.processedAtMin ? `&updated_at_min=${options.processedAtMin}` : ''}`;
        const { data, headers } = await this.shopifyRequest(endpoint);
        const orders = data.orders || [];
        pageInfo = this.extractPageInfo(headers.link);

        for (const order of orders) {
          if (!order.refunds?.length) continue;

          const rows = order.refunds.map(refund => {
            // Amount = sum of refund transactions (money actually returned to customer)
            // For COD returns where no money was collected, fall back to line item subtotals
            const txAmount = (refund.transactions || [])
              .filter(t => t.kind === 'refund' && t.status === 'success')
              .reduce((s, t) => s + parseFloat(t.amount || '0'), 0);

            const lineAmount = (refund.refund_line_items || [])
              .reduce((s, li) => s + parseFloat(li.subtotal || '0'), 0);

            const amount = txAmount > 0 ? txAmount : lineAmount;
            if (amount <= 0) return null;

            return {
              shopify_refund_id: String(refund.id),
              shopify_order_id:  String(order.id),
              order_name:        order.name,
              processed_at:      refund.processed_at || refund.created_at,
              amount,
              reason:            refund.refund_line_items?.[0]?.restock_type || null,
              note:              refund.note || null,
              synced_at:         new Date().toISOString()
            };
          }).filter(Boolean);

          if (!rows.length) continue;

          // Link to our internal order_id
          const shopifyOrderId = String(order.id);
          const { data: matched } = await supabase
            .from('orders').select('id').eq('shopify_order_id', shopifyOrderId).single();

          const rowsWithId = rows.map(r => ({ ...r, order_id: matched?.id || null }));

          const { error } = await supabase
            .from('shopify_refunds')
            .upsert(rowsWithId, { onConflict: 'shopify_refund_id' });

          if (error) console.error('[syncRefunds] upsert error:', error.message);
          else totalSynced += rowsWithId.length;
        }

        if (!orders.length) break;
      } while (pageInfo);
    }

    console.log(`[syncRefunds] ${triggeredBy}: synced ${totalSynced} refund records`);
    return { synced: totalSynced };
  }
}

function buildCustomerPayload(c) {
  const addr = c.default_address || {};
  return {
    shopify_customer_id: String(c.id),
    email:            c.email || null,
    first_name:       c.first_name || null,
    last_name:        c.last_name || null,
    phone:            c.phone || null,
    address:          addr.address1 || null,
    city:             addr.city || null,
    province:         addr.province || null,
    country:          addr.country || 'Egypt',
    orders_count:     c.orders_count || 0,
    total_spent:      parseFloat(c.total_spent) || 0,
    tags:             c.tags || null,
    note:             c.note || null,
    verified_email:   c.verified_email || false,
    accepts_marketing: c.email_marketing_consent?.state === 'subscribed',
    shopify_state:    c.state || null,
    shopify_created_at: c.created_at || null,
    last_synced_at:   new Date().toISOString()
  };
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
    price: parseFloat(item.price) || 0,
    shopify_variant_id: item.variant_id ? String(item.variant_id) : null
  }));
}

function extractNotePhone(noteAttributes) {
  if (!Array.isArray(noteAttributes)) return null;
  const attr = noteAttributes.find(a =>
    a.name && /phone|mobile|هاتف|رقم|tel/i.test(a.name)
  );
  const val = attr?.value?.trim();
  return val || null;
}

function buildOrderPayload(shopifyOrder, items) {
  const notePhone = extractNotePhone(shopifyOrder.note_attributes);
  return {
    shopify_order_id: String(shopifyOrder.id),
    shopify_order_name: shopifyOrder.name || `#${shopifyOrder.order_number}`,
    customer_name: getShopifyCustomerName(shopifyOrder),
    customer_phone: shopifyOrder.customer?.phone
      || shopifyOrder.shipping_address?.phone
      || shopifyOrder.billing_address?.phone
      || shopifyOrder.phone
      || notePhone
      || 'N/A',
    customer_email: shopifyOrder.customer?.email || shopifyOrder.email || '',
    items,
    subtotal: parseFloat(shopifyOrder.subtotal_price) || 0,
    total: parseFloat(shopifyOrder.total_price) || 0,
    total_refunded: parseFloat(shopifyOrder.total_refunded || '0') || 0,
    status: shopifyOrder.cancelled_at ? 'cancelled'
          : (shopifyOrder.returns?.length > 0 || shopifyOrder.financial_status === 'refunded') ? 'returned'
          : mapShopifyStatus(shopifyOrder.fulfillment_status),
    payment_status: mapShopifyPaymentStatus(shopifyOrder.financial_status),
    payment_method: mapShopifyPaymentMethod(shopifyOrder),
    source: 'shopify',
    created_at: shopifyOrder.created_at || new Date().toISOString(),
    shopify_customer_id: shopifyOrder.customer?.id ? String(shopifyOrder.customer.id) : null
  };
}

function getShopifyCustomerName(shopifyOrder) {
  const c = shopifyOrder.customer || {};
  const s = shopifyOrder.shipping_address || {};
  const b = shopifyOrder.billing_address || {};

  const name = `${c.first_name || s.first_name || b.first_name || ''} ${c.last_name || s.last_name || b.last_name || ''}`.trim();
  return name || s.name || b.name || 'Shopify Customer';
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
