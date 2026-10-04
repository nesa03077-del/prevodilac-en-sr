import { defineConfig } from 'vite';

// Sigurnosna politika samo u završnoj verziji (razvojni server ubacuje svoje skripte).
// Stranica sme da se javlja jedino na Anthropic API.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src https://api.anthropic.com",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function cspPlugin() {
  return {
    name: 'prevodilac-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    ],
  };
}

export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  plugins: [cspPlugin()],
});
