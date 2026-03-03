/** @type {import('tailwindcss').Config} */
module.exports = {
    // NativeWind v4 content paths
    content: [
        './App.{js,jsx,ts,tsx}',
        './index.{js,jsx,ts,tsx}',
        './src/**/*.{js,jsx,ts,tsx}',
    ],
    presets: [require('nativewind/preset')],
    theme: {
        extend: {
            colors: {
                // ── Skill-Bridge Design Tokens (README spec — do NOT use Stitch #0f1729) ──
                'brand-navy': '#0F172A', // Primary brand / buttons
                'brand-white': '#FFFFFF', // Background
                'brand-surface': '#F8FAFC', // Cards / inputs
                'brand-border': '#E2E8F0', // Borders / dividers
                'text-primary': '#1E293B', // Dark Slate
                'text-secondary': '#64748B', // Medium Slate
                'brand-emerald': '#10B981', // Verified badges
            },
        },
    },
    plugins: [],
};
