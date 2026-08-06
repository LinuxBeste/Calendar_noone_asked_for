/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,tsx,ts}', './web/**/*.{html,tsx,ts}', './shared/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#1a73e8',
          light: '#1a73e8',
          dark: '#8ab4f8'
        }
      }
    }
  },
  plugins: []
}
