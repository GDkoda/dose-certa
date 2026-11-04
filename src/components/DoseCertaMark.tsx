export function DoseCertaMark({ className = "", decorative = false }: { className?: string; decorative?: boolean }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      width="78%"
      height="78%"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.45"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={decorative ? "presentation" : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : "Dose Certa: cápsula protegida"}
    >
      <path d="M16 2.7 26.2 6.6v7.1c0 7.2-4.4 12.3-10.2 15.5C10.2 26 5.8 20.9 5.8 13.7V6.6L16 2.7Z" />
      <path d="M16 5.1 24 8.2v5.4c0 6-3.6 10.3-8 12.8-4.4-2.5-8-6.8-8-12.8V8.2l8-3.1Z" opacity="0.35" />
      <g transform="rotate(-45 16 16)">
        <rect x="11.7" y="9.2" width="8.6" height="13.6" rx="4.3" />
        <path d="M11.9 16h8.2" />
      </g>
      <path d="m22.1 7.8 2 2" opacity="0.7" />
    </svg>
  );
}
