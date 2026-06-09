import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { login }   = useAuth();
  const navigate    = useNavigate();
  const [email,     setEmail]    = useState('');
  const [password,  setPassword] = useState('');
  const [loading,   setLoading]  = useState(false);
  const [showPass,  setShowPass] = useState(false);

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
      padding: '24px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Subtle grid background */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: 'radial-gradient(circle, rgba(99,102,241,0.06) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
        pointerEvents: 'none',
      }} />

      {/* Glow blob */}
      <div style={{
        position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: 480, height: 240,
        background: 'radial-gradient(ellipse, rgba(99,102,241,0.08) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: 400,
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-light)',
        borderRadius: 12,
        padding: '40px 36px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        animation: 'fadeInUp 0.3s ease both',
      }}>

        {/* Brand */}
        <div style={{ textAlign:'center', marginBottom:36 }}>
          <div style={{
            display: 'inline-flex', alignItems:'center', justifyContent:'center',
            width:52, height:52,
            background: 'var(--color-brand)',
            borderRadius: 12,
            marginBottom: 16,
            boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize:28, color:'#fff', fontVariationSettings:"'FILL' 1" }}>storefront</span>
          </div>
          <h1 style={{ fontSize:26, fontWeight:800, letterSpacing:'-0.04em', lineHeight:1 }}>
            REHLA
          </h1>
          <p style={{ fontSize:11, color:'var(--color-text-dim)', letterSpacing:'0.08em', textTransform:'uppercase', marginTop:6 }}>
            Management System
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:18 }}>
          <div>
            <label htmlFor="email" className="text-label" style={{ display:'block', marginBottom:7, color:'var(--color-text-muted)' }}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@rehla.co"
              required
              autoFocus
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="password" className="text-label" style={{ display:'block', marginBottom:7, color:'var(--color-text-muted)' }}>
              Password
            </label>
            <div style={{ position:'relative' }}>
              <input
                id="password"
                name="password"
                type={showPass ? 'text' : 'password'}
                className="input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                style={{ paddingRight:42 }}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                style={{
                  position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
                  background:'none', border:'none', cursor:'pointer',
                  color:'var(--color-text-dim)', padding:4, display:'flex',
                }}
                aria-label={showPass ? 'Hide password' : 'Show password'}
              >
                <span className="material-symbols-outlined" style={{ fontSize:18 }}>
                  {showPass ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={loading}
            style={{ width:'100%', marginTop:4, letterSpacing:'0.02em' }}
          >
            {loading ? (
              <>
                <span className="material-symbols-outlined" style={{ fontSize:18, animation:'spin 0.8s linear infinite' }}>progress_activity</span>
                Signing in…
              </>
            ) : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign:'center', marginTop:20, fontSize:11, color:'var(--color-text-dim)', lineHeight:1.6 }}>
          Staff access only · Contact admin for credentials
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeInUp {
          from { opacity:0; transform:translateY(16px); }
          to   { opacity:1; transform:translateY(0); }
        }
      `}</style>
    </div>
  );
}
