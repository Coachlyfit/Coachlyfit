/** Abstract head-and-shoulders placeholder. Never a stock photo. Takes its
 * color from `currentColor`, so the parent sets the tone. */
export function Silhouette({ width = "78%" }: { width?: string }) {
  return (
    <svg viewBox="0 0 100 110" aria-hidden="true" className="cs-sil" style={{ width }}>
      <circle cx="50" cy="36" r="19" fill="currentColor" />
      <path d="M10 110c0-25 18-42 40-42s40 17 40 42z" fill="currentColor" />
    </svg>
  );
}
