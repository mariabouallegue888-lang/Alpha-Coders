import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { api, type Resource, type Session } from '../api';

export default function ResourceForm({ resource, session, onSuccess, onBusyChange }: { resource?: Resource; session: Session; onSuccess: () => void; onBusyChange?: (busy: boolean) => void }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (inFlight.current) return; inFlight.current = true; setBusy(true); onBusyChange?.(true); setError('');
    const form = Object.fromEntries(new FormData(e.currentTarget));
    try { await api(`/resources${resource ? `/${resource._id}` : ''}`, { method: resource ? 'PUT' : 'POST', body: JSON.stringify({ ...form, capacity: Number(form.capacity), isActive: form.isActive === 'true' }) }, session.token); onSuccess(); }
    catch (err) { setError((err as Error).message); }
    finally { inFlight.current = false; setBusy(false); onBusyChange?.(false); }
  }
  return <form onSubmit={submit} className="form-stack resource-form" aria-busy={busy}><p className="form-intro">{resource ? 'Keep the details clear and useful for your campus community.' : 'Create a space or tool your campus can discover and reserve.'}</p><fieldset disabled={busy}><label>Resource name<input name="name" placeholder="e.g. West Wing Seminar Room" defaultValue={resource?.name} required minLength={2} maxLength={120}/></label><div className="form-columns"><label>Resource type<select name="type" defaultValue={resource?.type || 'room'}><option value="room">Room</option><option value="lab">Laboratory</option><option value="equipment">Equipment</option></select></label><label>Capacity<input name="capacity" type="number" min={1} max={10000} defaultValue={resource?.capacity || 1} required/></label></div><label>Location<input name="location" placeholder="Building, floor or collection point" defaultValue={resource?.location} required minLength={2} maxLength={160}/></label><label>Description<textarea name="description" placeholder="What makes this resource useful? Include any important details." defaultValue={resource?.description} maxLength={2000} rows={3}/></label><label>Image URL <span className="optional-label">Optional</span><input name="imageUrl" type="url" maxLength={2048} defaultValue={resource?.imageUrl} placeholder="https://…"/></label><label>Booking visibility<select name="isActive" defaultValue={String(resource?.isActive ?? true)}><option value="true">Active — accepting reservations</option><option value="false">Inactive — hidden from the public catalog</option></select></label><p className="field-hint">Existing reservation history is preserved when you edit a resource.</p></fieldset>{error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy ? <><LoaderCircle className="animate-spin" size={17}/>Saving…</> : <>Save resource<Check size={17}/></>}</button></form>;
}
