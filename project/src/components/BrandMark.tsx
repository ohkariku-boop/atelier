/** Primary Atelier mark — auction gavel (favicon, header, foyer). */
export function BrandMark({
  className = 'w-5 h-5',
  title = 'Atelier',
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <g transform="translate(12 12) rotate(-32)" fill="currentColor">
        <rect x="-7.5" y="-6.2" width="12" height="5.8" rx="1" />
        <rect x="-1" y="-0.8" width="2" height="11" rx="0.9" />
      </g>
    </svg>
  );
}
