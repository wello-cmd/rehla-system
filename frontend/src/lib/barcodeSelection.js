function copyCount(value, minimum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(200, Math.floor(number))) : minimum;
}

export function buildBarcodeSelection(products, selections, { copies = 1, useStock = false } = {}) {
  const items = [];
  const labels = [];
  for (const product of products) {
    const selected = new Set(selections[product.id] || []);
    if (selected.has('__product__')) {
      const count = copyCount(useStock ? product.stock_quantity : copies, useStock ? 0 : 1);
      if (count) {
        items.push({ product_id: product.id, variant_ids: [] });
        labels.push({ productId: product.id, variantId: null, copies: count });
      }
      continue;
    }
    const variants = (product.variants || []).filter(variant => selected.has(variant.id));
    const variantIds = [];
    for (const variant of variants) {
      const count = copyCount(useStock ? variant.stock_quantity : copies, useStock ? 0 : 1);
      if (count) {
        variantIds.push(variant.id);
        labels.push({ productId: product.id, variantId: variant.id, copies: count });
      }
    }
    if (variantIds.length) items.push({ product_id: product.id, variant_ids: variantIds });
  }
  return { items, labels, total: labels.reduce((sum, label) => sum + label.copies, 0) };
}

export function barcodeCopies(plan, item) {
  return plan.labels.find(label => label.productId === item.id && label.variantId === (item.variant_id || null))?.copies || 0;
}
