import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Men's palette — olive/gold
        mens: {
          primary:   '#6B7645',  // olive
          secondary: '#B8972A',  // gold
          bg:        '#F5F3EC',
          surface:   '#FFFFFF',
          accent:    '#8A9A50',
        },
        // Women's palette — rose
        womens: {
          primary:   '#A0536A',  // rose
          secondary: '#D4748C',  // blush
          bg:        '#FDF5F7',
          surface:   '#FFFFFF',
          accent:    '#C4849A',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
