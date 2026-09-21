/// <reference types="vite/client" />

if (import.meta.env.VITE_STANDALONE_MODE === 'true') {
    void import('./vite-entry-app')
}

export {}
