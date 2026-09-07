import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative base so the packaged Electron app can load dist/index.html via
  // loadFile() (file://): absolute `/assets/...` paths would point at the
  // drive root and render a blank white window.
  base: "./",
})
