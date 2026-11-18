/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the deployed Chess.com callback proxy (proxy/worker.ts). */
  readonly VITE_CHESSCOM_PROXY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
