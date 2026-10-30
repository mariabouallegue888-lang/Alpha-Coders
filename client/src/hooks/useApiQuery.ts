import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

export default function useApiQuery<T>(path: string | null, token?: string) {
  const key = `${token || ''}:${path}`;
  const [version, setVersion] = useState(0), [state, setState] = useState<{ key: string; data: T | null; loading: boolean; error: string }>({ key, data: null, loading: !!path, error: '' });
  const reload = useCallback(() => { setState(value => ({ ...value, loading: true })); setVersion(value => value + 1); }, []);
  useEffect(() => {
    if (!path) return;
    let active = true;
    const controller = new AbortController();
    setState({ key, data: null, loading: true, error: '' });
    api<T>(path, { signal: controller.signal }, token).then(data => { if (active) setState({ key, data, loading: false, error: '' }); }).catch(error => { if (active) setState({ key, data: null, loading: false, error: (error as Error).message }); });
    return () => { active = false; controller.abort(); };
  }, [path, key, token, version]);
  return { ...(!path ? { data: null, loading: false, error: '' } : state.key === key ? state : { data: null, loading: true, error: '' }), reload };
}
