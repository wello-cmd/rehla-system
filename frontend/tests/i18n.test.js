import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { formatPeriodLabel, getLanguage, getIntlLocale, setLanguage, subscribeLanguage, translate } from '../src/i18n/index.js';
import { formatEGP, formatDate, formatDateTime, timeAgo } from '../src/lib/formatters.js';

afterEach(() => setLanguage('en'));

test('language switch notifies subscribers once and ignores unsupported languages', () => {
  let updates = 0;
  const unsubscribe = subscribeLanguage(() => updates++);
  setLanguage('ar');
  assert.equal(getLanguage(), 'ar');
  assert.equal(getIntlLocale(), 'ar-EG');
  assert.equal(translate('Sign in'), 'تسجيل الدخول');
  setLanguage('ar');
  setLanguage('fr');
  assert.equal(updates, 1);
  unsubscribe();
  setLanguage('en');
  assert.equal(updates, 1);
  assert.equal(translate('Sign in'), 'Sign in');
});

test('switch persists preference and sets document language, direction and title', () => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const storage = new Map();
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable:true, value:{setItem:(k,v)=>storage.set(k,v)} });
    Object.defineProperty(globalThis, 'document', { configurable:true, value:{documentElement:{},title:''} });
    setLanguage('ar');
    assert.equal(storage.get('rehla-language'), 'ar');
    assert.equal(document.documentElement.dir, 'rtl');
    assert.equal(document.documentElement.lang, 'ar');
    assert.match(document.title, /رحلة/);
    setLanguage('en');
    assert.equal(document.documentElement.dir, 'ltr');
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage); else delete globalThis.localStorage;
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else delete globalThis.document;
  }
});

test('blocked storage does not prevent translation or switching', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', {configurable:true,get(){throw new Error('blocked');}});
    setLanguage('ar');
    assert.equal(translate('Retry'), 'إعادة المحاولة');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage;
  }
});

test('unknown strings, identifiers and non-text values pass through unchanged', () => {
  setLanguage('ar');
  for (const value of ['BO-1729308', 'constructor', 'toString', 'Customer: أحمد & Co.', null, 0, false]) {
    assert.equal(translate(value), value);
  }
  assert.equal(translate('Welcome back, {name}', {name:'أحمد <script>'}), 'أهلاً بعودتك، أحمد <script>');
});

test('Arabic count messages use zero, singular, dual, few, many and other forms', () => {
  setLanguage('ar');
  const expected = ['لا توجد أصناف','صنف واحد','صنفان','3 أصناف','11 صنفاً','100 صنف'];
  [0,1,2,3,11,100].forEach((count,i) => assert.equal(translate('items.count',{count}),expected[i]));
  setLanguage('en');
  assert.equal(translate('items.count',{count:1}), '1 item');
  assert.equal(translate('items.count',{count:2}), '2 items');
});

test('localized currency keeps value and precision; PDF can explicitly retain English', () => {
  const english = formatEGP(1234.5);
  assert.equal(english, 'EGP 1,234.50');
  setLanguage('ar');
  const expected = Number(1234.5).toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2});
  assert.equal(formatEGP(1234.5), `ج.م. ${expected}`);
  assert.equal(formatEGP(1234.5,'en-GB'), english);
  assert.equal(formatEGP(null), formatEGP(0));
  assert.equal(formatDate(null), '—');
  assert.equal(formatDateTime(null), '—');
  assert.match(formatDate('2026-10-23T12:00:00Z'), /أكتوبر/);
  assert.equal(timeAgo(new Date().toISOString()), 'الآن');
});

test('status copy is readable in both languages without mutating the original API code', () => {
  const code = 'out_for_delivery';
  assert.equal(translate(code), 'out for delivery');
  setLanguage('ar');
  assert.equal(translate(code), 'خرج للتوصيل');
  assert.equal(code, 'out_for_delivery');
});


test('applied period changes language without changing its dates or stored label', () => {
  const applied = Object.freeze({label:'Oct 2026',start:'2026-10-01',end:'2026-10-31'});
  assert.equal(formatPeriodLabel(applied.label), 'Oct 2026');
  setLanguage('ar');
  assert.equal(formatPeriodLabel(applied.label), 'أكتوبر 2026');
  assert.equal(formatPeriodLabel('Q2 2026'), 'الربع 2 2026');
  assert.equal(formatPeriodLabel('H1 2026'), 'النصف 1 2026');
  assert.equal(applied.label, 'Oct 2026');
  setLanguage('en');
  assert.equal(formatPeriodLabel(applied.label), 'Oct 2026');
});
