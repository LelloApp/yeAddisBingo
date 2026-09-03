/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
      primary: '#FFD700',    // Your custom Gold accent
      secondary: '#1A1A2E',  // Dark royal background
      accent: '#E94560',     // Vibrant button callout
    }
    },
  },
  plugins: [],
};
