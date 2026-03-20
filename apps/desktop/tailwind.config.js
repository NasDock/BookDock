/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        sepia: {
          50: '#fdf8f0',
          100: '#f5ebe0',
          200: '#e8ddd0',
          300: '#d4c4a8',
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
