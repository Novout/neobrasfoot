/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Versão do package.json, injetada pelo vite-plugin-package-version. */
  readonly PACKAGE_VERSION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
