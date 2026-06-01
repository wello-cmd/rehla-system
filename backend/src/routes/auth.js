// Auth Routes — Login, profile, user management
const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const rateLimit = require('../middleware/rateLimiter');

// Rate limit all auth endpoints
router.use(rateLimit(100, 15 * 60 * 1000));

// POST /api/auth/login — Supabase Auth sign-in with rate limiting
router.post('/login', rateLimit(20, 15 * 60 * 1000), async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required.' });
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return res.status(401).json({ error: error.message || 'Invalid credentials.' });
    }

    // Fetch user profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    res.json({
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        staff_id: profile?.staff_id,
        name: profile?.name,
        role: profile?.role,
        phone: profile?.phone
      }
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/auth/me — Get current user profile
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/register — Admin creates new user (NFR-SC-06)
router.post('/register', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  const { email, password, name, staff_id, role, phone } = req.body;
  if (!email || !password || !name || !staff_id || !role) {
    return res.status(400).json({ error: 'email, password, name, staff_id, and role are required.' });
  }

  const validRoles = ['ceo', 'admin', 'dispatcher', 'worker', 'driver', 'accountant'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Must be: ${validRoles.join(', ')}` });
  }

  try {
    // Create Supabase Auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    // Create profile
    const { error: profileError } = await supabase
      .from('user_profiles')
      .insert({
        id: authData.user.id,
        staff_id: staff_id.toUpperCase(),
        name,
        email,
        role,
        phone: phone || ''
      });

    if (profileError) {
      // Rollback auth user
      await supabase.auth.admin.deleteUser(authData.user.id);
      return res.status(400).json({ error: profileError.message });
    }

    res.status(201).json({
      success: true,
      user: { id: authData.user.id, email, name, staff_id, role }
    });
  } catch (err) {
    console.error('[Auth] Register error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/auth/users — List all users (admin only)
router.get('/users', authenticate, authorize('admin', 'ceo'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
