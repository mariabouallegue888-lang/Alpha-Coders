import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import BookingForm from '../components/BookingForm';
import Modal from '../components/Modal';
import Router from '../Router';
import { localDate, localDayWindow, overlaps, type Interval } from './time';
import type { Booking, Resource, User } from '../api';

const resource: Resource = { _id: '012345678901234567890123', name: 'The Reading Room', type: 'room', capacity: 8, location: 'Central Library', description: 'A quiet room with a whiteboard.', imageUrl: 'https://campus.example/room.jpg', isActive: true };
const profile: User = { _id: '112345678901234567890123', name: 'Campus Student', email: 'student@campus.edu', role: 'user', createdAt: '2026-01-01T00:00:00Z' };
const token = `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.test-signature`;
const session = { user: profile, token };
const selectedDate = localDate(new Date(Date.now() + 3 * 86400000));
const dayStart = +localDayWindow(selectedDate).start;
const at = (hours: number) => new Date(dayStart + hours * 3600000).toISOString();
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function mockServer(options: { busy?: Interval[]; conflictOnce?: boolean; defer?: boolean; networkFailure?: boolean; dayFailure?: boolean } = {}) {
  let busy = options.busy || [], conflicted = false;
  const bookings: Booking[] = [];
  let resolvePost: ((response: Response) => void) | undefined;
  const requests = vi.fn(async (path: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(path, 'http://localhost');
    if (url.pathname === '/api/auth/me') return json({ user: profile });
    if (url.pathname === `/api/resources/${resource._id}`) return json({ resource });
    if (url.pathname === '/api/bookings/me') return json({ bookings, asOf: new Date().toISOString(), pagination: { page: 1, limit: 20, total: bookings.length, totalPages: bookings.length ? 1 : 0, hasNextPage: false, hasPreviousPage: false }, summary: { all: bookings.length, upcoming: bookings.length, past: 0, cancelled: 0 } });
    if (url.pathname.endsWith('/availability')) {
      if (url.searchParams.has('date')) {
        if (options.dayFailure) return json({ error: { message: 'Schedule temporarily unavailable.' } }, 503);
        const day = url.searchParams.get('date')!;
        return json({ date: day, busy, free: [], timeZone: 'UTC', window: { startTime: `${day}T00:00:00Z`, endTime: `${day}T23:59:59Z` } });
      }
      return json({ available: !overlaps(url.searchParams.get('startTime')!, url.searchParams.get('endTime')!, busy) });
    }
    if (url.pathname === '/api/bookings' && init?.method === 'POST') {
      if (options.networkFailure) throw new TypeError('Network connection lost');
      const payload = JSON.parse(String(init.body));
      if (options.conflictOnce && !conflicted) {
        conflicted = true; busy = [{ startTime: payload.startTime, endTime: payload.endTime }];
        return json({ error: { code: 'BOOKING_CONFLICT', message: 'This time is already reserved.' } }, 409);
      }
      const booking: Booking = { ...payload, _id: '212345678901234567890123', resource, user: profile, status: 'confirmed' };
      bookings.push(booking);
      if (options.defer) return new Promise<Response>(resolve => { resolvePost = resolve; });
      return json({ booking });
    }
    throw new Error(`Unhandled test request: ${path}`);
  });
  vi.stubGlobal('fetch', requests);
  return { requests, bookings, resolve: () => resolvePost?.(json({ booking: bookings[0] })), posts: () => requests.mock.calls.filter(([, init]) => init?.method === 'POST') };
}
function Harness({ onSuccess }: { onSuccess: (booking: Booking) => void }) {
  const [busy, setBusy] = useState(false);
  const close = vi.fn();
  return <MemoryRouter><Modal title={`Reserve ${resource.name}`} onClose={close} dismissible={!busy} wide><BookingForm resource={resource} session={session} onSuccess={onSuccess} onBusyChange={setBusy}/></Modal></MemoryRouter>;
}
async function fill(start = at(10), end = at(11)) {
  const user = userEvent.setup();
  fireEvent.change(screen.getByLabelText('Reservation date'), { target: { value: selectedDate } });
  await waitFor(() => expect(screen.queryByText('Loading occupied times…')).not.toBeInTheDocument());
  await user.selectOptions(screen.getByLabelText('Start time'), start);
  await user.selectOptions(screen.getByLabelText('End time'), end);
  await user.type(screen.getByLabelText('Booking purpose'), 'Design project study group');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Review reservation' })).toBeEnabled());
  return user;
}

