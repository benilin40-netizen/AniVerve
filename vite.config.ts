import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        manifest: false,
        includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'branding/*.svg'],
        devOptions: {
          enabled: true,
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
          navigateFallbackDenylist: [/^\/api\//, /^\/sitemap.*\.xml$/, /^\/robots\.txt$/],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/s4\.anilist\.co\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'anilist-artwork-cache',
                expiration: {
                  maxEntries: 250,
                  maxAgeSeconds: 60 * 60 * 24 * 14,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
              },
            },
            {
              urlPattern: /\/api\/anime\/(?:home|discovery-categories|explore|schedule|collections)/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'aniverve-catalog-api-cache',
                expiration: {
                  maxEntries: 60,
                  maxAgeSeconds: 60 * 10,
                },
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: false,
      ws: false as const,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
