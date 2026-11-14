// Bundles the three entry points. Each output is a single file so the sandboxed
// preload never needs `require` at runtime.
import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';

const common = {
  bundle: true,
  sourcemap: true,
  logLevel: 'info',
  target: 'es2022',
};

await mkdir('dist', { recursive: true });

await build({
  ...common,
  entryPoints: ['src/main/index.ts'],
  outfile: 'dist/main.js',
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
});

await build({
  ...common,
  entryPoints: ['src/preload/index.ts'],
  outfile: 'dist/preload.js',
  platform: 'browser',
  format: 'iife',
  external: ['electron'],
  loader: { '.css': 'text' },
});

await copyFile('src/layer/ui/tv.css', 'dist/tv.css');
