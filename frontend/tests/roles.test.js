import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRoleLandingPath } from '../src/lib/roles.js';

for (const [role, destination] of [
  ['ceo', '/'], ['admin', '/'], ['worker', '/warehouse/exit'],
  ['accountant', '/invoices'], ['dispatcher', '/delivery'],
  ['driver', '/forbidden'], ['unexpected-role', '/forbidden'],
  [undefined, '/forbidden'], ['toString', '/forbidden'],
]) {
  test(`${String(role)} lands on an accessible page without a root redirect loop`, () => {
    assert.equal(getRoleLandingPath(role), destination);
  });
}
