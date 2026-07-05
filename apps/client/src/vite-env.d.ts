/// <reference types="vite/client" />

// Compile-time constants injected by vite.config.ts `define`. Absent when the
// code runs outside Vite (the tsx repro scripts) — buildinfo.ts guards for that.
declare const __APP_VERSION__: string | undefined;
declare const __BUILD_TIME__: string | undefined;

// wa-sqlite ships types for its main module + dist factory, but the example VFS
// classes under src/examples/ are untyped. Declare the one we use.
declare module 'wa-sqlite/src/examples/AccessHandlePoolVFS.js' {
  export class AccessHandlePoolVFS {
    constructor(directoryPath: string);
    readonly isReady: Promise<void>;
    close(): Promise<void>;
  }
}
