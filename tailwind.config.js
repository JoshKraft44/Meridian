/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        base: '#111113',
        surface: '#18181b',
        elevated: '#1c1c1f',
        border: '#27272a',
        'border-hover': '#3f3f46',
        'text-primary': '#fafafa',
        'text-secondary': '#a1a1aa',
        'text-muted': '#71717a',
        positive: '#10b981',
        negative: '#f87171',
        warning: '#f59e0b'
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.4)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.5)'
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)'
      }
    }
  },
  plugins: []
};
