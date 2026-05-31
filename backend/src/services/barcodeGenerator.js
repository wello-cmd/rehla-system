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

module.exports = { generateBarcode, generateBarcodeString, generateBulkBarcodes };
