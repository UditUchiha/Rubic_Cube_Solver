import type { Config } from "tailwindcss";

// Neutral shades read from CSS variables (globals.css) so `slate-*` classes,
// written for the dark theme, flip automatically in light mode.
const themed = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;
const SLATE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Main text/line colour: near-white in dark mode, near-black in light.
        fg: themed("fg"),
        slate: Object.fromEntries(SLATE_STEPS.map((s) => [s, themed(`slate-${s}`)])),
      },
    },
  },
  plugins: [],
};
export default config;
