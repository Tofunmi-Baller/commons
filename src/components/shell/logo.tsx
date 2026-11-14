export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-display font-bold tracking-[-0.02em] text-paper ${className}`}>
      <svg viewBox="0 0 28 20" className="h-5 w-7" aria-hidden>
        <circle cx="9" cy="10" r="8" fill="#cbff4d" />
        <circle cx="19" cy="10" r="8" fill="#ff6a3d" style={{ mixBlendMode: "screen" }} />
      </svg>
      commons
    </span>
  );
}
