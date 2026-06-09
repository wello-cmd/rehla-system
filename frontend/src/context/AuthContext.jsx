// Auth Context — Global authentication state
import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('rehla_token');
    const savedUser = localStorage.getItem('rehla_user');
    if (token && savedUser) {
      try { setUser(JSON.parse(savedUser)); }
      catch { localStorage.clear(); }
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const data = await api.post('/auth/login', { email, password });
    localStorage.setItem('rehla_token', data.token);
    localStorage.setItem('rehla_refresh_token', data.refresh_token);
    localStorage.setItem('rehla_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('rehla_token');
    localStorage.removeItem('rehla_refresh_token');
    localStorage.removeItem('rehla_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
