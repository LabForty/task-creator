export const BRAND_RED = "#ED3B3B"; // design-tokens-allow: LabForty brand mark

/**
 * LabForty wordmark glyph — hexagonal frame interrupted by </> brackets with a
 * red diamond at its core. Strokes use currentColor so the parent's text color
 * (which switches with the theme) drives light/dark adaptation; the diamond's
 * brand red stays constant. Hover spins the frame 60°, the diamond breathes,
 * and a soft red glow blooms under the cursor (CSS in globals.css `.labforty-*`).
 */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <span className="labforty-mark inline-block text-ink" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%" fill="none" aria-hidden>
        <g
          className="labforty-mark__hex"
          stroke="currentColor"
          strokeWidth="4.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          <path d="M 50 6 L 88 28 L 88 72 L 50 94 L 12 72 L 12 28 Z" />
          <path d="M 30 32 L 16 50 L 30 68" />
          <path d="M 70 32 L 84 50 L 70 68" />
        </g>
        <path
          className="labforty-mark__diamond"
          d="M 50 22 L 60 50 L 50 78 L 40 50 Z"
          fill={BRAND_RED}
        />
      </svg>
    </span>
  );
}
