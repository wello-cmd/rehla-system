const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
let db;
const actor = '00000000-0000-4000-8000-000000000001';
const product = '00000000-0000-4000-8000-000000000002';
const variant = '00000000-0000-4000-8000-000000000003';
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
    await db.exec(fs.readFileSync(path.join(dir,file),'utf8').replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g,''));
  }
  await db.exec(`INSERT INTO auth.users VALUES ('${actor}');
    INSERT INTO user_profiles(id,staff_id,name,email,role) VALUES ('${actor}','TEST','Tester','test@example.com','admin');
    INSERT INTO products(id,sku,name,price,cost_per_unit,stock_quantity) VALUES ('${product}','PARENT','Test shirt',100,40,10);
    INSERT INTO product_variants(id,product_id,sku,price,stock_quantity) VALUES ('${variant}','${product}','SHIRT-S',NULL,10);`);
});
after(async () => { if(db) await db.close(); });
const checkout = (key, overrides = {}) => db.query('SELECT rehla_checkout($1::jsonb,$2::uuid,$3::text) AS result', [JSON.stringify({items:[{variant_id:variant,quantity:1}],payment_method:'cash',amount_received:100,...overrides}),actor,key]);
const stock = async () => (await db.query('SELECT stock_quantity FROM product_variants WHERE id=$1',[variant])).rows[0].stock_quantity;
test('checkout preserves null variant price fallback, creates invoice lines and retries exactly once', async () => {
  const first = (await checkout('sale-one')).rows[0].result;
  assert.equal(first.total,100); assert.equal(first.change,0); assert.equal(await stock(),9);
  const retry = (await checkout('sale-one')).rows[0].result;
  assert.equal(retry.order_id,first.order_id); assert.equal(await stock(),9);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM invoice_items')).rows[0].n,1);
  await assert.rejects(checkout('sale-one',{amount_received:150}),/different|reused/i);
});
test('negative, fractional, missing quantities and invalid payments leave stock unchanged', async () => {
  const initial=await stock();
  for(const quantity of [-1,0,1.5,null,'NaN']) await assert.rejects(checkout('bad-'+quantity,{items:[{variant_id:variant,quantity}]}));
  await assert.rejects(checkout('underpaid',{amount_received:1}),/received|payment/i);
  await assert.rejects(checkout('discount',{discount_amount:101}),/discount/i);
  await assert.rejects(checkout('method',{payment_method:'garbage'}),/payment/i);
  assert.equal(await stock(),initial);
});
test('duplicate cart lines cannot oversell and later failures roll back every write', async () => {
  const initial=await stock();
  await assert.rejects(checkout('oversell',{items:[{variant_id:variant,quantity:initial},{variant_id:variant,quantity:1}],amount_received:10000}),/stock/i);
  assert.equal(await stock(),initial);
  await db.exec("CREATE FUNCTION fail_invoice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected invoice failure'; END; $$; CREATE TRIGGER fail_invoice BEFORE INSERT ON invoices FOR EACH ROW EXECUTE FUNCTION fail_invoice();");
  const orders=(await db.query('SELECT count(*)::int n FROM orders')).rows[0].n;
  await assert.rejects(checkout('rollback'),/injected invoice failure/);
  assert.equal(await stock(),initial); assert.equal((await db.query('SELECT count(*)::int n FROM orders')).rows[0].n,orders);
  await db.exec('DROP TRIGGER fail_invoice ON invoices;');
});
test('stock moves are atomic, logged and idempotent',async()=>{
 const initial=await stock();
 const args=[variant,-2,actor,'warehouse_exit','test',null,'scan-one'];
 const a=(await db.query('SELECT rehla_stock_move($1,$2,$3,$4,$5,$6,$7) result',args)).rows[0].result;
 await db.query('SELECT rehla_stock_move($1,$2,$3,$4,$5,$6,$7)',args);
 assert.equal(a.current_stock,initial-2); assert.equal(await stock(),initial-2);
 await assert.rejects(db.query('SELECT rehla_stock_move($1,$2,$3,$4,$5,$6,$7)',[variant,-999,actor,'warehouse_exit','test',null,'too-much']),/stock/i);
 assert.equal(await stock(),initial-2);
});
test('restocking a return resolves all items before writes and cannot run twice',async()=>{
 const initial=await stock();
 const ret=(await db.query("INSERT INTO returns(items,reason,status) VALUES ($1,'test','approved') RETURNING id",[JSON.stringify([{variant_id:variant,quantity:2}])])).rows[0].id;
 await db.query('SELECT rehla_restock_return($1,$2)',[ret,actor]);
 await db.query('SELECT rehla_restock_return($1,$2)',[ret,actor]);
 assert.equal(await stock(),initial+2);
 const invalid=(await db.query("INSERT INTO returns(items,reason,status) VALUES ($1,'test','approved') RETURNING id",[JSON.stringify([{variant_id:variant,quantity:1},{sku:'MISSING',quantity:1}])])).rows[0].id;
 await assert.rejects(db.query('SELECT rehla_restock_return($1,$2)',[invalid,actor]),/match|found/i);
 assert.equal(await stock(),initial+2);
});
test('private operational tables and RPCs are inaccessible to client roles',async()=>{
 const tables=(await db.query("SELECT relname, relrowsecurity FROM pg_class JOIN pg_namespace ON pg_namespace.oid=relnamespace WHERE nspname='public' AND relkind='r'")).rows;
 assert(tables.length>10); assert(tables.every(t=>t.relrowsecurity));
 for(const role of ['anon','authenticated']){
  assert.equal((await db.query("SELECT has_function_privilege($1,'rehla_checkout(jsonb,uuid,text)','EXECUTE') allowed",[role])).rows[0].allowed,false);
  assert.equal((await db.query("SELECT has_table_privilege($1,'products','SELECT') allowed",[role])).rows[0].allowed,false);
 }
});
test('variant edits keep parent totals in sync and persist a retry entry',async()=>{
 await db.query('UPDATE product_variants SET stock_quantity=3 WHERE id=$1',[variant]);
 assert.equal((await db.query('SELECT stock_quantity FROM products WHERE id=$1',[product])).rows[0].stock_quantity,3);
 assert.equal((await db.query('SELECT count(*)::int n FROM stock_sync_queue WHERE variant_id=$1',[variant])).rows[0].n,1);
});
test('the service role can execute checkout under RLS and records card settlement accurately',async()=>{
 await db.exec('SET ROLE service_role');
 try {
  const r=(await checkout('service-card',{payment_method:'card'})).rows[0].result;
  const payment=(await db.query('SELECT payment_method FROM payments p JOIN invoices i ON i.id=p.invoice_id WHERE i.order_id=$1',[r.order_id])).rows[0];
  assert.equal(payment.payment_method,'Card');
 } finally {await db.exec('RESET ROLE');}
});
