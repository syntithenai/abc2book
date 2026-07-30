/** Vite lesson-preview build — relative static hosting. */
export function runtimePublicBase() {
  const base = import.meta.env.BASE_URL || ''
  return base === './' ? '' : String(base).replace(/\/$/, '')
}
