import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// On GitHub Pages the app is served from /<repo>/, so assets need that base.
// Local dev/build stay at root.
const base = process.env.GITHUB_ACTIONS ? '/College-Football-Dynasty/' : '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Gridiron Land',
        short_name: 'Gridiron',
        description:
          'Football franchise game: playable 2D arcade games plus a deep league simulation.',
        theme_color: '#0b3d2e',
        background_color: '#0a0f0d',
        display: 'standalone',
        orientation: 'landscape',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as Parameters<typeof defineConfig>[0]);
