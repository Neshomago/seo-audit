import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { auditApi } from './server/audit-api';

export default defineConfig({
  plugins: [react(), tailwindcss(), auditApi()],
  server: { port: 5173 },
  preview: { port: 4173 },
});
