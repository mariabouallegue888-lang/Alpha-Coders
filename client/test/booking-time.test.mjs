import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { durationLabel, validateDraft } from '../src/booking/time.ts';

const moduleUrl = new URL('../src/booking/time.ts', import.meta.url).href;
function inZone(zone, code) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import assert from 'node:assert/strict'; import * as t from ${JSON.stringify(moduleUrl)}; ${code}`], { env: { ...process.env, TZ: zone }, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
test('positive-offset local day fetches previous UTC date rather than treating local input as UTC', () => {
  inZone('Asia/Kolkata', `
    const window = t.localDayWindow('2030-01-02');
    assert.equal(window.start.toISOString(), '2030-01-01T18:30:00.000Z');
    assert.deepEqual(t.utcDatesForLocalDay('2030-01-02'), ['2030-01-01','2030-01-02']);
  `);
});
test('negative-offset local day includes the next UTC date and overnight coverage', () => {
  inZone('America/New_York', `
    assert.equal(t.localDayWindow('2030-01-02').start.toISOString(), '2030-01-02T05:00:00.000Z');
    assert.deepEqual(t.utcDatesForLocalDay('2030-01-02'), ['2030-01-02','2030-01-03']);
  `);
});
test('spring-forward day has 23 hours and offers no nonexistent local times', () => {
  inZone('Europe/London', `
    const {start,end} = t.localDayWindow('2026-03-29');
    assert.equal(end-start,23*3600000);
    const choices=t.startChoices('2026-03-29',[]);
    assert.equal(choices.length,92);
    assert.equal(choices.some(value=>new Date(value).getHours()===1),false);
  `);
});
test('fall-back day has distinct offset-labelled choices for repeated clocks', () => {
  inZone('Europe/London', `
    const {start,end}=t.localDayWindow('2026-10-25');
    assert.equal(end-start,25*3600000);
    const choices=t.startChoices('2026-10-25',[]);
    assert.equal(choices.length,100);
    const repeated=choices.filter(value=>new Date(value).getHours()===1&&new Date(value).getMinutes()===30);
    assert.equal(repeated.length,2);
    assert.notEqual(t.timeLabel(repeated[0]),t.timeLabel(repeated[1]));
    assert.equal(new Date(repeated[1])-new Date(repeated[0]),3600000);
  `);
});
test('overnight selections preserve local dates while payloads contain exact UTC instants', () => {
  inZone('Asia/Kolkata', `
    const start=new Date(2030,0,2,23,45).toISOString();
    const end=new Date(2030,0,3,0,15).toISOString();
    assert.ok(t.endChoices(start,[]).includes(end));
    const draft={date:'2030-01-02',startTime:start,endTime:end,purpose:'  Study group  '};
    const payload=t.bookingPayload('resource-id',draft,Date.parse('2030-01-01T00:00:00Z'));
    assert.equal(payload.startTime,'2030-01-02T18:15:00.000Z');
    assert.equal(payload.endTime,'2030-01-02T18:45:00.000Z');
    assert.equal(payload.purpose,'Study group');
    assert.equal(draft.purpose,'  Study group  ');
  `);
});
test('adjacent reservations remain valid at exact non-quarter-hour boundaries', () => {
  inZone('UTC', `
    const busy=[{startTime:'2030-01-02T10:10:00.000Z',endTime:'2030-01-02T11:10:00.000Z'}];
    assert.ok(t.startChoices('2030-01-02',busy).includes(busy[0].endTime));
    assert.ok(t.endChoices('2030-01-02T09:10:00.000Z',busy).includes(busy[0].startTime));
    assert.equal(t.overlaps('2030-01-02T09:10:00Z',busy[0].startTime,busy),false);
    assert.equal(t.overlaps(busy[0].endTime,'2030-01-02T11:40:00Z',busy),false);
    assert.equal(t.overlaps('2030-01-02T11:09:00Z','2030-01-02T11:40:00Z',busy),true);
  `);
});
test('clipped UTC snapshots merge into local occupied times without inventing free gaps', () => {
  inZone('UTC', `
    const busy=t.mergeIntervals([{startTime:'2030-01-02T23:00:00Z',endTime:'2030-01-03T00:00:00Z'},{startTime:'2030-01-03T00:00:00Z',endTime:'2030-01-03T01:00:00Z'}]);
    assert.equal(busy.length,1);
    const visible=t.intervalsForLocalDay('2030-01-02',busy);
    assert.equal(visible[0].endTime,'2030-01-03T00:00:00.000Z');
    const free=t.openWindows('2030-01-02',busy,Date.parse('2030-01-02T22:00:00Z'));
    assert.deepEqual(free,[{startTime:'2030-01-02T22:00:00.000Z',endTime:'2030-01-02T23:00:00.000Z'}]);
  `);
});
test('client validation enforces exact duration boundaries, future start, and purpose length', () => {
  inZone('UTC', `
    const draft={date:'2030-01-02',startTime:'2030-01-02T10:00:00Z',endTime:'2030-01-02T10:30:00Z',purpose:'Study'};
    const now=Date.parse('2030-01-01T00:00:00Z');
    assert.deepEqual(t.validateDraft(draft,now),{});
    assert.deepEqual(t.validateDraft({...draft,endTime:'2030-01-02T14:00:00Z'},now),{});
    for(const endTime of ['2030-01-02T10:29:59Z','2030-01-02T14:00:01Z','2030-01-02T10:00:00Z']) assert.ok(t.validateDraft({...draft,endTime},now).endTime);
    assert.ok(t.validateDraft(draft,Date.parse('2030-01-02T10:00:00Z')).startTime);
    assert.ok(t.validateDraft({...draft,purpose:'  '},now).purpose);
    assert.ok(t.validateDraft({...draft,purpose:'a'.repeat(501)},now).purpose);
  `);
});
test('invalid and rolled-over calendar dates are rejected without UTC reinterpretation', () => {
  inZone('UTC', `
    for(const date of ['2030-02-30','2030-13-01','not-a-date']) assert.throws(()=>t.localDayWindow(date));
  `);
});
test('duration labels are clear and incomplete drafts do not pass validation', () => {
  assert.equal(durationLabel('2030-01-02T10:00:00Z', '2030-01-02T11:30:00Z'), '1 hr 30 min');
  const errors = validateDraft({ date: '2030-01-02', startTime: '', endTime: '', purpose: '' }, Date.parse('2030-01-01'));
  assert.ok(errors.startTime && errors.endTime && errors.purpose);
});
