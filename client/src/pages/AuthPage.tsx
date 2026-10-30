import { Link, Navigate, useLocation } from 'react-router-dom';
import { ArrowLeft, BookOpen, CalendarCheck2, FlaskConical } from 'lucide-react';
import AuthForm from '../components/AuthForm';
import { useAuth } from '../auth/AuthContext';
import { AuthPending } from '../auth/ProtectedRoute';
import { Brand } from '../components/ui';
import CampusIllustration from '../components/CampusIllustration';

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { session, status, acceptSession } = useAuth();
  const location = useLocation();
  const requested = location.state?.from;
  const from = typeof requested === 'string' && (['/dashboard', '/bookings', '/admin', '/admin/dashboard', '/admin/bookings'].includes(requested) || /^\/resources\/[a-f\d]{24}$/i.test(requested)) ? requested : session?.user.role === 'admin' ? '/admin/dashboard' : '/dashboard';
  if (status !== 'ready') return <AuthPending/>;
  if (session) return <Navigate to={from} replace/>;
  return <main className="auth-page"><section className="auth-intro"><Brand inverted/><div className="auth-story"><span className="hero-kicker"><span/>BUILT FOR YOUR CAMPUS LIFE</span><h2>A little space.<br/>A world of<br/><em>possibility.</em></h2><p>Find the rooms, labs and tools for your next great idea. We’ll make room for what matters.</p></div><CampusIllustration/><div className="auth-features"><span><BookOpen size={17}/>Spaces for focus</span><span><FlaskConical size={17}/>Tools for discovery</span><span><CalendarCheck2 size={17}/>Plans in one place</span></div><span className="auth-intro-footer">Your campus. Better connected.</span></section><section className="auth-form-side"><div className="auth-mobile-brand"><Brand/></div><div className="auth-panel"><div className="auth-mode-switch"><Link to="/login" state={{ from: requested }} aria-current={mode === 'login' ? 'page' : undefined}>Sign in</Link><Link to="/register" state={{ from: requested }} aria-current={mode === 'register' ? 'page' : undefined}>Create account</Link></div><div className="eyebrow">{mode === 'login' ? 'YOUR CAMPUS IS WAITING' : 'A NEW CHAPTER STARTS HERE'}</div><h1>{mode === 'register' ? 'Make yourself at home.' : 'Welcome back.'}</h1><AuthForm key={mode} mode={mode} onSuccess={acceptSession}/><p className="auth-switch-copy">{mode === 'login' ? 'New to Campus? ' : 'Already have an account? '}<Link className="text-button" to={mode === 'login' ? '/register' : '/login'} state={{ from: requested }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</Link></p><Link className="auth-back" to="/"><ArrowLeft size={15}/>Explore resources first</Link></div><div className="auth-form-footer">Campus Resource Booking<span>Make room for what matters.</span></div></section></main>;
}
