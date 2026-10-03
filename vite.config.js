// `vite build --mode library` builds the package into dist/. Every other mode serves or builds the demo from src/.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));

const library = {
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    lib: {
      entry: resolve(root, 'src/index.ts'),
      formats: ['es'],
    },
    rollupOptions: {
      external: (id) => id.startsWith('@videojs/') || id === 'hls.js',
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
      },
    },
  },
};

const demo = {
  root: resolve(root, 'demo'),
  base: process.env.VITE_BASE || '/',
  resolve: {
    alias: { 'videojs-hlsjs-iframe-thumbnail': resolve(root, 'src/index.ts') },
  },
  // Pre-bundled up front: discovering them per page triggers a reload mid-test.
  optimizeDeps: {
    include: [
      'hls.js',
      '@videojs/html',
      '@videojs/html/video/player',
      '@videojs/html/video/skin',
      '@videojs/html/media/hlsjs-video',
      '@videojs/html/ui/container',
      '@videojs/html/ui/time-slider',
      '@videojs/html/ui/slider-track',
      '@videojs/html/ui/slider-buffer',
      '@videojs/html/ui/slider-fill',
      '@videojs/html/ui/slider-value',
      '@videojs/element/context',
      'react',
      'react-dom/client',
      'react/jsx-runtime',
    ],
  },
  server: { port: 5174 },
  build: {
    outDir: resolve(root, 'dist-demo'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      input: {
        index: resolve(root, 'demo/index.html'),
        custom: resolve(root, 'demo/custom.html'),
        advanced: resolve(root, 'demo/advanced.html'),
        react: resolve(root, 'demo/react.html'),
      },
    },
  },
};

export default defineConfig(({ mode }) => (mode === 'library' ? library : demo));
