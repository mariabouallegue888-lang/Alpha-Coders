import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, type Session, type User } from '../api';

interface AuthState {
  session: Session | null;
  status: 'loading' | 'ready' | 'error';
  error: string;
  acceptSession: (session: Session) => void;
  logout: () => void;
  retry: () => void;
}
const AuthContext = createContext<AuthState | null>(null);
function storedToken() {
  try {
    const value = JSON.parse(sessionStorage.getItem('campus-session') || 'null');
    return typeof value?.token === 'string' ? value.token as string : null;
  } catch { return null; }
}
function persistToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem('campus-session', JSON.stringify({ token }));
    else sessionStorage.removeItem('campus-session');
  } catch { /* Storage can be disabled; in-memory authentication still works. */ }
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(storedToken);
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthState['status']>(token ? 'loading' : 'ready');
  const [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const logout = useCallback(() => { persistToken(null); setToken(null); setSession(null); setStatus('ready'); setError(''); }, []);
  const acceptSession = useCallback((next: Session) => {
    persistToken(next.token); setSession(null); setStatus('loading'); setError(''); setToken(next.token);
  }, []);
  const retry = useCallback(() => { setStatus('loading'); setError(''); setAttempt(value => value + 1); }, []);
  useEffect(() => {
    if (!token) return;
    let active = true;
    api<{ user: User }>('/auth/me', {}, token).then(({ user }) => {
      if (active) { setSession({ token, user }); setStatus('ready'); setError(''); }
    }).catch(err => {
      if (!active) return;
      if (err instanceof ApiError && err.status === 401) logout();
      else { setSession(null); setStatus('error'); setError((err as Error).message); }
    });
    return () => { active = false; };
  }, [token, attempt, logout]);
  useEffect(() => {
    const expired = (event: Event) => { if ((event as CustomEvent<string>).detail === token) logout(); };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, [token, logout]);
  useEffect(() => {
    const refresh = () => { if (token) setAttempt(value => value + 1); };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [token]);
  useEffect(() => {
    if (!session) return;
    try {
      const encoded = session.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const { exp } = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
      if (typeof exp !== 'number' || !Number.isFinite(exp)) { logout(); return; }
      const timer = setTimeout(logout, Math.max(0, exp * 1000 - Date.now()));
      return () => clearTimeout(timer);
    } catch { logout(); }
  }, [session, logout]);
  return <AuthContext.Provider value={{ session, status, error, acceptSession, logout, retry }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const state = useContext(AuthContext);
  if (!state) throw new Error('useAuth must be used within AuthProvider');
  return state;
}
