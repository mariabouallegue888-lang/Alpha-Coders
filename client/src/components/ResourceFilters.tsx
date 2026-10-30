import { Search, X } from 'lucide-react';

export default function ResourceFilters({ search, type, onSearch, onType }: { search: string; type: string; onSearch: (value: string) => void; onType: (value: string) => void }) {
  return <div className="filter-bar"><div className="tabs" aria-label="Resource type">{['all', 'room', 'lab', 'equipment'].map(value => <button key={value} onClick={() => onType(value)} className={type === value ? 'selected' : ''} aria-pressed={type === value}>{value === 'all' ? 'All resources' : value === 'room' ? 'Rooms' : value === 'lab' ? 'Labs' : 'Equipment'}</button>)}</div><div className="search-field"><Search size={17}/><input aria-label="Search resources" placeholder="Search by name or location…" maxLength={100} value={search} onChange={e => onSearch(e.target.value)}/>{search && <button onClick={() => onSearch('')} aria-label="Clear search"><X size={15}/></button>}</div></div>;
}
