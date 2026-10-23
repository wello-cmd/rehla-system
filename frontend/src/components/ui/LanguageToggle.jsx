import { useSyncExternalStore } from 'react';
import { getLanguage, setLanguage, subscribeLanguage } from '../../i18n';

export default function LanguageToggle() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage);
  const target = language === 'ar' ? 'en' : 'ar';
  return <button type="button" className="btn btn-ghost btn-sm language-toggle"
    onClick={() => setLanguage(target)} aria-label={target === 'ar' ? 'التبديل إلى العربية' : 'Switch to English'}>
    <span className="material-symbols-outlined" aria-hidden="true">translate</span>
    <span lang={target} dir={target === 'ar' ? 'rtl' : 'ltr'}>{target === 'ar' ? 'العربية' : 'English'}</span>
  </button>;
}
