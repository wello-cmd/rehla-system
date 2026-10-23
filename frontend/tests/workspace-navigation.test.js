import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isNavigationActive, getPageParent} from '../src/lib/navigation.js';
import {canCreateInvoice, INVOICE_CREATE_ROLES} from '../src/lib/roles.js';

test('invoice destination remains active throughout creation without matching unrelated prefixes',()=>{
  assert.equal(isNavigationActive('/invoices','/invoices/new'),true);
  assert.equal(isNavigationActive('/','/invoices/new'),false);
  assert.equal(isNavigationActive('/invoices','/invoices-archive'),false);
  assert.equal(isNavigationActive('/','/'),true);
  assert.deepEqual(getPageParent('/invoices/new'),{path:'/invoices',label:'Invoices'});
  assert.equal(getPageParent('/inventory'),null);
});
test('invoice primary action and route share policy without expanding accountant permissions',()=>{
  for(const role of ['admin','ceo'])assert.equal(canCreateInvoice(role),true);
  for(const role of ['accountant','worker','dispatcher',undefined,'toString'])assert.equal(canCreateInvoice(role),false);
  assert.deepEqual(INVOICE_CREATE_ROLES,['ceo','admin']);
});
