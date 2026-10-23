import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBarcodeSelection, barcodeCopies } from '../src/lib/barcodeSelection.js';

const products = [
  { id: 'p1', stock_quantity: 500, variants: [{ id: 'v1', stock_quantity: 250 }, { id: 'v2', stock_quantity: 3.9 }] },
  { id: 'p2', stock_quantity: -4, variants: [] },
];

test('deselecting all variants produces no payload, labels, or copies', () => {
  const plan = buildBarcodeSelection(products, { p1: [] }, { copies: 2 });
  assert.deepEqual(plan.items, []);
  assert.equal(plan.total, 0);
  assert.equal(barcodeCopies(plan, { id: 'p1', variant_id: null }), 0);
});

test('only explicit product selection creates a product-level barcode', () => {
  const plan = buildBarcodeSelection(products, { p2: ['__product__'], p1: ['unknown'] }, { copies: 2 });
  assert.deepEqual(plan.items, [{ product_id: 'p2', variant_ids: [] }]);
  assert.equal(plan.total, 2);
  assert.equal(barcodeCopies(plan, { id: 'p2', variant_id: null }), 2);
});

test('selected variants are deduplicated and response copies match preview', () => {
  const plan = buildBarcodeSelection(products, { p1: ['v1', 'v1', 'v2'] }, { copies: 4.9 });
  assert.deepEqual(plan.items, [{ product_id: 'p1', variant_ids: ['v1', 'v2'] }]);
  assert.equal(plan.total, 8);
  assert.equal(barcodeCopies(plan, { id: 'p1', variant_id: 'v1' }), 4);
  assert.equal(barcodeCopies(plan, { id: 'p1', variant_id: 'unselected' }), 0);
  assert.equal(barcodeCopies(plan, { id: 'p1', variant_id: null }), 0);
});

test('manual copies are whole numbers between one and 200', () => {
  for (const [copies, expected] of [[999, 200], [0, 1], [-4, 1], ['', 1], ['bad', 1]]) {
    const plan = buildBarcodeSelection(products, { p1: ['v1'] }, { copies });
    assert.equal(plan.total, expected);
    assert.equal(barcodeCopies(plan, { id: 'p1', variant_id: 'v1' }), expected);
  }
});

test('stock copies are nonnegative whole quantities capped at 200 per label', () => {
  const plan = buildBarcodeSelection(products, { p1: ['v1', 'v2'], p2: ['__product__'] }, { useStock: true });
  assert.equal(plan.total, 203);
  assert.deepEqual(plan.items, [{ product_id: 'p1', variant_ids: ['v1', 'v2'] }]);
  assert.equal(barcodeCopies(plan, { id: 'p1', variant_id: 'v1' }), 200);
  assert.equal(barcodeCopies(plan, { id: 'p1', variant_id: 'v2' }), 3);
  assert.equal(barcodeCopies(plan, { id: 'p2', variant_id: null }), 0);
});
