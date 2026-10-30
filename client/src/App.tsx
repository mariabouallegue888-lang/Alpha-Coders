import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { useAuth } from './auth/AuthContext';
import { bookingDateLabel } from './booking/myBookings';
import type { Resource } from './api';
import AppShell, { type NavigationKey } from './components/AppShell';
import Modal from './components/Modal';
import BookingForm from './components/BookingForm';
import ResourceCatalog from './components/ResourceCatalog';
import AdminResources from './components/AdminResources';
import BookingsPanel from './components/BookingsPanel';
import { ButtonLink, Notice } from './components/ui';

type View = 'explore' | 'bookings' | 'admin' | 'reservations';
const headings: Record<View, { active: NavigationKey; crumb: string; title: string; description: string }> = {
  explore: { active: 'resources', crumb: 'Explore resources', title: 'Find your next space.', description: 'Rooms for focus. Labs for discovery. Tools for possibility.' },
  bookings: { active: 'bookings', crumb: 'My bookings', title: 'Your plans, in one place.', description: 'A clear view of what’s next, and everything you’ve made time for.' },
  admin: { active: 'admin-resources', crumb: 'Resource management', title: 'Make campus work better.', description: 'Keep your shared spaces and tools ready for the people who need them.' },
  reservations: { active: 'admin-bookings', crumb: 'Reservation management', title: 'A campus of possibilities.', description: 'Every reservation, thoughtfully organized. Find plans and manage cancellations.' },
};
export default function App({ view = 'explore' }: { view?: View }) {
  const { session } = useAuth();
  const navigate = useNavigate(), location = useLocation();
  const [bookingBusy, setBookingBusy] = useState(false), [selected, setSelected] = useState<Resource | null>(null);
  const [notice, setNotice] = useState(() => location.state?.bookingSuccess ? `Reservation confirmed for ${location.state.bookingSuccess.resourceName}. ${bookingDateLabel(location.state.bookingSuccess.startTime)} – ${bookingDateLabel(location.state.bookingSuccess.endTime)}.` : '');
  const closeSelected = useCallback(() => setSelected(null), []);
  useEffect(() => { if (view === 'bookings' && location.state?.bookingSuccess) navigate(location.pathname, { replace: true, state: null }); }, [view, location.state, location.pathname, navigate]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 7000); return () => clearTimeout(timer); }, [notice]);
  function reserve(resource: Resource) { if (!session) { navigate('/login', { state: { from: `/resources/${resource._id}` } }); return; } setSelected(resource); }
  const page = headings[view];
  return <AppShell active={page.active} breadcrumb={page.crumb} title={page.title} description={page.description} eyebrow={view === 'admin' || view === 'reservations' ? 'CAMPUS ADMINISTRATION' : 'YOUR CAMPUS, CONNECTED'} actions={view === 'bookings' ? <ButtonLink to="/">Find a resource<ArrowUpRight size={17}/></ButtonLink> : undefined}>
    {notice && <Notice onDismiss={() => setNotice('')}>{notice}</Notice>}
    {view === 'explore' && <ResourceCatalog onReserve={reserve}/>}{view === 'admin' && <AdminResources/>}{(view === 'bookings' || view === 'reservations') && <BookingsPanel adminView={view === 'reservations'}/>}
    {selected && session && <Modal title={`Reserve ${selected.name}`} onClose={closeSelected} wide dismissible={!bookingBusy}><BookingForm resource={selected} session={session} onBusyChange={setBookingBusy} onSuccess={booking => { setSelected(null); navigate('/bookings', { state: { bookingSuccess: { resourceName: selected.name, startTime: booking.startTime, endTime: booking.endTime } } }); }}/></Modal>}
  </AppShell>;
}
