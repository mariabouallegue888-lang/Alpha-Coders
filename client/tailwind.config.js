export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { colors: { campus: 'var(--accent)', ink: 'var(--ink)', canvas: 'var(--canvas)', surface: 'var(--surface)', stroke: 'var(--border)', brand: { DEFAULT: 'var(--accent)', soft: 'var(--accent-soft)', strong: 'var(--accent-strong)' } }, fontFamily: { sans: ['Inter', 'Segoe UI Variable', 'Segoe UI', 'system-ui', 'sans-serif'] }, borderRadius: { panel: 'var(--radius-lg)' }, boxShadow: { card: 'var(--shadow-card)' } } },
  plugins: [],
};
