import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext';
import DashboardPage from '../pages/DashboardPage';
import type { BookingList, ResourceList, User } from '../api';
import { adminOverviewFixture, adminUsageFixture } from './adminFixtures';

const token = `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`;
const profile: User = { _id: '012345678901234567890123', name: 'Alex Student', email: 'alex@campus.edu', role: 'user', createdAt: '2026-01-01T00:00:00Z' };
const inventory: ResourceList = { resources: [], typeCounts: { room: 4, lab: 2, equipment: 1 }, pagination: { total: 7, page: 1, limit: 3, totalPages: 3, hasNextPage: true, hasPreviousPage: false } };
const reservations: BookingList = { bookings: [], asOf: new Date().toISOString(), summary: { all: 12, upcoming: 2, past: 9, cancelled: 1 }, pagination: { page: 1, limit: 4, total: 2, totalPages: 1, hasNextPage: false, hasPreviousPage: false } };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
function server({ admin = false, resourceError = false, empty = false } = {}) {
  const calls = vi.fn(async (path: string) => {
    const url = new URL(path, 'http://localhost');
    if (url.pathname === '/api/auth/me') return json({ user: { ...profile, role: admin ? 'admin' : 'user' } });
    if (url.pathname === '/api/admin/dashboard') return json(adminOverviewFixture);
    if (url.pathname === '/api/admin/dashboard/utilization') return json(adminUsageFixture);
    if (url.pathname === '/api/resources') {
      if (resourceError) return json({ error: { message: 'Inventory is temporarily unavailable.' } }, 503);
      return json({ ...inventory, typeCounts: empty ? { room: 0, lab: 0, equipment: 0 } : inventory.typeCounts, pagination: { ...inventory.pagination, total: empty ? 0 : url.searchParams.get('isActive') === 'false' ? 3 : 7 } });
    }
    if (url.pathname === '/api/bookings' || url.pathname === '/api/bookings/me') return json({ ...reservations, summary: empty ? { all: 0, upcoming: 0, past: 0, cancelled: 0 } : reservations.summary });
    throw new Error(`Unhandled test request: ${path}`);
  });
  vi.stubGlobal('fetch', calls); sessionStorage.setItem('campus-session', JSON.stringify({ token }));
  render(<MemoryRouter><AuthProvider><DashboardPage admin={admin}/></AuthProvider></MemoryRouter>);
  return calls;
}
describe('dashboard real API integration through mocked HTTP transport', () => {
  it('uses exact API summary totals and personal endpoints', async () => {
    const calls = server();
    const card = await screen.findByRole('link', { name: /Resources to explore/ });
    await waitFor(() => expect(within(card).getByText('7')).toBeInTheDocument());
    await waitFor(() => expect(within(screen.getByRole('link', { name: /Past reservations/ })).getByText('9')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Past reservations/ })).toHaveAttribute('href', '/bookings?period=past');
    expect(calls.mock.calls.some(([path]) => path.startsWith('/api/bookings/me?'))).toBe(true);
    expect(calls.mock.calls.some(([path]) => path.startsWith('/api/bookings?'))).toBe(false);
  });
  it('does not turn an API error into a fake zero metric', async () => {
    server({ resourceError: true });
    expect(await screen.findByText(/Inventory is temporarily unavailable/)).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Resources to explore/ })).getByText('—')).toBeInTheDocument();
  });
  it('shows real zero counts and useful empty states when the database is empty', async () => {
    server({ empty: true });
    expect(await screen.findByText('Your next plan starts here.')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Upcoming reservations/ })).getByText('0')).toBeInTheDocument();
  });
  it('loads admin aggregations and links to active inventory', async () => {
    const calls = server({ admin: true });
    const card = await screen.findByRole('link', { name: /Active resources/ });
    await waitFor(() => expect(within(card).getByText('4')).toBeInTheDocument());
    expect(card).toHaveAttribute('href', '/admin?visibility=active');
    expect(calls.mock.calls.some(([path]) => path.startsWith('/api/admin/dashboard?'))).toBe(true);
    expect(calls.mock.calls.some(([path]) => path.startsWith('/api/admin/dashboard/utilization?'))).toBe(true);
    expect(calls.mock.calls.some(([path]) => path.startsWith('/api/bookings?'))).toBe(false);
  });
  it('provides a working, dismissible mobile navigation dialog', async () => {
    server(); const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Open navigation' }));
    const dialog = screen.getByRole('dialog', { name: 'Your campus' });
    const link = within(dialog).getByRole('link', { name: 'My bookings' });
    expect(link).toHaveAttribute('href', '/bookings');
    fireEvent.click(link);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
