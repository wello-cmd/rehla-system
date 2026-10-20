// Structural readiness check only: Supabase still verifies the actual key.
function isServiceRoleKey(key) {
  if (typeof key !== 'string' || !key) return false;
  if (key.startsWith('sb_secret_') && key.length > 'sb_secret_'.length) return true;
  try {
    const parts = key.split('.');
    if (parts.length !== 3) return false;
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'service_role';
  } catch {
    return false;
  }
}

module.exports = { isServiceRoleKey };
