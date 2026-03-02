import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
    plugins: [react()],
    clearScreen: false,
    server: {
        port: 1421,
        strictPort: true,
    },
    envPrefix: ['VITE_', 'TAURI_'],
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
    },
    build: {
        target: ['es2021', 'chrome100', 'safari13'],
        minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
        sourcemap: !!process.env.TAURI_DEBUG,
    },
});
