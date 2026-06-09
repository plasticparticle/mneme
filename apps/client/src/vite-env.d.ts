/// <reference types="vite/client" />

// wa-sqlite ships types for its main module + dist factory, but the example VFS
// classes under src/examples/ are untyped. Declare the one we use.
declare module 'wa-sqlite/src/examples/AccessHandlePoolVFS.js' {
  export class AccessHandlePoolVFS {
    constructor(directoryPath: string);
    readonly isReady: Promise<void>;
    close(): Promise<void>;
  }
}
