const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
let db;
const actor = '00000000-0000-4000-8000-000000000010';
const worker = '00000000-0000-4000-8000-000000000011';
before(async () => {
  db = new PGlite();
  await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';`);
  const dir = path.join(__dirname, '../src/db/migrations');
  if (process.env.REHLA_LIVE_SCHEMA_TEST === '1') {
    await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/live-schema.sql'),'utf8'));
  }
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql') && (process.env.REHLA_LIVE_SCHEMA_TEST !== '1' || f.startsWith('202610'))).sort()) {
    await db.exec(fs.readFileSync(path.join(dir, file), 'utf8').replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g, ''));
  }
  await db.exec(`INSERT INTO auth.users VALUES ('${actor}'), ('${worker}');
    INSERT INTO user_profiles(id,staff_id,name,email,role) VALUES
      ('${actor}','FINANCE','Accountant','finance@example.com','admin'),
      ('${worker}','WORKER','Worker','worker@example.com','worker');`);
});
after(async () => { if (db) await db.close(); });
const payload = { customer_name: 'Example customer', customer_email: 'client@example.com', issue_date: '2026-10-15', due_date: '2026-10-30', notes: 'Keep this note', items: [{ description: 'Shirt', quantity: 2, unit_price: 12.25 }] };
const create = async (data = payload, user = actor) => (await db.query('SELECT rehla_create_invoice($1::jsonb,$2::uuid) AS result', [JSON.stringify(data), user])).rows[0].result;
const pay = async (id, amount, method = 'Cash', user = actor) => (await db.query('SELECT rehla_record_payment($1::uuid,$2::numeric,$3::text,$4::uuid) AS result', [id, amount, method, user])).rows[0].result;
const status = (id, value) => db.query('SELECT rehla_set_invoice_status($1::uuid,$2::text,$3::uuid)', [id, value, actor]);
const count = async table => (await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n;

test('invoice creation preserves fields, rounds line amounts and creates unique numbers', async () => {
  const invoice = await create();
  assert.equal(invoice.customer_name, 'Example customer');
  assert.equal(invoice.issue_date, '2026-10-15');
  assert.equal(invoice.due_date, '2026-10-30');
  assert.equal(invoice.customer_email, 'client@example.com');
  assert.equal(invoice.notes, 'Keep this note');
  assert.equal(Number(invoice.total), 24.5);
  assert.equal(invoice.items.length, 1);
  assert.equal(invoice.items[0].description, 'Shirt');
  assert.equal(Number(invoice.items[0].subtotal), 24.5);
  const other = await create();
  assert.notEqual(other.invoice_number, invoice.invoice_number);
  assert.match(invoice.invoice_number, /^INV-\d{4}-\d{4,}$/);
});

test('invalid invoice quantities, prices, totals and actor never leave partial invoices', async () => {
  const initial = await count('invoices');
  for (const item of [
    { description: 'Bad', quantity: -1, unit_price: 5 },
    { description: 'Bad', quantity: 1.5, unit_price: 5 },
    { description: 'Bad', quantity: 1, unit_price: -5 },
    { description: 'Bad', quantity: 1, unit_price: 'NaN' },
    { description: 'Bad', quantity: 1, unit_price: 'Infinity' },
    { description: '', quantity: 1, unit_price: 5 }
  ]) await assert.rejects(create({ ...payload, items: [payload.items[0], item] }));
  await assert.rejects(create({ ...payload, items: [] }));
  await assert.rejects(create(payload, worker), /permission|role|allowed/i);
  assert.equal(await count('invoices'), initial);
});

test('a failing invoice line insert rolls back header and every line', async () => {
  const initial = await count('invoices');
  const initialItems = await count('invoice_items');
  await db.exec("CREATE FUNCTION fail_invoice_item() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.description = 'FAIL' THEN RAISE EXCEPTION 'injected item failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER fail_invoice_item BEFORE INSERT ON invoice_items FOR EACH ROW EXECUTE FUNCTION fail_invoice_item();");
  await assert.rejects(create({ ...payload, items: [...payload.items, { description: 'FAIL', quantity: 1, unit_price: 1 }] }), /injected item failure/);
  assert.equal(await count('invoices'), initial);
  assert.equal(await count('invoice_items'), initialItems);
  await db.exec('DROP TRIGGER fail_invoice_item ON invoice_items;');
});

test('partial payments keep balance open; final payment atomically marks Paid', async () => {
  const invoice = await create();
  const first = await pay(invoice.id, 10, 'Bank Transfer');
  assert.equal(Number(first.amount), 10);
  assert.equal(first.payment_method, 'Bank Transfer');
  assert.equal((await db.query('SELECT status FROM invoices WHERE id=$1', [invoice.id])).rows[0].status, 'Draft');
  await pay(invoice.id, 14.5);
  assert.equal((await db.query('SELECT status FROM invoices WHERE id=$1', [invoice.id])).rows[0].status, 'Paid');
});

test('invalid payments, unknown invoice and unauthorized actor create no payment', async () => {
  const invoice = await create();
  const initial = await count('payments');
  for (const amount of [-1, 0, 'NaN', 'Infinity', '-Infinity', null]) await assert.rejects(pay(invoice.id, amount));
  await assert.rejects(pay(invoice.id, 1, 'garbage'));
  await assert.rejects(pay('99999999-9999-4999-8999-999999999999', 1), /not found/i);
  await assert.rejects(pay(invoice.id, 1, 'Cash', worker), /permission|role|allowed/i);
  assert.equal(await count('payments'), initial);
});

test('invoice status cannot claim Paid without recorded payment coverage', async () => {
  const invoice = await create();
  await assert.rejects(status(invoice.id, 'Paid'), /payment|balance/i);
  await pay(invoice.id, 10);
  await assert.rejects(status(invoice.id, 'Paid'), /payment|balance/i);
  await status(invoice.id, 'Sent');
  await pay(invoice.id, 14.5);
  await status(invoice.id, 'Paid');
  assert.equal((await db.query('SELECT status FROM invoices WHERE id=$1', [invoice.id])).rows[0].status, 'Paid');
});

test('failure marking an invoice Paid rolls back its payment', async () => {
  const invoice = await create();
  const initial = await count('payments');
  await db.exec("CREATE FUNCTION fail_paid_status() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status = 'Paid' THEN RAISE EXCEPTION 'injected payment failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER fail_paid_status BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION fail_paid_status();");
  await assert.rejects(pay(invoice.id, 24.5), /injected payment failure/);
  assert.equal(await count('payments'), initial);
  assert.equal((await db.query('SELECT status FROM invoices WHERE id=$1', [invoice.id])).rows[0].status, 'Draft');
  await db.exec('DROP TRIGGER fail_paid_status ON invoices;');
});

test('invoice mutation RPCs cannot be executed by public client roles', async () => {
  for (const role of ['anon', 'authenticated']) {
    for (const name of ['rehla_create_invoice(jsonb,uuid)', 'rehla_record_payment(uuid,numeric,text,uuid)', 'rehla_set_invoice_status(uuid,text,uuid)']) {
      assert.equal((await db.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') allowed', [role, name])).rows[0].allowed, false);
    }
  }
});

test('missing actor cannot create invoices or payments', async () => {
  const invoice = await create();
  await assert.rejects(create(payload, null), /role|allowed/i);
  await assert.rejects(pay(invoice.id, 1, 'Cash', null), /role|allowed/i);
});

test('service role executes invoice transactions with RLS enabled', async () => {
  await db.exec('SET ROLE service_role');
  try {
    const invoice = await create();
    await pay(invoice.id, 24.5);
    await status(invoice.id, 'Paid');
    assert.equal((await db.query('SELECT status FROM invoices WHERE id=$1', [invoice.id])).rows[0].status, 'Paid');
  } finally {
    await db.exec('RESET ROLE');
  }
});
