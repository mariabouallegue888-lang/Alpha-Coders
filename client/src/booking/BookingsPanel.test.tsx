import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext';
import BookingsPanel from '../components/BookingsPanel';
import type { Booking, Resource, User } from '../api';
import { reservationGroup } from './myBookings';

const owner: User = { _id: '012345678901234567890123', name: 'Campus Student', email: 'student@campus.edu', role: 'user', createdAt: '2026-01-01T00:00:00Z' };
const foreign: User = { ...owner, _id: '112345678901234567890123', name: 'Another Student', email: 'another@campus.edu' };
const room: Resource = { _id: '212345678901234567890123', name: 'Study Room', type: 'room', capacity: 8, location: 'Library', description: 'A quiet study room.', imageUrl: '', isActive: true };
const token = `test.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`;
const instant = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();
const fixtures = (): Booking[] => [
  { _id: '312345678901234567890123', user: owner, resource: room, startTime: instant(24), endTime: instant(25), purpose: 'Upcoming project meeting', status: 'confirmed' },
  { _id: '412345678901234567890123', user: owner, resource: { ...room, name: 'Historic Room' }, startTime: instant(-3), endTime: instant(-2), purpose: 'Past study group', status: 'confirmed' },
  { _id: '512345678901234567890123', user: owner, resource: { ...room, name: 'Cancelled Room' }, startTime: instant(48), endTime: instant(49), purpose: 'Cancelled workshop', status: 'cancelled', cancelledAt: instant(-1) },
  { _id: '612345678901234567890123', user: foreign, resource: { ...room, _id: '712345678901234567890123', name: 'Camera Kit', type: 'equipment' }, startTime: instant(24), endTime: instant(25), purpose: 'Campus film project', status: 'confirmed' },
];
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
function server({ admin = false, forbidden = false, defer = false, unavailable = false } = {}) {
  const user = { ...owner, ...(admin ? { _id: '812345678901234567890123', role: 'admin' as const } : {}) };
  const records = fixtures(); let finish: (() => void) | undefined;
  const requests = vi.fn(async (path: string, options?: RequestInit): Promise<Response> => {
    const url = new URL(path, 'http://localhost');
    if (url.pathname === '/api/auth/me') return json({ user });
    if (options?.method === 'PATCH') {
      const record = records.find(booking => booking._id === url.pathname.split('/')[3])!;
      if (forbidden || (record.user?._id !== user._id && !admin)) return json({ error: { code: 'BOOKING_FORBIDDEN', message: 'You can only cancel your own bookings.' } }, 403);
      const alreadyCancelled = record.status === 'cancelled';
      record.status = 'cancelled'; record.cancelledAt ||= new Date().toISOString();
      const response = () => json({ booking: record, alreadyCancelled, message: alreadyCancelled ? 'This reservation was already cancelled.' : 'Reservation cancelled. The interval is now available for booking.' });
      if (defer) return new Promise(resolve => { finish = () => resolve(response()); });
      return response();
    }
    if (url.pathname === '/api/bookings/me' || url.pathname === '/api/bookings') {
      if (unavailable) return json({ error: { message: 'Reservations are temporarily unavailable.' } }, 503);
      if (url.pathname === '/api/bookings' && !admin) return json({ error: { message: 'Administrator access required.' } }, 403);
      const search = (url.searchParams.get('search') || '').toLowerCase();
      let matching = records.filter(booking => (url.pathname !== '/api/bookings/me' || booking.user?._id === user._id) && `${booking.resource?.name} ${booking.purpose} ${admin ? booking.user?.email : ''}`.toLowerCase().includes(search));
      const type = url.searchParams.get('type'); if (type) matching = matching.filter(booking => booking.resource?.type === type);
      const summary = { all: matching.length, upcoming: 0, past: 0, cancelled: 0 };
      for (const booking of matching) summary[reservationGroup(booking)]++;
      const period = url.searchParams.get('period'), status = url.searchParams.get('status');
      if (period && period !== 'all') matching = matching.filter(booking => reservationGroup(booking) === period);
      if (status) matching = matching.filter(booking => booking.status === status);
      return json({ bookings: matching, asOf: new Date().toISOString(), summary, pagination: { page: 1, limit: 20, total: matching.length, totalPages: matching.length ? 1 : 0, hasNextPage: false, hasPreviousPage: false } });
    }
    throw new Error(`Unhandled test request: ${path}`);
  });
  vi.stubGlobal('fetch', requests);
  sessionStorage.setItem('campus-session', JSON.stringify({ token }));
  return { requests, finish: () => finish?.(), cancellations: () => requests.mock.calls.filter(([, options]) => options?.method === 'PATCH') };
}
function mount(adminView = false) { render(<MemoryRouter><AuthProvider><BookingsPanel adminView={adminView}/></AuthProvider></MemoryRouter>); }

describe('My Bookings real API client with mocked HTTP responses', () => {
  it('loads only the personal endpoint and distinguishes upcoming, past and cancelled tabs', async () => {
    const mock = server(); mount(); const user = userEvent.setup();
    expect(await screen.findByText('Upcoming project meeting')).toBeInTheDocument();
    expect(screen.queryByText('Campus film project')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Past/ }));
    expect(await screen.findByText('Past study group')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel reservation' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Cancelled/ }));
    expect(await screen.findByText('Cancelled workshop')).toBeInTheDocument();
    expect(mock.requests.mock.calls.filter(([path]) => path.startsWith('/api/bookings')).every(([path]) => path.startsWith('/api/bookings/me'))).toBe(true);
  });
  it('confirms cancellation, prevents duplicate clicks, refreshes the list and preserves history', async () => {
    const mock = server({ defer: true }); mount(); const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Cancel reservation' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Upcoming project meeting')).toBeInTheDocument();
    expect(mock.cancellations()).toHaveLength(0);
    const confirm = within(dialog).getByRole('button', { name: 'Confirm cancellation' });
    fireEvent.click(confirm); fireEvent.click(confirm);
    await waitFor(() => expect(mock.cancellations()).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Cancelling…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeDisabled();
    mock.finish();
    expect(await screen.findByText(/Reservation cancelled. The interval/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Upcoming project meeting')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^Cancelled/ }));
    expect(await screen.findByText('Upcoming project meeting')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel reservation' })).not.toBeInTheDocument();
  });
  it('shows an ownership error without pretending the cancellation succeeded', async () => {
    server({ forbidden: true }); mount(); const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Cancel reservation' }));
    await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
    expect(await screen.findByText('You can only cancel your own bookings.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText(/Reservation cancelled. The interval/)).not.toBeInTheDocument();
  });
  it('admin view uses the restricted endpoint, shows member details and sends useful filters', async () => {
    const mock = server({ admin: true }); mount(true); const user = userEvent.setup();
    expect(await screen.findByText(/another@campus.edu/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Resource type'), 'equipment');
    await user.type(screen.getByLabelText('Search reservations'), 'another@campus.edu');
    await waitFor(() => expect(mock.requests.mock.calls.some(([path]) => { const query = new URL(path, 'http://localhost'); return query.pathname === '/api/bookings' && query.searchParams.get('type') === 'equipment' && query.searchParams.get('search') === 'another@campus.edu'; })).toBe(true));
    expect(await screen.findByText('Campus film project')).toBeInTheDocument();
  });
  it('displays loading errors and offers a real retry', async () => {
    server({ unavailable: true }); mount();
    expect(await screen.findByText('Reservations are temporarily unavailable.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });
});
