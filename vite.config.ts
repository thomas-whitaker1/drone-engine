/// <reference types="vitest/config" />
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/**
 * The licences travel with the build.
 *
 * `dist/` carries six font files, and the SIL Open Font License and the Apache
 * License both ask that their text go wherever the fonts go. The texts are in
 * src/fonts/licenses and nothing imports them, so without this they would stay
 * in the repo while the fonts went out — onto a host, or into a zip. The
 * board's own MIT licence goes with them for the same reason.
 *
 * They land at fixed names, unhashed, so a person looking for them finds them:
 * `dist/LICENSE.txt` and `dist/licenses/*`.
 */
function licences(): Plugin {
  const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
  return {
    name: 'drone-engine:licences',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'LICENSE.txt', source: readFileSync(here('./LICENSE')) });
      for (const name of readdirSync(here('./src/fonts/licenses'))) {
        this.emitFile({
          type: 'asset',
          fileName: `licenses/${name}`,
          source: readFileSync(here(`./src/fonts/licenses/${name}`)),
        });
      }
    },
  };
}

export default defineConfig({
  // Relative asset URLs, so the built board runs from wherever it is dropped —
  // a subfolder on a host, a zip someone unpacked — and not only from a domain
  // root. Nothing in here routes, so there is no path to break.
  base: './',
  plugins: [licences()],
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The page asks the network for nothing (gt#94), and a suite must never be
    // the one to start. happy-dom would fetch any stylesheet `<link>` a test
    // mounted — so if one ever appears, a run with the network down still runs
    // with the same timing.
    environmentOptions: {
      happyDOM: {
        settings: { disableCSSFileLoading: true, handleDisabledFileLoadingAsSuccess: true },
      },
    },
  },
});
