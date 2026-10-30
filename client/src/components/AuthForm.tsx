import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { api, ApiError, type Session } from '../api';

export default function AuthForm({ onSuccess, mode }: { onSuccess: (session: Session) => void; mode: 'login' | 'register' }) {
  const register = mode === 'register';
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [visible, setVisible] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (busy) return; setBusy(true); setError(''); setFields({});
    const data = Object.fromEntries(new FormData(e.currentTarget));
    if (register && new TextEncoder().encode(String(data.password)).length > 72) { setFields({ password: 'Use at most 72 UTF-8 bytes; emoji can use multiple bytes.' }); setBusy(false); return; }
    try { onSuccess(await api<Session>(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(data) })); }
    catch (err) { if (err instanceof ApiError && err.details.length) setFields(Object.fromEntries(err.details.map(detail => [detail.field, detail.message]))); else setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return <><p className="auth-form-description">{register ? 'Join your campus and find the space for your next big idea.' : 'Sign in to find your space and pick up where you left off.'}</p><form onSubmit={submit} className="form-stack auth-form" aria-label={register ? 'Registration' : 'Login'}>
    {register && <label htmlFor="auth-name">Full name<input id="auth-name" name="name" autoComplete="name" placeholder="Your full name" required minLength={2} maxLength={80} disabled={busy} aria-invalid={!!fields.name} aria-describedby={fields.name ? 'name-error' : undefined}/>{fields.name && <span id="name-error" className="field-error" role="alert">{fields.name}</span>}</label>}
    <label htmlFor="auth-email">Email address<input id="auth-email" name="email" type="email" autoComplete="email" placeholder="you@university.edu" required maxLength={254} disabled={busy} aria-invalid={!!fields.email} aria-describedby={fields.email ? 'email-error' : undefined}/>{fields.email && <span id="email-error" className="field-error" role="alert">{fields.email}</span>}</label>
    <div className="password-field"><label htmlFor="auth-password">Password</label><div className="password-input"><input id="auth-password" name="password" type={visible ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} placeholder={register ? 'Create a strong password' : 'Enter your password'} required minLength={register ? 8 : 1} maxLength={72} disabled={busy} aria-invalid={!!fields.password} aria-describedby={fields.password ? 'password-error' : register ? 'password-help' : undefined}/><button type="button" className="password-toggle" aria-label={visible ? 'Hide password' : 'Show password'} aria-controls="auth-password" aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>{fields.password ? <span id="password-error" className="field-error" role="alert">{fields.password}</span> : register && <span id="password-help" className="field-hint">At least 8 characters; at most 72 UTF-8 bytes.</span>}</div>
    {error && <p className="error" role="alert">{error}</p>}<button className="primary auth-submit" disabled={busy}>{busy ? <><LoaderCircle size={17} className="animate-spin"/>Please wait…</> : <>{register ? 'Create account' : 'Sign in'}<ArrowRight size={17}/></>}</button>
  </form></>;
}
