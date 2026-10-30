import { useCallback, useEffect, useState } from 'react';
import { api, type ResourceList } from '../api';

export function useDebouncedValue(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(timer); }, [value, delay]);
  return debounced;
}
export default function useResourceList(query: string, token?: string) {
  const [data, setData] = useState<ResourceList | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true); setError('');
    api<ResourceList>(`/resources?${query}`, { signal: controller.signal }, token).then(result => {
      if (active) setData(result);
    }).catch(err => { if (active) { setError((err as Error).message); setData(null); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [query, token, version]);
  return { data, loading, error, reload };
}
