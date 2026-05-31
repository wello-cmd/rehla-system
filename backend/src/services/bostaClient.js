// Bosta Courier API Client — FR-DL-10 through FR-DL-15
// Integration with Bosta last-mile delivery service and tracking sync
// NO SIMULATION FALLBACK (strict compliance with user request)

const axios = require('axios');
const { supabase } = require('../db/supabase');

const BOSTA_API_URL = process.env.BOSTA_API_URL || 'https://app.bosta.co/api/v2';
const BOSTA_API_KEY = process.env.BOSTA_API_KEY;

class BostaClient {
  constructor() {
    this.client = axios.create({
      baseURL: BOSTA_API_URL,
      headers: {
        'Authorization': BOSTA_API_KEY || '',
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
  }

  isConfigured() {
    return !!BOSTA_API_KEY;
  }

  /**
   * Create a shipment (FR-DL-10, FR-DL-11)
   */
  async createShipment({ receiverName, receiverPhone, receiverAddress, city, zone, packageSize, codAmount, notes }) {
    if (!this.isConfigured()) {
      throw new Error('Bosta API key not configured.');
    }

    try {
      const response = await this.client.post('/deliveries', {
        type: codAmount > 0 ? 10 : 15,
        specs: {
          packageDetails: {
            itemsCount: 1,
            description: notes || 'Rehla order shipment'
          },
          size: packageSize || 'SMALL',
          weight: 1
        },
        dropOffAddress: {
          firstLine: receiverAddress,
          city: city || 'Cairo',
          zone: zone || ''
        },
        receiver: {
          firstName: receiverName.split(' ')[0] || receiverName,
          lastName: receiverName.split(' ').slice(1).join(' ') || '',
          phone: receiverPhone,
          email: ''
        },
        cod: codAmount || 0,
        notes: notes || ''
      });

      return {
        success: true,
        shipmentId: response.data._id || response.data.data?._id,
        trackingNumber: response.data.trackingNumber || response.data.data?.trackingNumber,
        rawResponse: response.data
      };
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message;
      console.error('[Bosta] Create shipment failed:', errorMsg);
      throw new Error(`Bosta shipment creation failed: ${errorMsg}`);
    }
  }

  /**
   * Get tracking status for a shipment (FR-DL-13)
   */
  async getTrackingStatus(trackingNumber) {
    if (!this.isConfigured()) {
      throw new Error('Bosta API key not configured.');
    }

    try {
      const response = await this.client.get(`/deliveries/tracking/${trackingNumber}`);
      const data = response.data.data || response.data;

      return {
        success: true,
        status: data.state?.value || data.status,
        statusName: data.state?.name || '',
        history: data.transitEvents || [],
        lastUpdate: data.updatedAt || data.updated_at
      };
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message;
      console.error('[Bosta] Tracking failed:', errorMsg);
      throw new Error(`Bosta tracking failed: ${errorMsg}`);
    }
  }

  /**
   * Generate waybill/print label URL (FR-DL-12)
   */
  async getWaybillUrl(shipmentId) {
    if (!this.isConfigured()) {
      throw new Error('Bosta API key not configured.');
    }

    try {
      const response = await this.client.get(`/deliveries/${shipmentId}/awb`);
      return {
        success: true,
        url: response.data.data?.url || response.data.url
      };
    } catch (err) {
      console.error('[Bosta] AWB fetch failed:', err.message);
      return { success: false, url: null };
    }
  }

  /**
   * Process incoming Bosta webhook (FR-DL-14)
   */
  parseWebhookPayload(payload) {
    return {
      shipmentId: payload._id || payload.deliveryId,
      trackingNumber: payload.trackingNumber,
      status: payload.state?.value || payload.status,
      statusName: payload.state?.name || '',
      reason: payload.cancelReason || payload.failureReason || null,
      timestamp: payload.updatedAt || new Date().toISOString()
    };
  }

  /**
   * Sync active Bosta shipments in the database (FR-DL-15)
   */
  async syncBostaDeliveries() {
    try {
      if (!this.isConfigured()) {
        throw new Error('Bosta API key not configured in .env');
      }

      // Find active Bosta shipments
      const { data: activeDeliveries, error: fetchErr } = await supabase
        .from('delivery_orders')
        .select('id, order_id, tracking_number, status')
        .eq('delivery_type', 'bosta')
        .not('status', 'in', '("delivered","failed")');

      if (fetchErr) throw fetchErr;
      if (!activeDeliveries || activeDeliveries.length === 0) {
        return { success: true, syncedCount: 0, message: 'No active Bosta deliveries to sync.' };
      }

      let updatedCount = 0;

      for (const d of activeDeliveries) {
        const tracking = await this.getTrackingStatus(d.tracking_number);
        
        const statusMap = {
          'DELIVERED': 'delivered',
          'RETURNED': 'failed',
          'CANCELLED': 'failed',
          'IN_TRANSIT': 'out_for_delivery',
          'PICKED_UP': 'out_for_delivery',
          'RECEIVED_AT_WAREHOUSE': 'assigned'
        };

        const newStatus = statusMap[tracking.status] || d.status;

        if (newStatus !== d.status) {
          await supabase
            .from('delivery_orders')
            .update({
              status: newStatus,
              updated_at: new Date().toISOString(),
              ...(newStatus === 'delivered' && { delivered_at: tracking.lastUpdate || new Date().toISOString() })
            })
            .eq('id', d.id);

          await supabase.from('delivery_log').insert({
            delivery_order_id: d.id,
            event: `Tracking Sync Update: ${newStatus.replace(/_/g, ' ').toUpperCase()}`,
            notes: `Status synchronized via Bosta tracking API. Event name: ${tracking.statusName}`
          });

          if (newStatus === 'delivered') {
            await supabase
              .from('orders')
              .update({ status: 'delivered', payment_status: 'paid' })
              .eq('id', d.order_id);
              
            await supabase
              .from('invoices')
              .update({ status: 'Paid' })
              .eq('order_id', d.order_id);
          }

          updatedCount++;
        }
      }

      return { success: true, syncedCount: updatedCount, message: `Successfully synchronized ${updatedCount} Bosta shipments.` };
    } catch (err) {
      console.error('[Bosta Sync] Error:', err.message);
      return { success: false, error: err.message };
    }
  }
}

module.exports = new BostaClient();
