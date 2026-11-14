/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  base: './',
  // For local work against the backend: VITE_DATA_SOURCE=api npm run dev (backend on :8000, or set API_TARGET).
  server: { proxy: { '/api': loadEnv(mode, '.', '').API_TARGET || 'http://localhost:8000' } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
}));
