import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareCheckoutAttempt } from '../src/lib/checkoutAttempt.js';

const sale = { items: [{ id: 'product-1', quantity: 2 }], payment_method: 'Cash', amount_received: 100 };

test('retrying the same sale reuses its idempotency key and exact request payload', () => {
  const first = prepareCheckoutAttempt(null, sale);
  const retry = prepareCheckoutAttempt(first, structuredClone(sale));
  assert.equal(retry.payload.idempotency_key, first.payload.idempotency_key);
  assert.deepEqual(retry.payload, first.payload);
  assert.match(first.payload.idempotency_key, /^[a-f0-9-]{36}$/);
});

test('editing checkout input starts a distinct sale attempt', () => {
  const first = prepareCheckoutAttempt(null, sale);
  const changed = prepareCheckoutAttempt(first, { ...sale, amount_received: 200 });
  assert.notEqual(changed.payload.idempotency_key, first.payload.idempotency_key);
  assert.equal(changed.payload.amount_received, 200);
});

test('clearing a completed attempt gives a new sale its own key even with identical items', () => {
  const first = prepareCheckoutAttempt(null, sale);
  const nextSale = prepareCheckoutAttempt(null, sale);
  assert.notEqual(nextSale.payload.idempotency_key, first.payload.idempotency_key);
});

test('an attempt keeps its submitted items when later cart data changes', () => {
  const cartPayload = structuredClone(sale);
  const first = prepareCheckoutAttempt(null, cartPayload);
  cartPayload.items[0].quantity = 8;
  assert.equal(first.payload.items[0].quantity, 2);
});
