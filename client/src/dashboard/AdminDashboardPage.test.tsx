import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext';
import AdminDashboardPage from '../pages/AdminDashboardPage';
import { adminOverviewFixture, adminUsageFixture } from './adminFixtures';

function setup({ error = false, empty = false, admin = true } = {}) {
  const token = `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`;
  const fetcher = vi.fn(async (path: string) => {
    const url = new URL(path, 'http://localhost');
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.pathname === '/api/auth/me') return json({ user: { _id: 'admin-one', name: 'Alex Admin', email: 'admin@campus.edu', role: admin ? 'admin' : 'user', createdAt: '2026-01-01T00:00:00Z' } });
    if (url.pathname === '/api/admin/dashboard') return error ? json({ error: { message: 'Database temporarily unavailable.' } }, 503) : json(empty ? { ...adminOverviewFixture, kpis: Object.fromEntries(Object.keys(adminOverviewFixture.kpis).map(key => [key, 0])), resourceDistribution: adminOverviewFixture.resourceDistribution.map(row => ({ ...row, total: 0, active: 0 })), upcomingBookings: [], recentActivity: [] } : adminOverviewFixture);
    if (url.pathname === '/api/admin/dashboard/utilization') return json(empty ? { ...adminUsageFixture, scheduledHours: 0, bookingCount: 0, resourcesUsed: 0, topResources: [], daily: [] } : adminUsageFixture);
    throw new Error(`Unexpected request: ${path}`);
  });
  vi.stubGlobal('fetch', fetcher);
  sessionStorage.setItem('campus-session', JSON.stringify({ token }));
  render(<MemoryRouter><AuthProvider><AdminDashboardPage/></AuthProvider></MemoryRouter>);
  return fetcher;
}
describe('admin dashboard', () => {
  it('renders exact aggregation totals, safe owner details, activity and scheduled hours', async () => {
    setup();
    const card = await screen.findByRole('link', { name: /Total resources/ });
    await waitFor(() => expect(within(card).getByText('7')).toBeInTheDocument());
    expect(await screen.findByText('Thesis discussion')).toBeInTheDocument();
    expect(screen.getByText('taylor@campus.edu')).toBeInTheDocument();
    expect(screen.getByText('Reservation cancelled')).toBeInTheDocument();
    expect(screen.getByText('Reserved by Taylor Student')).toBeInTheDocument();
    expect(screen.queryByText('Cancelled by Taylor Student')).not.toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /Confirmed scheduled hours by UTC day/ })).toBeInTheDocument();
    expect(screen.getByText(/Utilization percentage: not calculated/)).toBeInTheDocument();
  });
  it('requests the selected rolling window and refreshes both sections', async () => {
    const calls = setup(); const user = userEvent.setup();
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Usage window' }), '7');
    await waitFor(() => expect(calls.mock.calls.some(([path]) => path.includes('days=7'))).toBe(true));
    const refresh = screen.getByRole('button', { name: 'Refresh overview' });
    await waitFor(() => expect(refresh).toBeEnabled());
    const count = calls.mock.calls.length;
    await user.click(refresh);
    await waitFor(() => expect(calls.mock.calls.length).toBeGreaterThanOrEqual(count + 2));
  });
  it('shows unavailable counts rather than fabricated zeros on overview failure', async () => {
    setup({ error: true });
    expect(await screen.findByText(/Database temporarily unavailable/)).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Total resources/ })).getByText('—')).toBeInTheDocument();
  });
  it('provides useful empty states for genuine zero records', async () => {
    setup({ empty: true });
    expect(await screen.findByText('A little breathing room.')).toBeInTheDocument();
    expect(await screen.findByText('No confirmed time in this window.')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Total resources/ })).getByText('0')).toBeInTheDocument();
  });
  it('does not request private analytics for a regular user', async () => {
    const calls = setup({ admin: false });
    expect(await screen.findByText('Administrator access is required to view campus analytics.')).toBeInTheDocument();
    await waitFor(() => expect(calls.mock.calls.some(([path]) => path === '/api/auth/me')).toBe(true));
    expect(calls.mock.calls.some(([path]) => path.startsWith('/api/admin/'))).toBe(false);
  });
});
