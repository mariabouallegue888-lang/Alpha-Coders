import test from 'node:test';
import assert from 'node:assert/strict';
import { safeProfile } from '../src/utils/profile.js';

test('safe profiles allow only public fields even when a hash is loaded', () => {
  const user = { _id: '012345678901234567890123', name: 'Campus User', email: 'user@campus.edu', role: 'user', createdAt: new Date(), password: 'secret-hash', resetToken: 'secret', __v: 1 };
  const profile = safeProfile(user);
  assert.deepEqual(Object.keys(profile).sort(), ['_id', 'createdAt', 'email', 'name', 'role']);
  assert.equal(profile.password, undefined);
  assert.equal(profile.resetToken, undefined);
});
