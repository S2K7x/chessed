/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the deployed Chess.com callback proxy (proxy/worker.ts). */
  readonly VITE_CHESSCOM_PROXY?: string;
  /** URL of the proxy's /coach endpoint (language-model coach). */
  readonly VITE_COACH_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
