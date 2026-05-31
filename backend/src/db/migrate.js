require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { supabase } = require('./supabase');

async function migrate() {
  console.log('Starting migration script...');

  const schemaPath = path.join(__dirname, 'migrations', '001_initial_schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error(`Error: Schema file not found at ${schemaPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(schemaPath, 'utf8');

  try {
    console.log('Sending SQL schema to Supabase RPC run_sql...');
    const { data, error } = await supabase.rpc('run_sql', { query: sql });
    
    if (error) {
      console.warn('\n[Notice] Direct RPC migration failed (normal if "run_sql" function is not installed).');
      console.log('Please copy the contents of the SQL migration file and paste them into the SQL Editor in your Supabase Dashboard.');
      console.log(`Schema file location: ${schemaPath}\n`);
    } else {
      console.log('✓ Schema applied successfully via RPC!');
    }
  } catch (err) {
    console.warn('\n[Notice] Migration via API client failed.');
    console.log('To set up your database schema:');
    console.log('1. Go to your Supabase Dashboard (https://supabase.com)');
    console.log('2. Click on "SQL Editor" in the left sidebar');
    console.log('3. Click "New Query"');
    console.log('4. Copy the SQL commands from:');
    console.log(`   ${schemaPath}`);
    console.log('5. Paste them into the editor and click "Run"');
    console.log('');
  }
}

migrate();
