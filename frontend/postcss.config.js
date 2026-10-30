// Local PostCSS config for the Vite frontend. Overrides the root project's
// postcss.config.mjs (which has Tailwind plugins for the Next.js app) so Vite
// doesn't try to load them. The CRM frontend uses plain CSS (styles.css).
export default { plugins: [] }
