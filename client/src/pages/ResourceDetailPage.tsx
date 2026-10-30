import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, MapPin, ShieldCheck, Users } from 'lucide-react';
import { api, type Resource } from '../api';
import { useAuth } from '../auth/AuthContext';
import AppShell from '../components/AppShell';
import ResourceImage from '../components/ResourceImage';
import Modal from '../components/Modal';
import BookingForm from '../components/BookingForm';
import { Button, LoadingSkeleton, Notice } from '../components/ui';

export default function ResourceDetailPage() {
  const { id } = useParams();
  const { session, status } = useAuth();
  const navigate = useNavigate();
  const [resource, setResource] = useState<Resource | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [bookingBusy, setBookingBusy] = useState(false), [booking, setBooking] = useState(false), [attempt, setAttempt] = useState(0);
  const closeBooking = useCallback(() => setBooking(false), []);
  useEffect(() => {
    if (status === 'loading') return;
    let active = true;
    const controller = new AbortController();
    setLoading(true); setError(''); setResource(null);
    api<{ resource: Resource }>(`/resources/${id}`, { signal: controller.signal }, session?.token).then(result => { if (active) setResource(result.resource); }).catch(err => { if (active) setError((err as Error).message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [id, session?.token, session?.user.role, status, attempt]);
  return <AppShell active="resources" breadcrumb="Resource details"><div className="detail-page"><nav className="detail-nav" aria-label="Resource navigation"><Link to="/" className="text-button"><ArrowLeft size={16}/>All resources</Link>{session?.user.role === 'admin' && <Link to="/admin" className="text-button">Manage resources<ArrowRight size={15}/></Link>}</nav>
    {loading ? <LoadingSkeleton variant="detail" label="Loading resource details"/> : error ? <Notice tone="error"><strong>This resource couldn’t be loaded.</strong> {error}<button className="text-button" onClick={() => setAttempt(value => value + 1)}>Try again</button></Notice> : resource && <article className="detail-card"><div className="detail-image-wrap"><ResourceImage resource={resource} large/></div><div className="detail-content"><div className="detail-heading"><div><div className="eyebrow">{resource.type === 'lab' ? 'LABORATORY' : resource.type === 'room' ? 'ROOM TO DO YOUR BEST' : 'TOOLS FOR YOUR NEXT IDEA'}</div><h1>{resource.name}</h1><p className="detail-location"><MapPin size={16}/>{resource.location}</p></div><span className={`detail-availability ${resource.isActive ? '' : 'inactive'}`}><CheckCircle2 size={16}/>{resource.isActive ? 'Accepting reservations' : 'Currently inactive'}</span></div><div className="detail-facts"><div><span className="fact-icon"><Users size={20}/></span><span><small>CAPACITY</small><strong>{resource.capacity} {resource.type === 'equipment' ? 'borrower' : 'people'}</strong></span></div><div><span className="fact-icon"><MapPin size={20}/></span><span><small>LOCATION</small><strong>{resource.location}</strong></span></div><div><span className="fact-icon"><CalendarDays size={20}/></span><span><small>RESERVATION LENGTH</small><strong>30 min – 4 hours</strong></span></div></div><div className="detail-columns"><section><h2>A little more about this {resource.type === 'equipment' ? 'resource' : 'space'}.</h2><p className="detail-description">{resource.description || 'Your campus has not provided an additional description for this resource.'}</p><div className="detail-how"><ShieldCheck size={21}/><div><h3>Plan with confidence.</h3><p>Choose your date, check the schedule and review your reservation. Times are shown in your local timezone.</p></div></div></section><aside className="booking-callout"><span className="soft-badge">MAKE ROOM FOR WHAT MATTERS</span><h2>Your next idea<br/>starts right here.</h2><p>Reserve for 30 minutes to 4 hours. Your time is held only after your reservation is confirmed.</p><Button disabled={!resource.isActive} onClick={() => session ? setBooking(true) : navigate('/login', { state: { from: `/resources/${resource._id}` } })}>{resource.isActive ? session ? 'Reserve this resource' : 'Sign in to reserve' : 'Unavailable for new bookings'}<ArrowRight size={17}/></Button><small>No reservation is made until you confirm.</small></aside></div></div></article>}
    {booking && resource && session && <Modal title={`Reserve ${resource.name}`} onClose={closeBooking} wide dismissible={!bookingBusy}><BookingForm resource={resource} session={session} onBusyChange={setBookingBusy} onSuccess={confirmed => { setBooking(false); navigate('/bookings', { state: { bookingSuccess: { resourceName: resource.name, startTime: confirmed.startTime, endTime: confirmed.endTime } } }); }}/></Modal>}
  </div></AppShell>;
}
