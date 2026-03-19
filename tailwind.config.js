/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary": "#22D3EE", // Cyan Accent
        "surface": "#121212",
        "surface-muted": "#1A1A1A",
        "border-subtle": "#262626",
        "status": {
          "collected": "#10B981",
          "overdue": "#EF4444",
          "expenses": "#F59E0B",
          "drafts": "#6366F1"
        }
      },
      fontFamily: {
        "sans": ["Instrument Sans", "sans-serif"],
        "display": ["Syne", "sans-serif"],
        "mono": ["JetBrains Mono", "monospace"]
      },
      borderRadius: {
        "DEFAULT": "8px", 
        "lg": "12px", 
        "xl": "16px", 
        "full": "9999px"
      },
    },
  },
  plugins: [],
}
