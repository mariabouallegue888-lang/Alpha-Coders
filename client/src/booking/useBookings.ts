import { useCallback, useEffect, useState } from 'react';
import { api, type BookingList } from '../api';

export default function useBookings(path: string, token?: string, enabled = true) {
  const key = `${token || ''}:${path}`;
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ key: string; data: BookingList | null; loading: boolean; error: string }>({ key, data: null, loading: true, error: '' });
  const reload = useCallback(() => { setState(value => ({ ...value, loading: true, error: '' })); setVersion(value => value + 1); }, []);
  useEffect(() => {
    if (!token || !enabled) return;
    let active = true;
    const controller = new AbortController();
    setState({ key, data: null, loading: true, error: '' });
    api<BookingList>(path, { signal: controller.signal }, token).then(data => { if (active) setState({ key, data, loading: false, error: '' }); }).catch(error => {
      if (active) setState({ key, data: null, loading: false, error: (error as Error).message });
    });
    return () => { active = false; controller.abort(); };
  }, [key, path, token, enabled, version]);
  return { ...(state.key === key && enabled ? state : { key, data: null, loading: true, error: '' }), reload };
}
