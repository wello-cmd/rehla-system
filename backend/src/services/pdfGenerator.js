// PDF Generator Service — FR-IV-07/08, FR-FN-12, FR-AN-08, FR-DL-12
// Uses pdfkit to generate branded Rehla PDFs

const PDFDocument = require('pdfkit');

const REHLA_BRAND = {
  name: 'REHLA',
  tagline: 'Egyptian Streetwear',
  color: '#131313',
  accent: '#C6C6C6',
  address: 'Cairo, Egypt',
  currency: 'EGP'
};

/**
 * Generate a branded invoice PDF (FR-IV-07/08)
 */
function generateInvoicePDF(invoice, items, client) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(28).font('Helvetica-Bold').text(REHLA_BRAND.name, 50, 50);
    doc.fontSize(10).font('Helvetica').fillColor('#666')
       .text(REHLA_BRAND.tagline, 50, 82);
    doc.text(REHLA_BRAND.address, 50, 95);

    // Invoice title
    doc.fontSize(20).fillColor(REHLA_BRAND.color).font('Helvetica-Bold')
       .text('INVOICE', 400, 50, { align: 'right' });
    doc.fontSize(11).font('Helvetica').fillColor('#333')
       .text(invoice.invoice_number, 400, 75, { align: 'right' });

    // Divider
    doc.moveTo(50, 120).lineTo(545, 120).strokeColor('#ddd').lineWidth(1).stroke();

    // Client details
    doc.fontSize(10).fillColor('#888').text('BILL TO', 50, 140);
    doc.fontSize(12).fillColor('#333').font('Helvetica-Bold')
       .text(client?.company_name || invoice.customer_name, 50, 155);
    doc.fontSize(10).font('Helvetica').fillColor('#555');
    if (client?.address) doc.text(client.address, 50, 172);
    if (client?.phone) doc.text(`Phone: ${client.phone}`, 50, 187);
    if (client?.email || invoice.customer_email) doc.text(`Email: ${client?.email || invoice.customer_email}`, 50, 202);
    if (client?.tax_number) doc.text(`Tax Reg: ${client.tax_number}`, 50, 217);

    // Dates
    doc.fontSize(10).fillColor('#888').text('ISSUE DATE', 350, 140);
    doc.fillColor('#333').text(invoice.issue_date, 350, 155);
    doc.fillColor('#888').text('DUE DATE', 450, 140);
    doc.fillColor('#333').text(invoice.due_date, 450, 155);
    doc.fillColor('#888').text('STATUS', 350, 175);
    doc.fillColor(invoice.status === 'Paid' ? '#2E7D32' : '#C62828').font('Helvetica-Bold')
       .text(invoice.status, 350, 190);

    // Items table header
    const tableTop = 250;
    doc.fillColor('#f5f5f5').rect(50, tableTop - 5, 495, 22).fill();
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#333');
    doc.text('DESCRIPTION', 55, tableTop);
    doc.text('QTY', 330, tableTop, { width: 50, align: 'center' });
    doc.text('UNIT PRICE', 380, tableTop, { width: 80, align: 'right' });
    doc.text('SUBTOTAL', 460, tableTop, { width: 80, align: 'right' });

    // Items
    let y = tableTop + 25;
    doc.font('Helvetica').fontSize(10).fillColor('#333');
    for (const item of items) {
      doc.text(item.description, 55, y, { width: 270 });
      doc.text(String(item.quantity), 330, y, { width: 50, align: 'center' });
      doc.text(`${REHLA_BRAND.currency} ${Number(item.unit_price).toLocaleString()}`, 380, y, { width: 80, align: 'right' });
      doc.text(`${REHLA_BRAND.currency} ${Number(item.subtotal).toLocaleString()}`, 460, y, { width: 80, align: 'right' });
      y += 22;

      if (y > 700) {
        doc.addPage();
        y = 50;
      }
    }

    // Divider before totals
    doc.moveTo(350, y + 10).lineTo(545, y + 10).strokeColor('#ddd').lineWidth(1).stroke();

    // Totals
    y += 20;
    doc.fontSize(10).fillColor('#666');
    doc.text('Subtotal:', 380, y);
    doc.fillColor('#333').text(`${REHLA_BRAND.currency} ${Number(invoice.subtotal || invoice.total).toLocaleString()}`, 460, y, { width: 80, align: 'right' });

    y += 20;
    doc.fontSize(14).font('Helvetica-Bold').fillColor(REHLA_BRAND.color);
    doc.text('TOTAL:', 380, y);
    doc.text(`${REHLA_BRAND.currency} ${Number(invoice.total).toLocaleString()}`, 440, y, { width: 100, align: 'right' });

    // Notes
    if (invoice.notes) {
      y += 50;
      doc.fontSize(9).fillColor('#888').font('Helvetica').text('NOTES', 50, y);
      doc.fillColor('#555').text(invoice.notes, 50, y + 15, { width: 300 });
    }

    // Footer
    doc.fontSize(8).fillColor('#aaa')
       .text(`${REHLA_BRAND.name} — ${REHLA_BRAND.tagline} — ${REHLA_BRAND.address}`, 50, 760, { align: 'center' });

    doc.end();
  });
}

