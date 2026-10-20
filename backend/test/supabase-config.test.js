const test = require('node:test');
const assert = require('node:assert/strict');
const { isServiceRoleKey } = require('../src/db/supabaseCredentials');
const jwt = role => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
for (const key of [undefined, '', 'garbage', 'sb_publishable_example', jwt('anon'), jwt('authenticated'), jwt(undefined)]) {
  test(`rejects nonprivileged service credential variant ${typeof key === 'string' ? key.split('.')[0] : 'missing'}`, () => assert.equal(isServiceRoleKey(key), false));
}
for (const key of ['sb_secret_example', jwt('service_role')]) {
  test('accepts a server secret or legacy service-role key', () => assert.equal(isServiceRoleKey(key), true));
}

test('an anon service key leaves the process running but cannot authorize privileged requests', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const filename = path.resolve(__dirname, '../src/db/supabase.js');
  const calls = [];
  const logs = [];
  const module = { exports: {} };
  const anonKey = jwt('anon');
  vm.runInNewContext(`(function(require,module,exports){${fs.readFileSync(filename, 'utf8')}\n})`, {
    process: { env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: anonKey, SUPABASE_ANON_KEY: 'public-auth-key' } },
    console: { warn: message => logs.push(message), error: message => logs.push(message) }
  })(name => name === '@supabase/supabase-js'
    ? { createClient: (_url, key) => { calls.push(key); return {}; } }
    : require('../src/db/supabaseCredentials'), module, module.exports);
  assert.equal(module.exports.supabaseServiceReady, false);
  assert.notEqual(calls[0], anonKey);
  assert.equal(calls[1], 'public-auth-key');
  assert.equal(logs.some(message => message.includes(anonKey)), false);
});
