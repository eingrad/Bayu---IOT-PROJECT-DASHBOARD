/// <reference types="vite/client" />

interface ImportMetaEnv {
  // All optional: the defaults in src/config/api.ts (relative paths behind the
  // reverse proxy) are what production uses. Set these only to point the
  // frontend at a backend on a different origin.
  readonly VITE_API_BASE?: string;
  readonly VITE_PUBLIC_API_BASE?: string;
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
