// Login Page
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(email, password);
      toast.success(`Welcome back, ${user.name}`);
      navigate('/');
    } catch (err) {
      toast.error(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg)',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        padding: '48px',
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-light)',
      }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h1 style={{ fontSize: '40px', fontWeight: 800, letterSpacing: '-0.06em', textTransform: 'uppercase', lineHeight: 1 }}>
            REHLA
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '8px' }}>
            Management System
          </p>
          <div style={{ width: '40px', height: '2px', background: 'var(--color-text)', margin: '16px auto 0' }}></div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '24px' }}>
            <label htmlFor="email" className="text-label" style={{ display: 'block', marginBottom: '8px', color: 'var(--color-text-muted)' }}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@rehla.co"
              required
              autoFocus
              autoComplete="email"
            />
          </div>

          <div style={{ marginBottom: '32px' }}>
            <label htmlFor="password" className="text-label" style={{ display: 'block', marginBottom: '8px', color: 'var(--color-text-muted)' }}>
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', fontSize: '13px' }}
          >
            {loading ? 'AUTHENTICATING...' : 'SIGN IN'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '12px', color: 'var(--color-text-dim)' }}>
          Staff access only — Contact admin for credentials
        </p>
      </div>
    </div>
  );
}
