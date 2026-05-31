// Authentication Middleware — Supabase JWT Verification
// Verifies the Bearer token from Supabase Auth and attaches user profile

const { supabase } = require('../db/supabase');

async function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required.' });
  }

  try {
    // Verify the JWT with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }

    // Fetch user profile with role
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(403).json({ error: 'User profile not found.' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      staff_id: profile.staff_id,
      name: profile.name,
      role: profile.role,
      phone: profile.phone
    };

    next();
  } catch (err) {
    console.error('[Auth Error]', err.message);
    return res.status(403).json({ error: 'Authentication failed.' });
  }
}

module.exports = authenticate;
