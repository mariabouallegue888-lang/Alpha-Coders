import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { api, type Resource } from '../api';
import { useAuth } from '../auth/AuthContext';
import useResourceList, { useDebouncedValue } from '../hooks/useResourceList';
import Modal from './Modal';
import Pagination from './Pagination';
import ResourceForm from './ResourceForm';
import ResourceFilters from './ResourceFilters';
import ResourceImage from './ResourceImage';
import { LoadingSkeleton } from './ui';

export default function AdminResources() {
  const { session } = useAuth();
  const location = useLocation();
  const [search, setSearch] = useState(''), [type, setType] = useState('all'), [status, setStatus] = useState(() => new URLSearchParams(location.search).get('visibility') === 'inactive' ? 'false' : new URLSearchParams(location.search).get('visibility') === 'active' ? 'true' : 'all'), [page, setPage] = useState(1);
  const [editorBusy, setEditorBusy] = useState(false);
  const deleting = useRef(false);
  const [editor, setEditor] = useState<Resource | 'new' | null>(null), [target, setTarget] = useState<Resource | null>(null);
  const [busy, setBusy] = useState(false), [deleteError, setDeleteError] = useState(''), [notice, setNotice] = useState('');
  const debounced = useDebouncedValue(search);
  const params = new URLSearchParams({ includeInactive: 'true', page: String(page), limit: '12', ...(debounced.trim() ? { search: debounced.trim() } : {}), ...(type !== 'all' ? { type } : {}), ...(status !== 'all' ? { isActive: status } : {}) });
  const { data, loading, error, reload } = useResourceList(params.toString(), session?.token);
  const closeEditor = useCallback(() => setEditor(null), []);
  const closeDelete = useCallback(() => { if (!deleting.current) { setTarget(null); setDeleteError(''); } }, []);
  useEffect(() => { if (data && page > Math.max(1, data.pagination.totalPages)) setPage(Math.max(1, data.pagination.totalPages)); }, [data, page]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(timer); }, [notice]);
  async function remove() {
    if (!target || !session || deleting.current) return;
    deleting.current = true; setBusy(true); setDeleteError('');
    try {
      const result = await api<{ message: string }>(`/resources/${target._id}`, { method: 'DELETE' }, session.token);
      setTarget(null); setNotice(result.message); reload();
    } catch (err) { setDeleteError((err as Error).message); } finally { deleting.current = false; setBusy(false); }
  }
  if (!session) return null;
  return <section className="resources-section admin-resources">
    {notice && <div className="notice" role="status"><Check size={17}/>{notice}<button className="ml-auto" onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={16}/></button></div>}
    <div className="section-heading"><div><h2>Resource directory{data && <span className="count-pill">{data.pagination.total}</span>}</h2><p>Keep campus resources current. Booking history is always preserved.</p></div><button className="primary" onClick={() => setEditor('new')}><Plus size={17}/>Add resource</button></div>
    <ResourceFilters search={search} type={type} onSearch={value => { setSearch(value); setPage(1); }} onType={value => { setType(value); setPage(1); }}/>
    <label className="status-filter">Visibility<select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="all">Active and inactive</option><option value="true">Active only</option><option value="false">Inactive only</option></select></label>
    {loading ? <LoadingSkeleton variant="rows" label="Loading campus resources" count={5}/> : error ? <div className="empty-state error" role="alert"><p>{error}</p><button className="text-button" onClick={reload}>Try again</button></div> : !data?.resources.length ? <div className="empty-state"><Search size={30}/><h3>No resources found</h3><p>{search || type !== 'all' || status !== 'all' ? 'Try changing your filters.' : 'Add your first campus resource to get started.'}</p></div> : <div className="table-scroll"><table className="resource-table"><caption className="sr-only">Campus resource management</caption><thead><tr><th scope="col">Resource</th><th scope="col">Type</th><th scope="col">Capacity</th><th scope="col">Location</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>{data.resources.map(resource => <tr key={resource._id}><td data-label="Resource"><div className="table-resource"><ResourceImage resource={resource}/><Link className="resource-table-name" to={`/resources/${resource._id}`}>{resource.name}</Link></div></td><td data-label="Type" className="capitalize">{resource.type}</td><td data-label="Capacity">{resource.capacity}</td><td data-label="Location">{resource.location}</td><td data-label="Status"><span className={`status ${resource.isActive ? 'confirmed' : 'cancelled'}`}>{resource.isActive ? 'Active' : 'Inactive'}</span></td><td data-label="Actions"><div className="flex gap-2"><button className="icon-button" aria-label={`Edit ${resource.name}`} onClick={() => setEditor(resource)}><Pencil size={17}/></button><button className="icon-button danger-text" aria-label={`Delete ${resource.name}`} onClick={() => { setTarget(resource); setDeleteError(''); }}><Trash2 size={17}/></button></div></td></tr>)}</tbody></table></div>}
    {data && <Pagination info={data.pagination} onPage={setPage} loading={loading || search !== debounced}/>}
    {editor && <Modal title={editor === 'new' ? 'Add a campus resource' : 'Edit resource'} onClose={closeEditor} dismissible={!editorBusy}><ResourceForm resource={editor === 'new' ? undefined : editor} session={session} onBusyChange={setEditorBusy} onSuccess={() => { setEditor(null); setNotice('Resource saved successfully.'); reload(); }}/></Modal>}
    {target && <Modal title="Delete this resource?" onClose={closeDelete} dismissible={!busy}><p className="muted my-5"><strong>{target.name}</strong> will be removed from the directory. Existing booking history will be preserved. Deletion is blocked while upcoming or ongoing confirmed bookings exist.</p>{deleteError && <p className="error mb-5" role="alert">{deleteError}</p>}<div className="flex justify-end gap-4"><button className="text-button" disabled={busy} onClick={closeDelete}>Keep resource</button><button className="primary danger-button" disabled={busy} onClick={() => void remove()}>{busy ? 'Deleting…' : 'Delete resource'}<Trash2 size={16}/></button></div></Modal>}
  </section>;
}
