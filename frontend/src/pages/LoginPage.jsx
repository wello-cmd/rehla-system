import { useState } from 'react';
import { getRoleLandingPath } from '../lib/roles';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import ThemeToggle from '../components/ui/ThemeToggle';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const user = await login(email.trim(), password);
      toast.success(`Welcome back, ${user.name}`);
      navigate(getRoleLandingPath(user.role), { replace:true });
    } catch (err) {
      setError(err.message || 'Could not sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-intro" aria-label="Rehla workspace">
        <p className="brand-lockup"><span className="brand-name">REHLA <span className="brand-mark" aria-hidden="true"><span className="material-symbols-outlined">route</span></span></span><span className="brand-caption">Management workspace</span></p>
        <div>
          <h1>Your business.<br />In clear view.</h1>
          <p>From the warehouse floor to the financial picture. One workspace for your team’s daily work.</p>
          <div className="login-workflows"><span><span className="material-symbols-outlined" aria-hidden="true">inventory_2</span>Stock</span><span><span className="material-symbols-outlined" aria-hidden="true">local_shipping</span>Delivery</span><span><span className="material-symbols-outlined" aria-hidden="true">receipt_long</span>Finance</span></div>
        </div>
        <footer>Rehla management system · Staff workspace</footer>
      </section>
      <section className="login-form-area" aria-labelledby="sign-in-heading">
        <div className="login-theme"><ThemeToggle /></div>
        <div className="login-form-wrap">
          <h2 id="sign-in-heading">Welcome back</h2>
          <p>Sign in with your staff account.</p>
          <form className="login-form" onSubmit={handleSubmit} aria-busy={loading}>
            <div><label htmlFor="email">Email address</label><input id="email" name="email" type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required autoFocus autoComplete="username" autoCapitalize="none" spellCheck={false} /></div>
            <div><label htmlFor="password">Password</label><div className="password-wrap"><input id="password" name="password" type={showPass ? 'text' : 'password'} className="input" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required autoComplete="current-password" aria-describedby={error ? 'login-error' : undefined} /><button type="button" className="password-toggle" onClick={() => setShowPass(v => !v)} aria-label={showPass ? 'Hide password' : 'Show password'} aria-pressed={showPass}><span className="material-symbols-outlined" aria-hidden="true">{showPass ? 'visibility_off' : 'visibility'}</span></button></div></div>
            {error && <p className="login-error" id="login-error" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>{loading ? <><span className="material-symbols-outlined spinner" aria-hidden="true">progress_activity</span>Signing in…</> : <>Sign in<span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span></>}</button>
          </form>
          <p className="login-help">Having trouble signing in?<br />Contact your administrator for account access.</p>
        </div>
      </section>
    </main>
  );
}
