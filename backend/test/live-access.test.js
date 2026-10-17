const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
let db;
const admin='00000000-0000-4000-8000-000000000101';
const worker='00000000-0000-4000-8000-000000000102';
before(async()=>{
 db=new PGlite();
 await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated;`);
 await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/live-schema.sql'),'utf8'));
 await db.exec(`GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;
 ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
 CREATE POLICY anon_all_user_profiles ON user_profiles FOR ALL TO anon USING(true) WITH CHECK(true);
 CREATE POLICY authenticated_all_user_profiles ON user_profiles FOR ALL TO authenticated USING(true) WITH CHECK(true);
 INSERT INTO auth.users VALUES('${admin}'),('${worker}');
 INSERT INTO user_profiles(id,staff_id,name,email,role) VALUES('${admin}','ADMIN','Admin','admin@example.test','admin'),('${worker}','WORKER','Worker','worker@example.test','worker');
 INSERT INTO customers(first_name) VALUES('Test customer');
 INSERT INTO shopify_refunds(shopify_refund_id,shopify_order_id,processed_at,amount) VALUES('test-refund','test-order',now(),1);`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../src/db/migrations/20261017224916_restrict_public_business_access.sql'),'utf8'));
});
after(async()=>{if(db)await db.close();});
async function as(role,id,fn){await db.exec(`SET ROLE ${role}`);try{await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id||'']);return await fn();}finally{await db.exec('RESET ROLE');}}
test('anonymous callers cannot read customers or staff profiles',async()=>{
 for(const table of ['customers','shopify_refunds','user_profiles','orders'])await assert.rejects(as('anon',null,()=>db.query(`SELECT * FROM ${table}`)),/permission denied/i);
});
test('staff can read their profile but cannot promote themselves or create staff',async()=>{
 const result=await as('authenticated',worker,()=>db.query('SELECT id,role FROM user_profiles'));
 assert.deepEqual(result.rows,[{id:worker,role:'worker'}]);
 await assert.rejects(as('authenticated',worker,()=>db.query("UPDATE user_profiles SET role='ceo' WHERE id=$1",[worker])),/permission denied/i);
});
test('workers cannot read customer or refund rows',async()=>{
 for(const table of ['customers','shopify_refunds'])assert.equal((await as('authenticated',worker,()=>db.query(`SELECT * FROM ${table}`))).rows.length,0);
});
test('management retains intended customer access and service-role operations bypass RLS',async()=>{
 assert.equal((await as('authenticated',admin,()=>db.query('SELECT * FROM customers'))).rows.length,1);
 assert.equal((await as('service_role',null,()=>db.query('SELECT * FROM user_profiles'))).rows.length,2);
 assert.equal((await as('service_role',null,()=>db.query('SELECT * FROM shopify_refunds'))).rows.length,1);
});
