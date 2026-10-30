import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Pagination as PageInfo } from '../api';

export default function Pagination({ info, onPage, loading = false, noun = 'resources' }: { info: PageInfo; onPage: (page: number) => void; loading?: boolean; noun?: string }) {
  if (!info.total) return null;
  const start = (info.page - 1) * info.limit + 1;
  return <nav className="pagination" aria-label={`${noun} pages`}><span aria-live="polite">{start > info.total ? 0 : start}–{Math.min(info.page * info.limit, info.total)} of {info.total} {noun}</span><div className="flex items-center gap-3"><button className="page-button" disabled={loading || !info.hasPreviousPage} onClick={() => onPage(info.page - 1)} aria-label="Previous page"><ChevronLeft size={16}/></button><span>Page {info.page} of {Math.max(1, info.totalPages)}</span><button className="page-button" disabled={loading || !info.hasNextPage} onClick={() => onPage(info.page + 1)} aria-label="Next page"><ChevronRight size={16}/></button></div></nav>;
}
