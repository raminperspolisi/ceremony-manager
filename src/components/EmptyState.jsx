import './EmptyState.css';

const ICON_PATHS = {
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18M8 14h3M8 17h7" /></>,
  box: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="M3 8v9l9 5 9-5V8M12 13v9" /></>,
  invoice: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  list: <><path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" /></>,
};

export default function EmptyState({
  icon = 'list',
  title,
  description,
  primaryAction,
  secondaryAction,
  compact = false,
}) {
  return (
    <section className={`empty-state${compact ? ' empty-state--compact' : ''}`} dir="rtl" aria-label={title}>
      <span className="empty-state-art" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          {ICON_PATHS[icon] || ICON_PATHS.list}
        </svg>
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      <div className="empty-state-actions">
        {primaryAction && <button type="button" className="empty-state-primary" onClick={primaryAction.onClick}>{primaryAction.label}</button>}
        {secondaryAction && <button type="button" className="empty-state-secondary" onClick={secondaryAction.onClick}>{secondaryAction.label}</button>}
      </div>
    </section>
  );
}
