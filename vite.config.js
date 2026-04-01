import { defineConfig } from 'vite'

export default defineConfig({
  base: '/birdie-growth/',
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  }
})
