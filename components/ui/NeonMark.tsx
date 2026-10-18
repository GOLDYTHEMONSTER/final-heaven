/**
 * The brand mark as a neon sign: the one place the site glows.
 *
 * The logo PNG is used as a CSS mask over a conic gradient (ember, hot pink,
 * electric cyan) that rotates slowly, so the colour drifts through the tubes.
 * Three layers, back to front: a blurred glow, the coloured tube, and a
 * white-hot core, which is how real neon reads. On load it "ignites" with a
 * short flicker, once. With reduced motion: no flicker, no drift, static glow.
 * Styles: .neon-mark in app/globals.css.
 */
export function NeonMark({ className = '', label }: { className?: string; label?: string }) {
  return (
    <span
      className={`neon-mark ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {/* filter runs before mask in CSS, so the blur wraps a masked copy to spill past the logo's edges. */}
      <span className="neon-mark__glow">
        <span className="neon-mark__layer neon-mark__tube" />
      </span>
      <span className="neon-mark__layer neon-mark__tube" />
      <span className="neon-mark__layer neon-mark__core" />
    </span>
  )
}
