import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, CalendarDays, Check, Clock3, LoaderCircle, MapPin, RefreshCw, Search, Users, X } from 'lucide-react';
import { api, ApiError, type Booking } from '../api';
import { useAuth } from '../auth/AuthContext';
import useBookings from '../booking/useBookings';
import { bookingDateLabel, canCancelBooking, dateFilterBounds, reservationGroup, type ReservationGroup } from '../booking/myBookings';
import { useDebouncedValue } from '../hooks/useResourceList';
import Modal from './Modal';
import Pagination from './Pagination';
import ResourceImage from './ResourceImage';
import { LoadingSkeleton } from './ui';

const groupLabels: Record<ReservationGroup, string> = { upcoming: 'Upcoming & in progress', past: 'Past reservations', cancelled: 'Cancelled reservations' };
export default function BookingsPanel({ adminView = false }: { adminView?: boolean }) {
  const { session } = useAuth();
  const location = useLocation();
  const [period, setPeriod] = useState<'all' | ReservationGroup>(() => {
    const requested = new URLSearchParams(location.search).get('period');
    return requested === 'all' || requested === 'upcoming' || requested === 'past' || requested === 'cancelled' ? requested : adminView ? 'all' : 'upcoming';
  });
  const [search, setSearch] = useState(''), [status, setStatus] = useState('all'), [type, setType] = useState('all');
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [sort, setSort] = useState(''), [page, setPage] = useState(1);
  const [target, setTarget] = useState<Booking | null>(null), [busy, setBusy] = useState(false), [cancelError, setCancelError] = useState(''), [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now);
  const inFlight = useRef(false), mounted = useRef(true);
  const debounced = useDebouncedValue(search);
  let bounds: { from?: string; to?: string } = {}, rangeError = '';
  try { bounds = dateFilterBounds(from, to); } catch (error) { rangeError = (error as Error).message; }
  const params = new URLSearchParams({ period, page: String(page), limit: '20' });
  if (debounced.trim()) params.set('search', debounced.trim());
  if (status !== 'all') params.set('status', status);
  if (type !== 'all') params.set('type', type);
  if (sort) params.set('sort', sort);
  if (bounds.from) params.set('from', bounds.from);
  if (bounds.to) params.set('to', bounds.to);
  const { data, loading, error, reload } = useBookings(`${adminView ? '/bookings' : '/bookings/me'}?${params}`, session?.token, !rangeError && (!adminView || session?.user.role === 'admin'));
  const closeCancel = useCallback(() => { if (!inFlight.current) { setTarget(null); setCancelError(''); } }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (data && page > Math.max(1, data.pagination.totalPages)) setPage(Math.max(1, data.pagination.totalPages)); }, [data, page]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 7000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    const refresh = () => { if (!document.hidden) { setNow(Date.now()); reload(); } };
    const timer = setInterval(refresh, 60000); window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [reload]);
  function reset() { setSearch(''); setStatus('all'); setType('all'); setFrom(''); setTo(''); setSort(''); setPeriod(adminView ? 'all' : 'upcoming'); setPage(1); }
  async function cancel() {
    if (!target || !session || inFlight.current) return;
    inFlight.current = true; setBusy(true); setCancelError('');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
    try {
      const result = await api<{ booking: Booking; alreadyCancelled: boolean; message: string }>(`/bookings/${target._id}/cancel`, { method: 'PATCH', signal: controller.signal }, session.token);
      if (!result?.booking || result.booking.status !== 'cancelled') throw new Error('Cancellation response could not be verified.');
      if (mounted.current) { setTarget(null); setNotice(result.message); reload(); }
    } catch (error) {
      if (!mounted.current) return;
      setCancelError(error instanceof ApiError && error.code !== 'TRANSACTION_COMMIT_UNKNOWN' ? error.message : 'We could not confirm the cancellation. Refresh the list to check its status. Repeating cancellation is safe.');
      reload();
    } finally { clearTimeout(timer); inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  if (!session) return null;
  if (adminView && session.user.role !== 'admin') return <div className="error" role="alert">Administrator access is required to view campus reservations.</div>;
  const filtered = !!search || status !== 'all' || type !== 'all' || !!from || !!to;
  const bookings = data?.bookings || [];
  const groups = (['upcoming', 'past', 'cancelled'] as const).map(group => ({ group, bookings: bookings.filter(booking => reservationGroup(booking, now) === group) })).filter(group => group.bookings.length);
  return <section className="my-bookings-panel" aria-label={adminView ? 'All campus reservations' : 'My Bookings'}>
    {notice && <div className="notice" role="status"><Check size={17}/>{notice}<button className="ml-auto" onClick={() => setNotice('')} aria-label="Dismiss reservation notification"><X size={16}/></button></div>}
    <div className="section-heading"><div><h2>{adminView ? 'All campus reservations' : 'My reservations'}</h2><p>{adminView ? 'Find reservations by resource, purpose, member name or email.' : 'Your upcoming plans and reservation history, together.'}</p></div><button type="button" className="text-button reservation-refresh" onClick={reload} disabled={loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>Refresh</button></div>
    <div className="reservation-tabs" aria-label="Reservation groups">{(['all', 'upcoming', 'past', 'cancelled'] as const).map(value => <button key={value} aria-pressed={period === value} className={period === value ? 'selected' : ''} onClick={() => { setPeriod(value); setStatus('all'); setPage(1); }}>{value === 'all' ? 'All' : value === 'upcoming' ? 'Upcoming' : value === 'past' ? 'Past' : 'Cancelled'}<span>{data ? data.summary[value] : '—'}</span></button>)}</div>
    <div className="reservation-filters"><div className="search-field"><Search size={16}/><input aria-label="Search reservations" value={search} maxLength={100} placeholder={adminView ? 'Resource, purpose, member or email…' : 'Resource, location or purpose…'} onChange={event => { setSearch(event.target.value); setPage(1); }}/>{search && <button aria-label="Clear reservation search" onClick={() => { setSearch(''); setPage(1); }}><X size={15}/></button>}</div><label>Status<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="all">All statuses</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option></select></label><label>Resource type<select value={type} onChange={event => { setType(event.target.value); setPage(1); }}><option value="all">All types</option><option value="room">Rooms</option><option value="lab">Laboratories</option><option value="equipment">Equipment</option></select></label><label>From date<input type="date" value={from} onChange={event => { setFrom(event.target.value); setPage(1); }}/></label><label>Through date<input type="date" value={to} onChange={event => { setTo(event.target.value); setPage(1); }}/></label><label>Sort by<select value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}><option value="">{period === 'upcoming' ? 'Soonest first' : 'Latest first'}</option><option value="startAsc">Start time: earliest</option><option value="startDesc">Start time: latest</option></select></label></div>
    <div className="reservation-filter-note"><span>Dates and times are in {Intl.DateTimeFormat().resolvedOptions().timeZone}. Upcoming includes reservations in progress.</span>{filtered && <button className="text-button" onClick={reset}>Clear filters</button>}</div>
    {rangeError ? <p className="error" role="alert">{rangeError}</p> : loading ? <LoadingSkeleton variant="rows" label="Loading reservations" count={3}/> : error ? <div className="empty-state error" role="alert"><p>{error}</p><button className="text-button" onClick={reload}>Try again</button></div> : !bookings.length ? <div className="empty-state"><CalendarDays size={33}/><h3>{filtered ? 'No reservations match your filters.' : period === 'past' ? 'No past reservations yet.' : period === 'cancelled' ? 'No cancelled reservations.' : adminView ? 'No campus reservations in this view.' : 'Your calendar has room for something great.'}</h3><p>{filtered ? 'Try another search, date range or status.' : period === 'upcoming' ? 'Make your next plan with a campus resource.' : 'Your reservation history will appear here.'}</p>{filtered ? <button className="text-button" onClick={reset}>Reset filters</button> : !adminView && <Link to="/" className="primary">Explore resources<ArrowRight size={16}/></Link>}</div> : <div className="reservation-groups">{groups.map(({ group, bookings: entries }) => <section key={group} aria-label={groupLabels[group]}><h3 className="reservation-group-heading">{groupLabels[group]}</h3><div className="reservation-cards">{entries.map(booking => {
      const activeNow = group === 'upcoming' && +new Date(booking.startTime) <= now;
      return <article className="reservation-card" key={booking._id} aria-label={`Reservation for ${booking.resource?.name || 'unavailable resource'}`}><div className="reservation-resource">{booking.resource ? <ResourceImage resource={booking.resource}/> : <span className="booking-icon"><CalendarDays size={22}/></span>}<div><h4>{booking.resource?.isActive ? <Link to={`/resources/${booking.resource._id}`}>{booking.resource.name}</Link> : booking.resource?.name || 'Unavailable resource'}</h4>{booking.resource && <><p><MapPin size={13}/>{booking.resource.location}</p><p><Users size={13}/>{booking.resource.capacity} {booking.resource.type === 'equipment' ? 'borrower' : 'people'} · <span className="capitalize">{booking.resource.type}</span></p></>}</div><div className="reservation-badges"><span className={`status ${booking.status}`}>{booking.status}</span>{activeNow && <span className="in-progress-badge">In progress</span>}</div></div><div className="reservation-times"><Clock3 size={15}/><span>{bookingDateLabel(booking.startTime)}<br/><span className="muted">to {bookingDateLabel(booking.endTime)}</span></span></div><p className="reservation-purpose">{booking.purpose}</p>{adminView && <p className="reservation-member"><Users size={13}/>{booking.user ? `${booking.user.name} · ${booking.user.email}` : 'Account no longer available'}</p>}{booking.resource?.description && <details className="reservation-details"><summary>Resource details</summary><p>{booking.resource.description}</p>{!booking.resource.isActive && <p>This resource is unavailable for new reservations.</p>}</details>}<div className="reservation-card-footer"><span>{booking.cancelledAt ? `Cancelled ${bookingDateLabel(booking.cancelledAt)}` : group === 'past' ? 'Preserved in your reservation history' : group === 'cancelled' ? 'Cancelled · preserved in history' : '30 minutes to 4 hours per reservation'}</span>{canCancelBooking(booking, session.user, now) && <button className="cancel-button" onClick={() => { setTarget(booking); setCancelError(''); }} disabled={busy}>Cancel reservation</button>}</div></article>;
    })}</div></section>)}</div>}
    {data && !rangeError && <Pagination noun="reservations" info={data.pagination} onPage={setPage} loading={loading || search !== debounced}/>}
    {target && <Modal title="Cancel this reservation?" onClose={closeCancel} dismissible={!busy}><div className="cancel-reservation-summary"><strong>{target.resource?.name || 'Unavailable resource'}</strong><p>{bookingDateLabel(target.startTime)}<br/>to {bookingDateLabel(target.endTime)}</p><p>{target.purpose}</p>{adminView && <p>Reserved by {target.user?.name || 'unavailable account'}</p>}</div><p className="cancel-explanation">The time will be released for others. This reservation will remain in your cancelled history.</p>{cancelError && <p className="error" role="alert">{cancelError}</p>}<div className="booking-actions"><button className="text-button" onClick={closeCancel} disabled={busy}>Keep reservation</button><button className="primary danger-button" disabled={busy} onClick={() => void cancel()}>{busy ? <><LoaderCircle className="animate-spin" size={16}/>Cancelling…</> : 'Confirm cancellation'}</button></div></Modal>}
  </section>;
}
