import { useState } from 'react';
import { BookOpen, FlaskConical, Laptop } from 'lucide-react';
import type { Resource } from '../api';
import ResourceArtwork from './ResourceArtwork';

const icons = { room: BookOpen, lab: FlaskConical, equipment: Laptop };
export default function ResourceImage({ resource, large = false }: { resource: Resource; large?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const Icon = icons[resource.type];
  return <div className={`resource-visual ${resource.type} ${large ? 'detail-visual' : ''}`}>
    <ResourceArtwork type={resource.type}/>
    {resource.imageUrl && failedUrl !== resource.imageUrl && <img src={resource.imageUrl} alt={resource.name} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedUrl(resource.imageUrl)}/>}
    <span className="resource-type"><Icon size={12}/>{resource.type === 'lab' ? 'LABORATORY' : resource.type.toUpperCase()}</span>
    <span className={`available-badge ${resource.isActive ? '' : 'inactive'}`}><i/>{resource.isActive ? 'Open for booking' : 'Inactive'}</span>
  </div>;
}
