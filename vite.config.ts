import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { writeFileSync, mkdirSync } from 'node:fs';

// On GitHub Pages the app is served from /<repo>/, so assets need that base.
// Local dev/build stay at root.
const base = process.env.GITHUB_ACTIONS ? '/College-Football-Dynasty/' : '/';

// Build identity: lets the running app detect that a newer deploy exists
// (version.json is fetched cache-busted) and shows a visible stamp in the UI.
const buildId = String(Date.now());
const buildTag = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

function emitVersionJson(): Plugin {
  return {
    name: 'emit-version-json',
    apply: 'build',
    writeBundle() {
      mkdirSync('dist', { recursive: true });
      writeFileSync('dist/version.json', JSON.stringify({ build: buildId, tag: buildTag }));
    },
  };
}

export default defineConfig({
  base,
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
    __BUILD_TAG__: JSON.stringify(buildTag),
  },
  plugins: [
    react(),
    emitVersionJson(),
    VitePWA({
      registerType: 'autoUpdate',
      // We register the service worker ourselves in main.tsx so we can force
      // an immediate reload when a new version takes control — otherwise an
      // already-open tab keeps running the stale cached build after a deploy.
      injectRegister: false,
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