describe('booking experience using the real API client and mocked HTTP responses', () => {
  it('reviews without posting, then submits once with UTC timestamps and a bearer token', async () => {
    const server = mockServer({ defer: true }), success = vi.fn();
    render(<Harness onSuccess={success}/>);
    const user = await fill();
    await user.click(screen.getByRole('button', { name: 'Review reservation' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Review your reservation' })).toHaveFocus();
    expect(within(dialog).getByText('1 hr', { exact: false })).toBeInTheDocument();
    expect(within(dialog).getByText('Design project study group')).toBeInTheDocument();
    expect(server.posts()).toHaveLength(0);
    const confirm = screen.getByRole('button', { name: 'Confirm reservation' });
    fireEvent.click(confirm); fireEvent.click(confirm);
    await waitFor(() => expect(server.posts()).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Confirming…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeDisabled();
    const [, init] = server.posts()[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({ resource: resource._id, startTime: at(10), endTime: at(11), purpose: 'Design project study group' });
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${token}`);
    server.resolve();
    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
  });
  it('handles a server conflict after green feedback, refreshes, preserves purpose and allows adjacency', async () => {
    const server = mockServer({ conflictOnce: true }), success = vi.fn();
    render(<Harness onSuccess={success}/>);
    const user = await fill();
    await user.click(screen.getByRole('button', { name: 'Review reservation' }));
    await user.click(screen.getByRole('button', { name: 'Confirm reservation' }));
    expect(await screen.findByText(/Someone just reserved that time/)).toBeInTheDocument();
    expect(screen.getByLabelText('Booking purpose')).toHaveValue('Design project study group');
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Occupied times' })).getByText('Reserved')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Start time'), at(11));
    await user.selectOptions(screen.getByLabelText('End time'), at(12));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review reservation' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Review reservation' }));
    await user.click(screen.getByRole('button', { name: 'Confirm reservation' }));
    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
    expect(server.posts()).toHaveLength(2);
  });
  it('shows a helpful purpose error immediately and does not submit an incomplete form', async () => {
    const server = mockServer(); render(<Harness onSuccess={vi.fn()}/>);
    fireEvent.change(screen.getByLabelText('Booking purpose'), { target: { value: 'a' } });
    expect(screen.getByText(/at least 3 characters/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review reservation' })).toBeDisabled();
    expect(server.posts()).toHaveLength(0);
  });
  it('shows schedule errors honestly and offers a retry', async () => {
    mockServer({ dayFailure: true }); render(<Harness onSuccess={vi.fn()}/>);
    expect(await screen.findByText('Schedule temporarily unavailable.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry schedule' })).toBeEnabled();
  });
  it('does not allow resubmission after an uncertain network result', async () => {
    const server = mockServer({ networkFailure: true }); render(<Harness onSuccess={vi.fn()}/>);
    const user = await fill();
    await user.click(screen.getByRole('button', { name: 'Review reservation' }));
    await user.click(screen.getByRole('button', { name: 'Confirm reservation' }));
    expect(await screen.findByText(/reservation may have been saved/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Check My Bookings' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm reservation' })).not.toBeInTheDocument();
    expect(server.posts()).toHaveLength(1);
  });
  it('redirects from a real resource page to My Bookings with a success notification', async () => {
    mockServer(); sessionStorage.setItem('campus-session', JSON.stringify({ token }));
    window.history.replaceState({}, '', `/resources/${resource._id}`);
    render(<Router/>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Reserve this resource' }));
    await fill();
    await user.click(screen.getByRole('button', { name: 'Review reservation' }));
    await user.click(screen.getByRole('button', { name: 'Confirm reservation' }));
    await waitFor(() => expect(window.location.pathname).toBe('/bookings'));
    expect(await screen.findByText(/Reservation confirmed for The Reading Room/)).toBeInTheDocument();
    expect(await screen.findByText('Design project study group')).toBeInTheDocument();
  });
});
