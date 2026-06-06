// Barcode Generator Service — FR-WH-02
// Uses bwip-js to generate Code128 barcodes from SKUs

const bwipjs = require('bwip-js');

/**
 * Generate a barcode PNG buffer from a SKU string
 * @param {string} sku - The SKU to encode
 * @param {object} options - Optional sizing/format overrides
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function generateBarcode(sku, options = {}) {
  const config = {
    bcid: 'code128',
    text: sku,
    scale: options.scale || 3,
    height: options.height || 12,
    includetext: true,
    textxalign: 'center',
    textsize: 10,
    paddingwidth: 10,
    paddingheight: 5,
    ...options
  };

  try {
    const png = await bwipjs.toBuffer(config);
    return png;
  } catch (err) {
    console.error(`[Barcode] Failed to generate barcode for SKU: ${sku}`, err);
    throw new Error(`Barcode generation failed for SKU: ${sku}`);
  }
}

/**
 * Generate a unique barcode string for a product if none exists (FR-SH-09)
 * Format: RHL-XXXXXXXX (8 random hex chars)
 */
function generateBarcodeString() {
  const hex = require('crypto').randomBytes(4).toString('hex').toUpperCase();
  return `RHL-${hex}`;
}

/**
 * Generate barcodes for multiple SKUs (FR-WH-05 — bulk print)
 * @param {string[]} skus - Array of SKU strings
 * @returns {Promise<Array<{sku: string, image: Buffer}>>}
 */
async function generateBulkBarcodes(skus) {
  const results = [];
  for (const sku of skus) {
    try {
      const image = await generateBarcode(sku);
      results.push({ sku, image, success: true });
    } catch (err) {
      results.push({ sku, image: null, success: false, error: err.message });
    }
  }
  return results;
}

/**
 * Derive label reference lines from a product record.
 * Matches the physical label format:
 *   BO-{barcode_id}/SN{sku_code}
 *   PO-{short_product_ref}
 */
function formatLabelLines(product) {
  const rawBarcode = product.barcode || product.sku || '';
  const boValue = rawBarcode.replace(/^RHL-/i, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const snValue = (product.sku || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const hex = (product.id || '0'.repeat(32)).replace(/-/g, '').slice(0, 8);
  const poValue = (parseInt(hex, 16) % 100000).toString().padStart(5, '0');
  return {
    barcodeText: rawBarcode,
    line1: `BO-${boValue}/SN${snValue}`,
    line2: `PO-${poValue}`
  };
}

/**
 * Generate a print-ready HTML label page for a single product.
 */
async function generateLabelHtml(product) {
  const { barcodeText, line1, line2 } = formatLabelLines(product);
  const png = await generateBarcode(barcodeText);
  const base64 = png.toString('base64');
  const productName = [product.name, product.size].filter(Boolean).join(' - ');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${productName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #fff; }
  .label { text-align: center; padding: 12px 16px; border: 1px solid #ccc; display: inline-block; width: 280px; }
  .product-name { font-size: 14px; font-weight: 700; margin-bottom: 8px; }
  .barcode-img { width: 100%; max-width: 240px; display: block; margin: 0 auto; }
  .ref1, .ref2 { font-size: 11px; font-family: monospace; letter-spacing: 0.05em; margin-top: 3px; }
  @media print { body { min-height: unset; } .label { border: none; } }
</style>
</head>
<body>
  <div class="label">
    <p class="product-name">${productName}</p>
    <img class="barcode-img" src="data:image/png;base64,${base64}" />
    <p class="ref1">${line1}</p>
    <p class="ref2">${line2}</p>
  </div>
</body>
</html>`;
}

module.exports = { generateBarcode, generateBarcodeString, generateBulkBarcodes, generateLabelHtml, formatLabelLines };
