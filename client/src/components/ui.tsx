import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, CircleAlert, GraduationCap, X } from 'lucide-react';

export function Brand({ inverted = false }: { inverted?: boolean }) {
  return <Link to="/" className={`brand ${inverted ? 'brand-inverted' : ''}`} aria-label="Campus Resource Booking home"><span className="brand-icon"><GraduationCap size={25} strokeWidth={1.8}/></span><span>campus<span className="brand-dot">.</span><small>RESOURCE BOOKING</small></span></Link>;
}
type Tone = 'primary' | 'secondary' | 'ghost' | 'danger';
const buttonTones: Record<Tone, string> = { primary: 'ui-button-primary', secondary: 'ui-button-secondary', ghost: 'ui-button-ghost', danger: 'ui-button-danger' };
export function Button({ tone = 'primary', children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return <button {...props} className={`ui-button ${buttonTones[tone]} ${className}`}>{children}</button>;
}
export function ButtonLink({ to, children, tone = 'primary', className = '' }: { to: string; children: ReactNode; tone?: Tone; className?: string }) {
  return <Link to={to} className={`ui-button ${buttonTones[tone]} ${className}`}>{children}</Link>;
}
export function StatCard({ label, value, detail, icon: Icon, href, loading = false }: { label: string; value: number | null; detail: string; icon: LucideIcon; href: string; loading?: boolean }) {
  return <Link className="stat-card" to={href}><div className="stat-top"><span className="stat-icon"><Icon size={19}/></span><ArrowUpRight size={16} aria-hidden="true"/></div><span className="stat-label">{label}</span>{loading ? <span className="skeleton stat-skeleton" aria-label={`Loading ${label}`}/> : <strong className="stat-value">{value === null ? '—' : value.toLocaleString()}</strong>}<span className="stat-detail">{value === null && !loading ? 'Could not load this count' : detail}</span></Link>;
}
export function Notice({ children, tone = 'success', onDismiss }: { children: ReactNode; tone?: 'success' | 'error'; onDismiss?: () => void }) {
  const Icon = tone === 'success' ? CheckCircle2 : CircleAlert;
  return <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}><Icon size={19}/><span>{children}</span>{onDismiss && <button className="icon-button ml-auto" onClick={onDismiss} aria-label="Dismiss notification"><X size={16}/></button>}</div>;
}
export function LoadingSkeleton({ label = 'Loading…', variant = 'cards', count = 3 }: { label?: string; variant?: 'cards' | 'rows' | 'detail'; count?: number }) {
  return <div className={`skeleton-layout skeleton-${variant}`} role="status"><span className="sr-only">{label}</span>{Array.from({ length: variant === 'detail' ? 1 : count }, (_, index) => <div className="skeleton-card" aria-hidden="true" key={index}>{variant !== 'rows' && <div className="skeleton skeleton-media"/>}<div className="skeleton-copy"><div className="skeleton skeleton-title"/><div className="skeleton skeleton-line"/><div className="skeleton skeleton-line short"/></div></div>)}</div>;
}
export function EmptyState({ title, description, icon: Icon, children }: { title: string; description: string; icon: LucideIcon; children?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={27}/></span><h3>{title}</h3><p>{description}</p>{children}</div>;
}
