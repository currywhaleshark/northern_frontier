import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      ignored: [
        '**/tools/render/**',
        '**/backup_json/**',
        '**/debug_output*/**',
        '**/tmp/**',
        '**/dist/**',
      ],
    },
  },
});
