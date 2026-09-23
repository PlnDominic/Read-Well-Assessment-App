// Vitest runs under plain Node, not Next.js's server/client bundling
// boundary, so the real `server-only` package (which unconditionally
// throws to enforce that boundary at build time) would break every unit
// test that imports a file marked server-only. This no-op stands in for it;
// see the `server-only` alias in vitest.config.ts.
export {};
