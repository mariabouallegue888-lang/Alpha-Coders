import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUpRight, BookOpen, FlaskConical, Laptop, MapPin, Search, Users } from 'lucide-react';
import type { Resource } from '../api';
import useResourceList, { useDebouncedValue } from '../hooks/useResourceList';
import ResourceImage from './ResourceImage';
import ResourceFilters from './ResourceFilters';
import Pagination from './Pagination';
import CampusIllustration from './CampusIllustration';
import { EmptyState, LoadingSkeleton, Notice } from './ui';

const icons = { room: BookOpen, lab: FlaskConical, equipment: Laptop };
const labels = { room: 'Study & meeting rooms', lab: 'Laboratories', equipment: 'Equipment' };
export default function ResourceCatalog({ onReserve }: { onReserve: (resource: Resource) => void }) {
  const [search, setSearch] = useState(''), [type, setType] = useState('all'), [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search);
  const params = new URLSearchParams({ page: String(page), limit: '12' });
  if (debounced.trim()) params.set('search', debounced.trim()); if (type !== 'all') params.set('type', type);
  const { data, loading, error, reload } = useResourceList(params.toString());
  useEffect(() => { if (data && page > Math.max(1, data.pagination.totalPages)) setPage(Math.max(1, data.pagination.totalPages)); }, [data, page]);
  function changeType(value: string) { setType(value); setPage(1); }
  return <><section className="catalog-hero"><div><span className="hero-kicker"><span/>MORE ROOM FOR YOUR IDEAS</span><h2>Make room<br/>for what matters.</h2><p>From focused study to your next breakthrough.<br/>Find a space or a tool, and make it happen.</p><a href="#resources" className="hero-link">Explore your campus<ArrowDown size={16}/></a></div><CampusIllustration/><div className="catalog-hero-note">A little space. Endless possibilities.</div></section><div className="category-grid">{(['room', 'lab', 'equipment'] as const).map(value => { const Icon = icons[value]; return <button className={`category-card ${type === value ? 'chosen' : ''}`} key={value} onClick={() => changeType(type === value ? 'all' : value)} aria-pressed={type === value}><span className={`category-icon ${value}`}><Icon size={21}/></span><span><strong>{labels[value]}</strong><small>{data ? `${data.typeCounts[value]} bookable resources` : loading ? 'Loading resource count…' : 'Explore this category'}</small></span><ArrowUpRight size={18} className="category-arrow"/></button>; })}</div>
    <section id="resources" className="resources-section"><div className="section-heading"><div><div className="eyebrow">FIND YOUR FOCUS</div><h2>Explore campus resources{data && <span className="count-pill">{data.pagination.total}</span>}</h2><p>Your next great idea deserves the right setting.</p></div></div><ResourceFilters search={search} type={type} onSearch={value => { setSearch(value); setPage(1); }} onType={changeType}/>
    {loading ? <LoadingSkeleton label="Loading campus resources" count={6}/> : error ? <Notice tone="error">{error}<button className="text-button" onClick={reload}>Try again</button></Notice> : !data?.resources.length ? <EmptyState icon={Search} title="A fresh search might do the trick." description={search || type !== 'all' ? 'Try a different name, location or resource category.' : 'Your campus hasn’t added any bookable resources yet. Check back when the directory is ready.'}>{(search || type !== 'all') && <button className="ui-button ui-button-secondary" onClick={() => { setSearch(''); changeType('all'); }}>Clear filters</button>}</EmptyState> : <div className="resource-grid">{data.resources.map(resource => <article className="resource-card" key={resource._id}><Link to={`/resources/${resource._id}`} aria-label={`View ${resource.name}`}><ResourceImage resource={resource}/></Link><div className="resource-body"><h3><Link to={`/resources/${resource._id}`}>{resource.name}</Link></h3><div className="resource-location"><MapPin size={14}/>{resource.location}</div><p className="resource-description">{resource.description || 'Find the room to turn your next idea into something real.'}</p><div className="resource-footer"><span><Users size={15}/>{resource.capacity} {resource.type === 'equipment' ? 'borrower' : 'people'}</span><div className="resource-card-actions"><Link className="text-button" to={`/resources/${resource._id}`}>Details</Link><button className="card-reserve" onClick={() => onReserve(resource)}>Reserve<ArrowUpRight size={15}/></button></div></div></div></article>)}</div>}{data && <Pagination info={data.pagination} onPage={setPage} loading={loading || search !== debounced}/>}<div className="section-foot"><span>Thoughtfully shared. Ready for your next idea.</span><span>Availability is checked when you reserve.</span></div></section></>;
}
