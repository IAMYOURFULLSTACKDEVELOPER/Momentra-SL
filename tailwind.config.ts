import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { serif: ["var(--font-serif)", "Georgia", "serif"], sans: ["var(--font-sans)", "system-ui", "sans-serif"] },
      colors: { blush: { 50: "#fdf6f4", 100: "#fae8e3", 500: "#c4766a", 600: "#a85d52", 700: "#8a4a41" }, ink: "#2b2523" },
    },
  },
  plugins: [],
} satisfies Config;
