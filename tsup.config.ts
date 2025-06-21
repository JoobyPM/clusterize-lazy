import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],

  /* browser-only output */
  format: ['esm', 'iife'],         // <script type="module">  +  plain <script>
  globalName: 'Clusterize',        // window.Clusterize for the IIFE build
  target: 'es2022',
  platform: 'browser',

  /* make the bundle self-contained */
  bundle: true,
  skipNodeModulesBundle: false,
  noExternal: ['@tanstack/virtual-core'],

  outExtension({ format }) {
    return { js: format === 'esm' ? '.esm.js' : '.iife.js' };
  },

  /* niceties */
  sourcemap: true,
  dts: true,
  minify: true,
  clean: true,
});
