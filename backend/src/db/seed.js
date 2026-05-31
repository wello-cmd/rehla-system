require('dotenv').config();
const { supabase } = require('./supabase');

async function seed() {
  console.log('Starting seed operations...');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env to seed the database.');
    process.exit(1);
  }

  try {
    // 1. Seed Warehouses
    console.log('Seeding Warehouses...');
    const { data: whs, error: whErr } = await supabase
      .from('warehouses')
      .upsert([
        { code: 'WH-ZMLK', name: 'Zamalek Hub', location: '12 Zamalek Rd, Cairo' },
        { code: 'WH-MADI', name: 'Maadi Warehouse', location: 'Degla, Maadi, Cairo' },
        { code: 'WH-OCT', name: '6th of October Center', location: 'Industrial Area, 6th of October' }
      ], { onConflict: 'code' })
      .select();

    if (whErr) throw whErr;
    console.log(`✓ Seeded ${whs.length} warehouses`);

    const whMap = whs.reduce((acc, wh) => ({ ...acc, [wh.code]: wh.id }), {});

    // 2. Seed Auth Users & User Profiles
    console.log('Seeding Auth Users & Profiles...');
    const usersToCreate = [
      { email: 'ceo@rehla.com', password: 'rehla123', name: 'Sherif CEO', staff_id: 'CEO-01', role: 'ceo', phone: '+201000000001' },
      { email: 'admin@rehla.com', password: 'rehla123', name: 'Mostafa Admin', staff_id: 'ADMIN-01', role: 'admin', phone: '+201000000002' },
      { email: 'worker@rehla.com', password: 'rehla123', name: 'Ahmed Worker', staff_id: 'WORKER-01', role: 'worker', phone: '+201000000003' },
      { email: 'driver@rehla.com', password: 'rehla123', name: 'Ahmed Hassan', staff_id: 'DRIVER-01', role: 'driver', phone: '+201100000001', zone: 'Maadi' },
      { email: 'driver2@rehla.com', password: 'rehla123', name: 'Karim Mostafa', staff_id: 'DRIVER-02', role: 'driver', phone: '+201100000002', zone: 'Zamalek' },
      { email: 'driver3@rehla.com', password: 'rehla123', name: 'Omar Sayed', staff_id: 'DRIVER-03', role: 'driver', phone: '+201100000003', zone: '6th October' }
    ];

    const driverProfiles = [];

    for (const u of usersToCreate) {
      // Check if user profile already exists
      const { data: existingProfile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('email', u.email)
        .maybeSingle();

      let userId;

      if (!existingProfile) {
        // Create auth user
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: u.email,
          password: u.password,
          email_confirm: true
        });

        if (authError) {
          console.warn(`[Warn] Could not create auth user for ${u.email}: ${authError.message}`);
          continue;
        }

        userId = authData.user.id;

        // Create profile
        const { error: profileError } = await supabase
          .from('user_profiles')
          .insert({
            id: userId,
            staff_id: u.staff_id,
            name: u.name,
            email: u.email,
            role: u.role,
            phone: u.phone
          });

        if (profileError) {
          await supabase.auth.admin.deleteUser(userId);
          throw profileError;
        }
        console.log(`✓ Created user & profile: ${u.email}`);
      } else {
        userId = existingProfile.id;
        console.log(`- Profile already exists for: ${u.email}`);
      }

      if (u.role === 'driver') {
        driverProfiles.push({ user_id: userId, name: u.name, phone: u.phone, zone: u.zone });
      }
    }

    // 3. Seed Drivers
    if (driverProfiles.length > 0) {
      console.log('Seeding Drivers manifest links...');
      for (const dp of driverProfiles) {
        const { data: existingDriver } = await supabase
          .from('drivers')
          .select('id')
          .eq('user_id', dp.user_id)
          .maybeSingle();

        if (!existingDriver) {
          const { error: driverErr } = await supabase
            .from('drivers')
            .insert({
              user_id: dp.user_id,
              name: dp.name,
              phone: dp.phone,
              zone: dp.zone,
              status: 'active'
            });
          if (driverErr) throw driverErr;
        } else {
          const { error: driverErr } = await supabase
            .from('drivers')
            .update({
              name: dp.name,
              phone: dp.phone,
              zone: dp.zone
            })
            .eq('id', existingDriver.id);
          if (driverErr) throw driverErr;
        }
      }
      console.log('✓ Seeded drivers list.');
    }

    // 4. Seed Products
    console.log('Seeding Catalog Products: Skipped (Will sync live from Shopify)');

    // 5. Seed Historical Expenses
    console.log('Seeding Expenses history: Skipped (Live system uses real entries)');

    console.log('');
    console.log('=============================================');
    console.log('  Database Seeding Completed Successfully!  ');
    console.log('=============================================');
    console.log('');
  } catch (err) {
    console.error('Fatal Seeding Error:', err.message || err);
  }
}

seed();
