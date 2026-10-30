import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type DayAvailability } from '../api';
import { mergeIntervals, utcDatesForLocalDay, type Interval } from './time';

interface Schedule { key: string; state: 'loading' | 'ready' | 'error'; busy: Interval[]; error: string }
export function useLocalSchedule(resourceId: string, date: string) {
  const key = `${resourceId}/${date}`;
  const [version, setVersion] = useState(0);
  const [schedule, setSchedule] = useState<Schedule>({ key, state: 'loading', busy: [], error: '' });
  const refresh = useCallback(() => { setSchedule(value => ({ ...value, state: 'loading' })); setVersion(value => value + 1); }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setSchedule({ key, state: 'loading', busy: [], error: '' });
    (async () => {
      const dates = utcDatesForLocalDay(date);
      const days = await Promise.all(dates.map(day => api<DayAvailability>(`/resources/${resourceId}/availability?date=${day}`, { signal: controller.signal })));
      if (active) setSchedule({ key, state: 'ready', busy: mergeIntervals(days.flatMap(day => day.busy)), error: '' });
    })().catch(error => { if (active) setSchedule({ key, state: 'error', busy: [], error: (error as Error).message }); });
    return () => { active = false; controller.abort(); };
  }, [resourceId, date, key, version]);
  return { ...(schedule.key === key ? schedule : { key, state: 'loading' as const, busy: [], error: '' }), refresh };
}
interface Check { key: string; state: 'idle' | 'checking' | 'available' | 'occupied' | 'error'; error: string }
export function useIntervalCheck(resourceId: string, startTime: string, endTime: string, valid: boolean) {
  const key = `${resourceId}/${startTime}/${endTime}`;
  const [version, setVersion] = useState(0), [check, setCheck] = useState<Check>({ key, state: 'idle', error: '' });
  const refresh = useCallback(() => { setCheck(value => ({ ...value, state: 'checking' })); setVersion(value => value + 1); }, []);
  useEffect(() => {
    if (!valid) return;
    let active = true;
    const controller = new AbortController();
    setCheck({ key, state: 'checking', error: '' });
    const timer = setTimeout(() => {
      const query = new URLSearchParams({ startTime, endTime });
      api<{ available: boolean }>(`/resources/${resourceId}/availability?${query}`, { signal: controller.signal }).then(result => {
        if (active) setCheck({ key, state: result.available ? 'available' : 'occupied', error: '' });
      }).catch(error => { if (active) setCheck({ key, state: error instanceof ApiError && error.status === 409 ? 'occupied' : 'error', error: (error as Error).message }); });
    }, 250);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [resourceId, startTime, endTime, valid, key, version]);
  return { ...(!valid ? { key, state: 'idle' as const, error: '' } : check.key === key ? check : { key, state: 'checking' as const, error: '' }), refresh };
}
