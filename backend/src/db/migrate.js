require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { supabase } = require('./supabase');

async function migrate() {
  console.log('Starting migration script...');

  const migrationsDir = path.join(__dirname, 'migrations');
  const migrationFiles = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir).filter(file => file.endsWith('.sql')).sort()
    : [];

  if (migrationFiles.length === 0) {
    console.error(`Error: No SQL migration files found at ${migrationsDir}`);
    process.exit(1);
  }

  const sql = migrationFiles
    .map(file => `-- ${file}\n${fs.readFileSync(path.join(migrationsDir, file), 'utf8')}`)
    .join('\n\n');

  try {
    console.log(`Sending ${migrationFiles.length} SQL migration(s) to Supabase RPC run_sql...`);
    const { data, error } = await supabase.rpc('run_sql', { query: sql });
    
    if (error) {
      console.warn('\n[Notice] Direct RPC migration failed (normal if "run_sql" function is not installed).');
      console.log('Please copy the contents of the SQL migration file and paste them into the SQL Editor in your Supabase Dashboard.');
      console.log(`Migration folder location: ${migrationsDir}\n`);
    } else {
      console.log('✓ Schema applied successfully via RPC!');
    }
  } catch (err) {
    console.warn('\n[Notice] Migration via API client failed.');
    console.log('To set up your database schema:');
    console.log('1. Go to your Supabase Dashboard (https://supabase.com)');
    console.log('2. Click on "SQL Editor" in the left sidebar');
    console.log('3. Click "New Query"');
    console.log('4. Copy the SQL commands from the migration files in:');
    console.log(`   ${migrationsDir}`);
    console.log('5. Paste them into the editor and click "Run"');
    console.log('');
  }
}

migrate();
