export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--ink)" />
      <rect x="6" y="13" width="13" height="6" rx="3" fill="var(--released)" />
      <rect x="20" y="13" width="6" height="6" rx="3" fill="var(--held)" />
    </svg>
  );
}
