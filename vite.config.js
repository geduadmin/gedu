import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Local development: run the Vercel Functions in /api inside the Vite dev server,
 * so `npm run dev` works like the deployment. Environment variables come from .env.local
 * (e.g. copied from Vercel with `vercel env pull`). Without DATABASE_URL the app runs in
 * local mode (data stays in the browser).
 */
function vercelApiInDev() {
  return {
    name: 'vercel-api-in-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const m = /^\/api\/([a-z-]+)\/?$/.exec(url.pathname);
        if (!m) return next();
        let mod;
        try {
          mod = await server.ssrLoadModule(`/api/${m[1]}.js`);
        } catch (e) {
          if (String(e?.message).includes('Failed to load url') || e?.code === 'ERR_LOAD_URL') {
            res.statusCode = 404;
            return res.end('Not found');
          }
          throw e;
        }
        const handler = mod[req.method];
        if (!handler) {
          res.statusCode = 405;
          return res.end('Method not allowed');
        }
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) {
          if (['connection', 'content-length', 'transfer-encoding', 'host'].includes(k) || v === undefined) continue;
          headers.set(k, Array.isArray(v) ? v.join(', ') : v);
        }
        const request = new Request(url, {
          method: req.method,
          headers,
          body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
        });
        try {
          const response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => {
            if (k !== 'set-cookie') res.setHeader(k, v);
          });
          const cookies = response.headers.getSetCookie?.() ?? [];
          if (cookies.length) res.setHeader('set-cookie', cookies);
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          console.error(e);
          res.statusCode = 500;
          res.end('Server error');
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // make .env / .env.local values visible to the API code (process.env) during dev
  Object.assign(process.env, { ...loadEnv(mode, process.cwd(), ''), ...process.env });
  return { plugins: [react(), vercelApiInDev()] };
});
