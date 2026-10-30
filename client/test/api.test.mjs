import test from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from '../src/api.ts';

test('API preserves Headers and tuple headers while using the current bearer token', async t => {
  for (const headers of [new Headers({ 'X-Request-ID': 'qa-123' }), [['X-Request-ID', 'qa-123']]]) {
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.equal(url, '/api/resources');
      assert.equal(options.headers.get('X-Request-ID'), 'qa-123');
      assert.equal(options.headers.get('Authorization'), 'Bearer current-token');
      assert.equal(options.headers.get('Content-Type'), 'application/json');
      return Response.json({ resources: [] });
    });
    assert.deepEqual(await api('/resources', { headers }, 'current-token'), { resources: [] });
    t.mock.restoreAll();
  }
});
test('successful invalid or null JSON is an explicit ambiguous-response error', async t => {
  for (const body of ['not JSON', 'null', '']) {
    t.mock.method(globalThis, 'fetch', async () => new Response(body, { status: 200 }));
    await assert.rejects(() => api('/bookings', { method: 'POST' }), error => error instanceof ApiError && error.code === 'INVALID_RESPONSE' && error.status === 200);
    t.mock.restoreAll();
  }
});
test('API preserves structured booking conflicts and validation field errors', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code: 'BOOKING_CONFLICT', message: 'This time is occupied.' } }, { status: 409 }));
  await assert.rejects(() => api('/bookings'), error => error.status === 409 && error.code === 'BOOKING_CONFLICT' && error.message === 'This time is occupied.');
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code: 'VALIDATION_ERROR', message: 'Check input.', details: [{ field: 'purpose', message: 'Too short' }] } }, { status: 400 }));
  await assert.rejects(() => api('/bookings'), error => error.message === 'purpose: Too short' && error.details[0].field === 'purpose');
});
test('authenticated 401 clears only its matching session via the existing expiration event', async t => {
  const events = new EventTarget();
  const previous = globalThis.window;
  globalThis.window = events;
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  let expired;
  events.addEventListener('session-expired', event => { expired = event.detail; });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { message: 'Expired' } }, { status: 401 }));
  await assert.rejects(() => api('/auth/me', {}, 'expired-token'), { status: 401 });
  assert.equal(expired, 'expired-token');
});
test('network failure gives a helpful message and does not retry a mutation', async t => {
  const fetcher = t.mock.method(globalThis, 'fetch', async () => { throw new Error('socket closed'); });
  await assert.rejects(() => api('/bookings', { method: 'POST' }), /Cannot reach the server/);
  assert.equal(fetcher.mock.callCount(), 1);
});