/**
 * Generate a P&L report PDF (FR-FN-12)
 */
function generatePLReportPDF(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(28).font('Helvetica-Bold').text(REHLA_BRAND.name, 50, 50);
    doc.fontSize(18).fillColor('#333').text('Profit & Loss Report', 50, 85);
    doc.fontSize(10).fillColor('#666').text(`Period: ${data.period || 'All Time'}`, 50, 110);
    doc.moveTo(50, 130).lineTo(545, 130).strokeColor('#ddd').lineWidth(1).stroke();

    let y = 150;
    const items = [
      { label: 'Revenue', value: data.revenue, bold: true },
      { label: 'Cost of Goods Sold (COGS)', value: -data.cogs },
      { label: 'Gross Profit', value: data.grossProfit, bold: true },
      { label: 'Gross Margin %', value: `${data.grossMargin?.toFixed(1) || 0}%`, isPercent: true },
      { label: '', value: '', divider: true },
      { label: 'Total Expenses', value: -data.expenses },
      { label: 'Net Profit', value: data.netProfit, bold: true, highlight: true },
      { label: 'Net Margin %', value: `${data.netMargin?.toFixed(1) || 0}%`, isPercent: true },
    ];

    for (const item of items) {
      if (item.divider) {
        doc.moveTo(50, y).lineTo(545, y).strokeColor('#eee').stroke();
        y += 15;
        continue;
      }

      doc.fontSize(item.bold ? 12 : 11)
         .font(item.bold ? 'Helvetica-Bold' : 'Helvetica')
         .fillColor(item.highlight ? (item.value >= 0 ? '#2E7D32' : '#C62828') : '#333');
      doc.text(item.label, 55, y);

      if (!item.isPercent) {
        const val = typeof item.value === 'number' ? `EGP ${item.value.toLocaleString()}` : '';
        doc.text(val, 350, y, { width: 190, align: 'right' });
      } else {
        doc.text(String(item.value), 350, y, { width: 190, align: 'right' });
      }
      y += 25;
    }

    // Footer
    doc.fontSize(8).fillColor('#aaa')
       .text(`Generated on ${new Date().toISOString().split('T')[0]} — ${REHLA_BRAND.name}`, 50, 760, { align: 'center' });

    doc.end();
  });
}

/**
 * Generate a delivery waybill PDF (FR-DL-12)
 */
function generateWaybillPDF(delivery, order) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: [283, 425] }); // ~100mm x 150mm label
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).font('Helvetica-Bold').text(REHLA_BRAND.name, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(8).font('Helvetica').fillColor('#666').text('DELIVERY WAYBILL', { align: 'center' });
    doc.moveDown(1);

    doc.moveTo(40, doc.y).lineTo(243, doc.y).stroke();
    doc.moveDown(0.5);

    doc.fontSize(9).fillColor('#333').font('Helvetica-Bold');
    doc.text('TO:');
    doc.font('Helvetica').text(order.customer_name);
    doc.text(delivery.customer_address);
    doc.text(`Phone: ${order.customer_phone}`);
    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').text(`Order: #${order.order_number || order.id.slice(0,8)}`);
    if (delivery.cod_amount > 0) {
      doc.fillColor('#C62828').text(`COD: EGP ${delivery.cod_amount.toLocaleString()}`);
    }
    if (delivery.tracking_number) {
      doc.fillColor('#333').text(`Tracking: ${delivery.tracking_number}`);
    }

    doc.moveDown(1);
    doc.fontSize(8).fillColor('#aaa').text(`Printed: ${new Date().toLocaleDateString('en-EG')}`, { align: 'center' });

    doc.end();
  });
}

module.exports = { generateInvoicePDF, generatePLReportPDF, generateWaybillPDF };
