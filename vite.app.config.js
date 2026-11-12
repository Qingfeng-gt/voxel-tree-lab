// Config file for running the demo locally.
//
// Dev (`vite` / `npm run dev`)   → alias points to lib source for instant HMR.
// Prod (`vite build`)            → alias points to the prebuilt lib artifact.
import path from 'path';

/**
 * @type {import('vite').UserConfigFn}
 */
export default ({ command }) => ({
  // 使用相对 base，使构建产物可以部署在任意子路径（如 GitHub Pages 的 /<repo>/）
  base: command === 'build' ? './' : '/',
  build: {
    emptyOutDir: true,
    outDir: '../../dist',
    sourcemap: true,
  },
  root: './src/app',
  resolve: {
    alias: {
      '@dgreenheck/ez-tree': command === 'serve'
        ? path.resolve(__dirname, 'src/lib/index.js')
        : path.resolve(__dirname, 'build/ez-tree.es.js'),
    },
  },
  server: {
    hmr: true,
  },
  assetsInclude: ['**/*.frag', '**/*.vert'],
});
