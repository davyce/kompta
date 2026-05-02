import "./LimuleAvatar.css";

export type LimuleState = "idle" | "thinking" | "speaking";

type LimuleAvatarProps = {
  /** Visual state — controls animation variant */
  state?: LimuleState;
  /** Diameter in px (default 48) */
  size?: number;
  /** Extra Tailwind classes on the wrapper */
  className?: string;
  /** aria-label (default "Limule") */
  label?: string;
};

/**
 * Limule animated avatar.
 *
 * States:
 *   idle     → gentle float + ring pulse (waiting)
 *   thinking → rapid ring pulse + orbit dots (AI processing)
 *   speaking → fast float + gold ring (AI responding / streaming)
 *
 * Usage:
 *   <LimuleAvatar state="thinking" size={40} />
 */
export function LimuleAvatar({
  state = "idle",
  size = 48,
  className = "",
  label = "Limule",
}: LimuleAvatarProps) {
  return (
    <div
      className={`limule-avatar limule-avatar--${state} ${className}`}
      style={{ width: size, height: size }}
      aria-label={label}
      role="img"
    >
      <span className="limule-avatar__aura" />
      <span className="limule-avatar__ring" />
      <img
        className="limule-avatar__image"
        src="/assets/limule.svg"
        alt={label}
        draggable={false}
      />
      <span className="limule-avatar__dot limule-avatar__dot--one" />
      <span className="limule-avatar__dot limule-avatar__dot--two" />
      <span className="limule-avatar__dot limule-avatar__dot--three" />
    </div>
  );
}

/**
 * Compact inline icon — no aura/ring, just the SVG image.
 * Good for navlinks, table cells, small badges.
 */
export function LimuleIcon({
  size = 20,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src="/assets/limule.svg"
      alt="Limule"
      draggable={false}
      style={{ width: size, height: size, objectFit: "contain" }}
      className={className}
    />
  );
}
