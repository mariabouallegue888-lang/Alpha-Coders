import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Clock3, LoaderCircle, MapPin, ShieldCheck, Users } from 'lucide-react';
import { api, ApiError, type Booking, type Resource, type Session } from '../api';
import { bookingPayload, durationLabel, endChoices, localDate, localDayWindow, overlaps, startChoices, timeLabel, validateDraft, type BookingDraft } from '../booking/time';
import { useIntervalCheck, useLocalSchedule } from '../booking/useBookingAvailability';
import DayAvailability from './DayAvailability';
import ResourceImage from './ResourceImage';

export default function BookingForm({ resource, session, onSuccess, onBusyChange }: { resource: Resource; session: Session; onSuccess: (booking: Booking) => void; onBusyChange?: (busy: boolean) => void }) {
  const id = useId();
  const [draft, setDraft] = useState<BookingDraft>({ date: localDate(), startTime: '', endTime: '', purpose: '' });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [phase, setPhase] = useState<'edit' | 'review'>('edit'), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const [banner, setBanner] = useState(''), [now, setNow] = useState(Date.now);
  const inFlight = useRef(false), completed = useRef(false), mounted = useRef(true), heading = useRef<HTMLHeadingElement>(null);
  const schedule = useLocalSchedule(resource._id, draft.date);
  const errors = validateDraft(draft, now);
  const timeValid = !errors.date && !errors.startTime && !errors.endTime;
  const check = useIntervalCheck(resource._id, draft.startTime, draft.endTime, timeValid);
  const knownOverlap = timeValid && schedule.state === 'ready' && overlaps(draft.startTime, draft.endTime, schedule.busy);
  const canReview = !Object.keys(errors).length && !knownOverlap && check.state === 'available' && resource.isActive;
  const starts = startChoices(draft.date, schedule.busy), ends = endChoices(draft.startTime, schedule.busy);
  // Keep an existing selection visible after a refresh, even if it became occupied.
  if (draft.startTime && !starts.includes(draft.startTime)) starts.push(draft.startTime);
  if (draft.endTime && !ends.includes(draft.endTime)) ends.push(draft.endTime);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  useEffect(() => { heading.current?.focus(); }, [phase, uncertain]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  function change(field: keyof BookingDraft, value: string) {
    if (inFlight.current) return;
    if (field === 'date') {
      try { localDayWindow(value); } catch { setBanner('Choose a valid reservation date.'); return; }
      if (value < localDate()) { setBanner('Choose today or a future date.'); return; }
    }
    setDraft(current => ({ ...current, [field]: value, ...(field === 'date' ? { startTime: '', endTime: '' } : field === 'startTime' ? { endTime: '' } : {}) }));
    setTouched(current => ({ ...current, [field]: true })); setBanner('');
  }
  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setTouched({ date: true, startTime: true, endTime: true, purpose: true });
    const current = validateDraft(draft);
    if (Object.keys(current).length) { setNow(Date.now()); setBanner(Object.values(current)[0]); return; }
    if (canReview) { setBanner(''); setPhase('review'); }
  }
  async function confirm() {
    if (inFlight.current || completed.current || uncertain || phase !== 'review') return;
    let payload;
    try { payload = bookingPayload(resource._id, draft); }
    catch (error) { setNow(Date.now()); setBanner((error as Error).message); setPhase('edit'); return; }
    inFlight.current = true; setBusy(true); onBusyChange?.(true); setBanner('');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 30000);
    try {
      // Always send the final request: availability never substitutes for server validation.
      const result = await api<{ booking: Booking }>('/bookings', { method: 'POST', body: JSON.stringify(payload), signal: controller.signal }, session.token);
      if (!result?.booking?._id || result.booking.status !== 'confirmed') throw new Error('The server response could not be verified.');
      completed.current = true;
      if (mounted.current) onSuccess(result.booking);
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ApiError && error.status === 409) {
        setBanner('Someone just reserved that time. We’re refreshing the schedule. Your purpose is saved—please choose another time.');
        setPhase('edit'); schedule.refresh(); check.refresh();
      } else if (!(error instanceof ApiError) || error.status === 0 || error.code === 'TRANSACTION_COMMIT_UNKNOWN' || error.code === 'INVALID_RESPONSE' || (error.status >= 500 && !['TRANSACTION_RETRY_EXHAUSTED', 'TRANSACTIONS_UNAVAILABLE'].includes(error.code))) {
        setUncertain(true); setBanner('We couldn’t confirm the result. Your reservation may have been saved. Check My Bookings before trying again.');
      } else { setBanner(error.message); setPhase('edit'); setNow(Date.now()); check.refresh(); if (error.status === 404) schedule.refresh(); }
    } finally { clearTimeout(timeout); inFlight.current = false; if (mounted.current) { setBusy(false); onBusyChange?.(false); } }
  }
  function fieldError(field: keyof BookingDraft) { return touched[field] && errors[field] ? <span id={`${id}-${field}-error`} className="field-error" role="alert">{errors[field]}</span> : null; }
  return <div className="booking-experience">
    <div className="booking-resource-summary"><ResourceImage resource={resource}/><div><span className="eyebrow">{resource.type === 'lab' ? 'LABORATORY' : resource.type.toUpperCase()}</span><h3>{resource.name}</h3><p><MapPin size={13}/>{resource.location}</p><p><Users size={13}/>{resource.capacity} {resource.type === 'equipment' ? 'borrower' : 'people'}</p></div></div>
    {resource.description && <details className="booking-about"><summary>About this resource</summary><p>{resource.description}</p></details>}
    <ol className="booking-steps" aria-label="Reservation progress"><li aria-current={phase === 'edit' ? 'step' : undefined}><span>{phase === 'review' ? <Check size={13}/> : '1'}</span>Choose your time</li><li aria-current={phase === 'review' ? 'step' : undefined}><span>2</span>Review & confirm</li></ol>
    {banner && <div className="error booking-banner" role="alert">{banner}</div>}
    {uncertain ? <div className="booking-uncertain"><ShieldCheck size={30}/><h3 ref={heading} tabIndex={-1}>Let’s check before trying again.</h3><p>Submitting again could create another reservation. Your current form has been kept here.</p><Link className="primary" to="/bookings">Check My Bookings<ArrowRight size={16}/></Link></div> : phase === 'review' ? <section className="booking-review" aria-labelledby={`${id}-review-title`} aria-busy={busy}><h3 ref={heading} id={`${id}-review-title`} tabIndex={-1}>Review your reservation</h3><p className="muted">One last look before we reserve your space.</p><dl><div><dt>Resource</dt><dd>{resource.name}<small>{resource.location}</small></dd></div><div><dt>Date & time</dt><dd>{timeLabel(draft.startTime, true)}<br/>to {timeLabel(draft.endTime, true)}<small>{timeZone} · {durationLabel(draft.startTime, draft.endTime)}</small></dd></div><div><dt>Purpose</dt><dd className="review-purpose">{draft.purpose.trim()}</dd></div></dl><p className="booking-server-note"><ShieldCheck size={17}/>We’ll check your time again when you confirm.</p>{errors.startTime && <p className="error" role="alert">{errors.startTime} Go back to update your times.</p>}{check.state === 'error' && <p className="error" role="alert">{check.error} Go back to check availability again.</p>}{knownOverlap && <p className="error" role="alert">This time now appears occupied. Go back to choose another interval.</p>}<div className="booking-actions"><button className="text-button" type="button" disabled={busy} onClick={() => setPhase('edit')}><ArrowLeft size={16}/>Edit reservation</button><button className="primary" type="button" disabled={busy || !canReview} onClick={() => void confirm()}>{busy ? <><LoaderCircle size={17} className="animate-spin"/>Confirming…</> : <>Confirm reservation<ArrowRight size={17}/></>}</button></div></section> : <div className="booking-workspace"><DayAvailability date={draft.date} onDate={value => change('date', value)} busy={schedule.busy} status={schedule.state} error={schedule.error} now={now} onRefresh={() => { schedule.refresh(); check.refresh(); }}/><form className="booking-fields form-stack" onSubmit={review} noValidate>
      <div><h3 ref={heading} tabIndex={-1}>Make time for what matters.</h3><p className="booking-timezone">All times in <strong>{timeZone}</strong>. Overnight bookings are welcome.</p></div>
      <label htmlFor={`${id}-start`}><span id={`${id}-start-label`}>Start time</span><select aria-labelledby={`${id}-start-label`} id={`${id}-start`} value={draft.startTime} required onChange={e => change('startTime', e.target.value)} onBlur={() => setTouched(value => ({ ...value, startTime: true }))} aria-invalid={!!(touched.startTime && errors.startTime)} aria-describedby={`${id}-duration ${touched.startTime && errors.startTime ? `${id}-startTime-error` : ''}`}><option value="">Choose a start time</option>{starts.map(value => <option key={value} value={value} disabled={+new Date(value) <= now || (schedule.state === 'ready' && schedule.busy.some(interval => +new Date(interval.startTime) <= +new Date(value) && +new Date(interval.endTime) > +new Date(value)))}>{timeLabel(value)}</option>)}</select>{fieldError('startTime')}</label>
      <label htmlFor={`${id}-end`}><span id={`${id}-end-label`}>End time</span><select aria-labelledby={`${id}-end-label`} id={`${id}-end`} value={draft.endTime} required disabled={!draft.startTime} onChange={e => change('endTime', e.target.value)} onBlur={() => setTouched(value => ({ ...value, endTime: true }))} aria-invalid={!!(touched.endTime && errors.endTime)} aria-describedby={`${id}-duration ${touched.endTime && errors.endTime ? `${id}-endTime-error` : ''}`}><option value="">Choose an end time</option>{ends.map(value => <option key={value} value={value} disabled={schedule.state === 'ready' && overlaps(draft.startTime, value, schedule.busy)}>{timeLabel(value, localDate(new Date(value)) !== draft.date)} · {durationLabel(draft.startTime, value)}</option>)}</select>{fieldError('endTime')}</label>
      <p className="duration-note" id={`${id}-duration`}><Clock3 size={14}/>{timeValid ? `${durationLabel(draft.startTime, draft.endTime)} selected` : '30 minutes minimum · 4 hours maximum'}</p>
      <div className={`booking-feedback ${knownOverlap || check.state === 'occupied' || check.state === 'error' ? 'feedback-warning' : ''}`} role="status" aria-live="polite">{knownOverlap || check.state === 'occupied' ? 'This interval overlaps a reservation. Try a different start or end time.' : check.state === 'checking' ? 'Checking your selected time…' : check.state === 'available' ? 'This time is currently open. We’ll check once more when you confirm.' : check.state === 'error' ? check.error : 'Choose start and end times to check availability.'}{check.state === 'error' && <button className="text-button" type="button" onClick={check.refresh}>Check again</button>}</div>
      <label htmlFor={`${id}-purpose`}><span id={`${id}-purpose-label`}>Booking purpose</span><textarea aria-labelledby={`${id}-purpose-label`} id={`${id}-purpose`} value={draft.purpose} rows={3} required minLength={3} maxLength={500} placeholder="e.g. Study group for our design project" onChange={e => change('purpose', e.target.value)} onBlur={() => setTouched(value => ({ ...value, purpose: true }))} aria-invalid={!!(touched.purpose && errors.purpose)} aria-describedby={`${id}-purpose-hint ${touched.purpose && errors.purpose ? `${id}-purpose-error` : ''}`}/>{fieldError('purpose')}</label><p className="purpose-count" id={`${id}-purpose-hint`}>A few words about your plans <span>{draft.purpose.length}/500</span></p><button className="primary" type="submit" disabled={!canReview}>Review reservation<ArrowRight size={17}/></button>
    </form></div>}
  </div>;
}
