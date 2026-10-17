const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

// Execute real route code while replacing only network-backed dependencies.
function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, '../src', file);
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${fs.readFileSync(filename, 'utf8')}\n})`, { console, Date, URL, process })(
    name => Object.hasOwn(mocks, name) ? mocks[name] : localRequire(name), module, module.exports);
  return module.exports;
}
function database(rows = {}, errors = {}) {
  const operations = [];
  return {
    operations,
    from(table) {
      const predicates = [];
      let single = false;
      let mutation;
      const q = {
        select() { return q; }, order() { return q; }, gte() { return q; }, lte() { return q; },
        eq(key, value) { predicates.push(row => row[key] === value); return q; },
        in(key, values) { predicates.push(row => values.includes(row[key])); return q; },
        or(expression) { predicates.push(row => expression.split(',').some(part => { const [key, , value] = part.split('.'); return row[key] === value; })); return q; },
        single() { single = true; return q; }, maybeSingle() { single = true; return q; },
        update(value) { mutation = value; return q; }, insert(value) { mutation = value; return q; },
        then(resolve, reject) {
          operations.push({ table, mutation });
          const result = (rows[table] || []).filter(row => predicates.every(predicate => predicate(row)));
          return Promise.resolve({ data: single ? result[0] || null : result, error: errors[table] || null }).then(resolve, reject);
        }
      };
      return q;
    }
  };
}
function routes(file, db, extras = {}) {
  return load(`routes/${file}.js`, {
    '../db/supabase': { supabase: db, fetchAll: async query => (await query).data, ...extras },
    '../middleware/authenticate': (req, res, next) => req.user ? next() : res.status(401).json({}),
    '../middleware/rateLimiter': () => (_req, _res, next) => next(),
    '../middleware/webhookVerify': { verifyBostaWebhook: (_req, _res, next) => next() },
    '../services/bostaClient': {},
    '../services/pdfGenerator': { generateInvoicePDF: async () => Buffer.from('pdf'), generateWaybillPDF: async () => Buffer.from('pdf') }
  });
}
async function invoke(router, method, route, values = {}) {
  const entry = router.stack.find(layer => layer.route?.path === route && layer.route.methods[method]);
  assert.ok(entry, `Missing ${method} ${route}`);
  const req = { body: {}, query: {}, params: {}, headers: {}, ...values };
  const res = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; this.done = true; return this; }, set() { return this; }, send(value) { return this.json(value); } };
  for (const layer of entry.route.stack) {
    let next = false;
    await layer.handle(req, res, () => { next = true; });
    if (res.done || !next) break;
  }
  return res;
}
const driverId = '11111111-1111-4111-8111-111111111111';
const driverToken = '22222222-2222-4222-8222-222222222222';
const driver = { id: driverId, uuid_link: driverToken, user_id: 'driver-user', status: 'active', name: 'Driver' };
const delivery = { id: 'delivery-1', driver_id: driverId, order_id: 'order-1', status: 'assigned', drivers: { user_id: 'driver-user' } };

test('invalid and expired access tokens return 401 so clients may refresh', async () => {
  const authenticate = load('middleware/authenticate.js', { '../db/supabase': { supabase: { auth: { getUser: async () => ({ data: { user: null }, error: { message: 'expired' } }) } } } });
  const res = { status(value) { this.statusCode = value; return this; }, json() { return this; } };
  await authenticate({ headers: { authorization: 'Bearer expired' } }, res, () => assert.fail('must not authenticate'));
  assert.equal(res.statusCode, 401);
});

for (const [name, rows, errors, expected] of [
  ['unlinked driver', {}, {}, 403],
  ['failed driver lookup', {}, { drivers: { message: 'database unavailable' } }, 500]
]) test(`delivery listing fails closed for ${name}`, async () => {
  const db = database({ delivery_orders: [delivery], ...rows }, errors);
  const response = await invoke(routes('deliveries', db), 'get', '/', { user: { id: 'driver-user', role: 'driver' } });
  assert.equal(response.statusCode, expected);
  assert.equal(db.operations.filter(op => op.table === 'delivery_orders').length, 0);
});

test('linked drivers only see their assigned deliveries', async () => {
  const db = database({ drivers: [driver], delivery_orders: [delivery, { ...delivery, id: 'other', driver_id: 'other' }] });
  const response = await invoke(routes('deliveries', db), 'get', '/', { user: { id: 'driver-user', role: 'driver' } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(Array.from(response.body, item => item.id), ['delivery-1']);
});

for (const [method, route] of [['get', '/'], ['get', '/summary'], ['get', '/:id'], ['get', '/:id/pdf'], ['put', '/:id/status']]) {
  test(`workers cannot access invoice ${method} ${route}`, async () => {
    const db = database();
    const response = await invoke(routes('invoices', db), method, route, { user: { role: 'worker' }, params: { id: 'invoice-1' }, body: { status: 'Paid' } });
    assert.equal(response.statusCode, 403);
    assert.equal(db.operations.length, 0);
  });
}
for (const role of ['worker', 'accountant']) test(`${role} cannot update delivery status`, async () => {
  const db = database({ delivery_orders: [delivery] });
  const response = await invoke(routes('deliveries', db), 'put', '/:id/status', { user: { id: 'someone', role }, params: { id: delivery.id }, body: { status: 'delivered' } });
  assert.equal(response.statusCode, 403);
  assert.equal(db.operations.length, 0);
});

test('drivers cannot update another driver delivery', async () => {
  const db = database({ delivery_orders: [delivery] });
  const response = await invoke(routes('deliveries', db), 'put', '/:id/status', { user: { id: 'other-driver', role: 'driver' }, params: { id: delivery.id }, body: { status: 'delivered' } });
  assert.equal(response.statusCode, 403);
  assert.equal(db.operations.some(op => op.mutation), false);
});
for (const [name, token, status, expected] of [['ordinary driver ID', driverId, 'active', 404], ['inactive driver link', driverToken, 'inactive', 404], ['active driver link', driverToken, 'active', 200], ['malformed token', 'bad,uuid_link.neq.null', 'active', 404]]) {
  test(`public orders reject ${name} unless valid active link`, async () => {
    const db = database({ drivers: [{ ...driver, status }], delivery_orders: [delivery] });
    const response = await invoke(routes('deliveries', db), 'get', '/driver/:id/orders', { params: { id: token } });
    assert.equal(response.statusCode, expected);
    if (expected === 404) assert.equal(db.operations.some(op => op.table === 'delivery_orders'), false);
    else assert.equal(response.body.driver.uuid_link, undefined);
  });
}

test('public status update rejects ordinary driver ID without writing', async () => {
  const db = database({ drivers: [driver], delivery_orders: [delivery] });
  const response = await invoke(routes('deliveries', db), 'patch', '/driver/:id/orders/:orderId/status', { params: { id: driverId, orderId: delivery.id }, body: { status: 'delivered' } });
  assert.equal(response.statusCode, 404);
  assert.equal(db.operations.some(op => op.mutation), false);
});

for (const [route, authMethod, body] of [['/login', 'signInWithPassword', { email: 'driver@example.com', password: 'password' }], ['/refresh', 'refreshSession', { refresh_token: 'refresh' }]]) {
  test(`${route} does not replace the service client auth session`, async () => {
    const db = database({ user_profiles: [{ id: 'user-1', role: 'driver' }] });
    db.auth = { [authMethod]: async () => { assert.fail('privileged service client must not sign in'); } };
    const auth = { [authMethod]: async () => ({ data: { user: { id: 'user-1', email: 'driver@example.com' }, session: { access_token: 'token', refresh_token: 'refresh-2' } }, error: null }) };
    const response = await invoke(routes('auth', db, { createAuthClient: () => ({ auth }) }), 'post', route, { body });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.token, 'token');
  });
}

for (const role of ['admin', 'ceo', 'accountant']) test(`${role} retains invoice detail and status access`, async () => {
  const db = database({ invoices: [{ id: 'invoice-1', total: 75, status: 'Draft' }] });
  let statusCall;
  db.rpc = async (name, args) => { statusCall = { name, args }; return { data: { success: true, status: 'Sent' }, error: null }; };
  const router = routes('invoices', db);
  const detail = await invoke(router, 'get', '/:id', { user: { role }, params: { id: 'invoice-1' } });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.body.total, 75);
  const updated = await invoke(router, 'put', '/:id/status', { user: { role }, params: { id: 'invoice-1' }, body: { status: 'Sent' } });
  assert.equal(updated.statusCode, 200);
  assert.equal(statusCall.name, 'rehla_set_invoice_status');
  assert.equal(statusCall.args.p_invoice_id, 'invoice-1');
  assert.equal(statusCall.args.p_status, 'Sent');
});

for (const [role, id] of [['dispatcher', 'dispatcher-user'], ['driver', 'driver-user']]) test(`${role} may update an authorized delivery`, async () => {
  const db = database({ delivery_orders: [delivery] });
  const response = await invoke(routes('deliveries', db), 'patch', '/orders/:id/status', { user: { role, id }, params: { id: delivery.id }, body: { status: 'out_for_delivery' } });
  assert.equal(response.statusCode, 200);
  assert.equal(db.operations.some(op => op.table === 'delivery_orders' && op.mutation?.status === 'out_for_delivery'), true);
});

for (const [method, route] of [['get', '/summary'], ['get', '/analytics'], ['get', '/:id/waybill'], ['get', '/bosta/label/:shipmentId']]) test(`drivers cannot bypass ownership through ${route}`, async () => {
  const db = database({ delivery_orders: [delivery] });
  const response = await invoke(routes('deliveries', db), method, route, { user: { role: 'driver', id: 'driver-user' }, params: { id: delivery.id, shipmentId: 'shipment' } });
  assert.equal(response.statusCode, 403);
  assert.equal(db.operations.length, 0);
});

test('public driver token cannot update a different driver delivery', async () => {
  const db = database({ drivers: [driver], delivery_orders: [{ ...delivery, driver_id: 'someone-else' }] });
  const response = await invoke(routes('deliveries', db), 'patch', '/driver/:id/orders/:orderId/status', { params: { id: driverToken, orderId: delivery.id }, body: { status: 'delivered' } });
  assert.equal(response.statusCode, 404);
  assert.equal(db.operations.some(op => op.mutation), false);
});

test('public driver lookup errors return no orders and cause no writes', async () => {
  const db = database({ drivers: [driver], delivery_orders: [delivery] }, { drivers: { message: 'unavailable' } });
  const response = await invoke(routes('deliveries', db), 'get', '/driver/:id/orders', { params: { id: driverToken } });
  assert.equal(response.statusCode, 500);
  assert.equal(db.operations.some(op => op.table === 'delivery_orders'), false);
});

test('missing access token and missing profile remain separate authentication and authorization failures', async () => {
  const db = database();
  db.auth = { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) };
  const authenticate = load('middleware/authenticate.js', { '../db/supabase': { supabase: db } });
  for (const [headers, expected] of [[{}, 401], [{ authorization: 'Bearer valid' }, 403]]) {
    const res = { status(value) { this.statusCode = value; return this; }, json() { return this; } };
    await authenticate({ headers }, res, () => assert.fail('must not authenticate'));
    assert.equal(res.statusCode, expected);
  }
});

test('authentication rejects a token supplied with the wrong authorization scheme', async () => {
  const db = database({ user_profiles: [{ id: 'user-1', role: 'admin' }] });
  db.auth = { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) };
  const authenticate = load('middleware/authenticate.js', { '../db/supabase': { supabase: db } });
  const res = { status(value) { this.statusCode = value; return this; }, json() { return this; } };
  let authenticated = false;
  await authenticate({ headers: { authorization: 'Basic stolen-token' } }, res, () => { authenticated = true; });
  assert.equal(authenticated, false);
  assert.equal(res.statusCode, 401);
});

for (const amount of [-1, 0, 'NaN', 'Infinity', true, [], {}, null, 0.001]) test(`invoice payments reject invalid amount ${JSON.stringify(amount)} before database writes`, async () => {
  const db = database({ invoices: [{ id: 'invoice-1', total: 100 }] });
  const response = await invoke(routes('invoices', db), 'post', '/:id/payments', { user: { id: 'actor', role: 'accountant' }, params: { id: 'invoice-1' }, body: { amount, payment_method: 'Cash' } });
  assert.equal(response.statusCode, 400);
  assert.equal(db.operations.length, 0);
});

test('invoice creation delegates one atomic header/items transaction and returns saved values', async () => {
  const db = database();
  const calls = [];
  db.rpc = async (name, args) => { calls.push({ name, args }); return { data: { id: 'saved', total: 24.5, items: [{ description: 'Shirt', subtotal: 24.5 }] }, error: null }; };
  const body = { customer_name: 'Client', notes: 'Note', items: [{ description: 'Shirt', quantity: 2, unit_price: 12.25 }] };
  const response = await invoke(routes('invoices', db), 'post', '/', { user: { id: 'actor', role: 'admin' }, body });
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.id, 'saved');
  assert.equal(response.body.items[0].subtotal, 24.5);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'rehla_create_invoice');
  assert.equal(calls[0].args.p_payload.notes, 'Note');
  assert.equal(calls[0].args.p_actor, 'actor');
  assert.equal(db.operations.length, 0);
});

test('invoice payment delegates amount, method and actor to one transaction', async () => {
  const db = database();
  let call;
  db.rpc = async (name, args) => { call = { name, args }; return { data: { id: 'payment', amount: 12.25 }, error: null }; };
  const response = await invoke(routes('invoices', db), 'post', '/:id/payments', { user: { id: 'actor', role: 'accountant' }, params: { id: 'invoice-1' }, body: { amount: '12.25', payment_method: 'Cash' } });
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.amount, 12.25);
  assert.equal(call.name, 'rehla_record_payment');
  assert.equal(call.args.p_invoice_id, 'invoice-1');
  assert.equal(call.args.p_amount, 12.25);
  assert.equal(call.args.p_method, 'Cash');
  assert.equal(call.args.p_actor, 'actor');
  assert.equal(db.operations.length, 0);
});

test('invoice payment not found and insufficient balance errors map to meaningful status', async () => {
  for (const [method, route, body, code, expected] of [
    ['post', '/:id/payments', { amount: 1, payment_method: 'Cash' }, 'P0002', 404],
    ['put', '/:id/status', { status: 'Paid' }, '22023', 400]
  ]) {
    const db = database();
    db.rpc = async () => ({ data: null, error: { code, message: 'Invalid invoice operation' } });
    const response = await invoke(routes('invoices', db), method, route, { user: { id: 'actor', role: 'accountant' }, params: { id: 'invoice-1' }, body });
    assert.equal(response.statusCode, expected);
    assert.equal(db.operations.length, 0);
  }
});
for (const [file,route] of [['financial','/pl'],['finance','/revenue'],['analytics','/sales'],['customers','/'],['channels','/comparison'],['shopify','/orders'],['expenses','/']]) {
 test(`worker cannot read private ${file} reports`,async()=>{
  const db=database();
  const router=load(`routes/${file}.js`,{
   '../db/supabase':{supabase:db,fetchAll:async q=>(await q).data},
   '../middleware/authenticate':(_req,_res,next)=>next(),
   '../services/shopifySync':{},'../middleware/webhookVerify':{verifyShopifyWebhook:(_req,_res,next)=>next()}
  });
  const response=await invoke(router,'get',route,{user:{id:'worker-id',role:'worker'}});
  assert.equal(response.statusCode,403);
  assert.equal(db.operations.length,0);
 });
}
