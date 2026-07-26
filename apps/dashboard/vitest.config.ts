import { defineConfig } from 'vitest/config';

// The Angular unit-test builder merges this over its own configuration.
//
// The explicit URL matters: jsdom only exposes `localStorage` on a window with
// a real origin, and these specs cover storage-backed services.
export default defineConfig({
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: { url: 'http://localhost' },
    },
  },
});
