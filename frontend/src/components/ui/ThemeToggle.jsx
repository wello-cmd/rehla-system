import { useEffect, useState } from 'react';

function currentTheme() {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('light')) return 'light';
  try { return localStorage.getItem('theme') || 'dark'; } catch (e) { return 'dark'; }
}

export default function ThemeToggle({ style }) {
  const [theme, setTheme] = useState(currentTheme);

  useEffect(() => {
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(theme);
    try { localStorage.setItem('theme', theme); } catch (e) { /* ignore */ }
  }, [theme]);

  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      onClick={() => setTheme(next)}
      className="btn btn-ghost btn-sm"
      style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--color-text-dim)', fontSize: 12, ...style }}
      aria-label={`Switch to ${next} mode`}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
        {theme === 'dark' ? 'light_mode' : 'dark_mode'}
      </span>
      {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
    </button>
  );
}
