import { Sparkles } from 'lucide-react';

export default function SectionLabel({ children, light = false }) {
  return (
    <span className={`section-label ${light ? 'section-label--light' : ''}`}>
      <Sparkles size={14} aria-hidden="true" />
      {children}
    </span>
  );
}
