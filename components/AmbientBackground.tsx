/**
 * Static, dim aurora layer for the app shell. Derived from the sign-in aurora
 * vocabulary (globals.css `.ambient-*`) but much dimmer and NOT animated, so
 * dense panels stay legible. Decorative only — aria-hidden, pointer-events-none,
 * sits at -z-10 inside a `relative` shell.
 */
export function AmbientBackground({ tone = "idle" }: { tone?: "idle" | "running" | "success" } = {}) {
  return (
    <div
      aria-hidden
      data-tone={tone}
      className="ambient-bg pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <span className="ambient-blob ambient-blob--a" />
      <span className="ambient-blob ambient-blob--b" />
      <span className="ambient-blob ambient-blob--c" />
      <div className="ambient-grid absolute inset-0" />
      <div className="ambient-vignette absolute inset-0" />
    </div>
  );
}
