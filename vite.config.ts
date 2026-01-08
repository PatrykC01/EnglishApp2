import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react()],
    define: {
      // Polyfill process.env for the existing code structure
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      // Add support for HF Key from .env
      'process.env.HUGGING_FACE_API_KEY': JSON.stringify(env.HUGGING_FACE_API_KEY || env.VITE_HUGGING_FACE_API_KEY)
    }
  };
});
