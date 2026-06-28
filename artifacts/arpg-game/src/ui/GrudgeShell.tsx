import type { ReactNode } from 'react';
import { publicUrl } from '@/lib/assetUrl';
import './grudge-theme.css';

interface GrudgeShellProps {
  children: ReactNode;
  footer?: ReactNode;
  /** Wider panel for character select / lists */
  wide?: boolean;
}

export function GrudgeShell({ children, footer, wide }: GrudgeShellProps) {
  return (
    <div
      className="grudge-shell"
      style={{ ['--grudge-bg-img' as string]: `url(${publicUrl('/grudges-landing.png')})` }}
    >
      <div className={`grudge-panel${wide ? ' grudge-panel-wide' : ''}`}>{children}</div>
      {footer && <div className="grudge-footer">{footer}</div>}
    </div>
  );
}

export function GrudgeBrand({
  title = 'Grudox',
  tagline = 'Survival ARPG — bind a grudge, bear it forward.',
}: {
  title?: string;
  tagline?: string;
}) {
  return (
    <div className="grudge-brand">
      <img src={publicUrl('/grudges-logo.png')} alt={title} />
      <h1 className="grudge-title">{title}</h1>
      <p className="grudge-tagline">{tagline}</p>
    </div>
  );
}