import arabic from './ar.js';

const STORAGE_KEY = 'rehla-language';
const englishLabels = { out_for_delivery:'out for delivery', in_transit:'in transit', bank_transfer:'bank transfer', own_driver:'own driver', not_answered:'not answered', wrong_address:'wrong address', partially_paid:'partially paid', partially_refunded:'partially refunded', pending_collection:'pending collection', not_collected:'not collected', not_received:'not received' };
const listeners = new Set();
function savedLanguage() {
  try { return globalThis.localStorage?.getItem(STORAGE_KEY) === 'ar' ? 'ar' : 'en'; }
  catch { return 'en'; }
}
let language = savedLanguage();
export const getLanguage = () => language;
export const getIntlLocale = () => language === 'ar' ? 'ar-EG' : 'en-GB';
export function subscribeLanguage(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function setLanguage(next) {
  if (next !== 'en' && next !== 'ar') return;
  const changed = language !== next;
  language = next;
  try { globalThis.localStorage?.setItem(STORAGE_KEY, next); } catch { /* Private browsing may block storage. */ }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next;
    document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr';
    document.title = next === 'ar' ? 'رحلة — نظام الإدارة' : 'REHLA — Management System';
  }
  if (changed) listeners.forEach(listener => listener());
}
// Explicit calls at presentation boundaries keep stored/API values in their original form.
export function translate(key, values = {}) {
  if (typeof key !== 'string') return key;
  let message = language === 'ar' && Object.hasOwn(arabic, key) ? arabic[key] : Object.hasOwn(englishLabels, key) ? englishLabels[key] : key;
  if (key === 'items.count' && language === 'en') message = values.count === 1 ? '{count} item' : '{count} items';
  if (message && typeof message === 'object') {
    const category = new Intl.PluralRules(getIntlLocale()).select(Number(values.count));
    message = message[category] ?? message.other;
  }
  return message.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
}
