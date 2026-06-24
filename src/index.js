import { marked } from 'marked';

const SLUG_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SLUG_LEN = 8;

function randomSlug() {
  let s = '';
  const arr = new Uint8Array(SLUG_LEN);
  crypto.getRandomValues(arr);
  for (const b of arr) s += SLUG_CHARS[b % SLUG_CHARS.length];
  return s;
}

function authorized(request, env) {
  const auth = request.headers.get('Authorization') || '';
  return auth === `Bearer ${env.WRITE_TOKEN}`;
}

function htmlPage(title, body) {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escHtml(title)}</title>
<style>
  :root{--bg:#0f0f0f;--surface:#1a1a1a;--border:#2a2a2a;--text:#e0e0e0;--muted:#888;--accent:#4fc3f7;--mono:"JetBrains Mono","Fira Code",monospace}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);font-family:system-ui,sans-serif;font-size:16px;line-height:1.7;padding:2rem 1rem}
  .wrap{max-width:720px;margin:0 auto}
  .meta{font-size:.75rem;font-family:var(--mono);color:var(--muted);margin-bottom:2rem;display:flex;gap:1rem;flex-wrap:wrap}
  .raw-link{color:var(--accent);text-decoration:none}
  .raw-link:hover{text-decoration:underline}
  article h1,article h2,article h3,article h4{color:var(--text);margin:1.5rem 0 .5rem;line-height:1.3}
  article h1{font-size:1.8rem}article h2{font-size:1.35rem}article h3{font-size:1.1rem}
  article p{color:#ccc;margin-bottom:.9rem}
  article a{color:var(--accent)}
  article code{font-family:var(--mono);font-size:.85em;background:var(--surface);padding:.1em .35em;border-radius:4px;color:#f9a8d4}
  article pre{background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:1rem;overflow-x:auto;margin-bottom:1rem}
  article pre code{background:none;padding:0;color:#e0e0e0}
  article blockquote{border-left:3px solid var(--accent);padding-left:1rem;color:var(--muted);margin-bottom:1rem}
  article ul,article ol{padding-left:1.4rem;margin-bottom:.9rem;color:#ccc}
  article hr{border:none;border-top:1px solid var(--border);margin:1.5rem 0}
  article table{width:100%;border-collapse:collapse;margin-bottom:1rem;font-size:.9rem}
  article th,article td{border:1px solid var(--border);padding:.4rem .7rem;text-align:left}
  article th{background:var(--surface);color:var(--text)}
</style>
</head>
<body>
<div class="wrap">
  <div class="meta">
    <span>${escHtml(title)}</span>
    <a class="raw-link" href="?raw">raw ↗</a>
  </div>
  <article>${body}</article>
</div>
</body>
</html>`;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\//, '');
    const method = request.method.toUpperCase();

    // POST / — create new document
    if (method === 'POST' && (path === '' || path === 'docs')) {
      if (!authorized(request, env)) return new Response('Unauthorized', { status: 401 });
      const ct = request.headers.get('content-type') || '';
      let body;
      if (ct.includes('application/json')) {
        const json = await request.json();
        body = json.content;
      } else {
        body = await request.text();
      }
      if (!body?.trim()) return new Response('Empty content', { status: 400 });
      let slug = path === '' ? randomSlug() : randomSlug();
      // extract first heading as title hint
      const titleMatch = body.match(/^#\s+(.+)/m);
      const title = titleMatch ? titleMatch[1].trim() : slug;
      await env.DOCS.put(slug, body, {
        metadata: { title, createdAt: new Date().toISOString() }
      });
      const docUrl = `${url.origin}/${slug}`;
      return Response.json({ slug, url: docUrl, raw: `${docUrl}?raw` }, { status: 201 });
    }

    // PUT /:slug — update existing document
    if (method === 'PUT' && path) {
      if (!authorized(request, env)) return new Response('Unauthorized', { status: 401 });
      const existing = await env.DOCS.getWithMetadata(path);
      if (!existing.value) return new Response('Not found', { status: 404 });
      const ct = request.headers.get('content-type') || '';
      let body;
      if (ct.includes('application/json')) {
        const json = await request.json();
        body = json.content;
      } else {
        body = await request.text();
      }
      if (!body?.trim()) return new Response('Empty content', { status: 400 });
      const titleMatch = body.match(/^#\s+(.+)/m);
      const title = titleMatch ? titleMatch[1].trim() : (existing.metadata?.title || path);
      await env.DOCS.put(path, body, {
        metadata: { ...existing.metadata, title, updatedAt: new Date().toISOString() }
      });
      return Response.json({ slug: path, url: `${url.origin}/${path}` });
    }

    // DELETE /:slug
    if (method === 'DELETE' && path) {
      if (!authorized(request, env)) return new Response('Unauthorized', { status: 401 });
      await env.DOCS.delete(path);
      return new Response(null, { status: 204 });
    }

    // GET /:slug — render or raw
    if (method === 'GET' && path) {
      const { value: md, metadata } = await env.DOCS.getWithMetadata(path);
      if (!md) return new Response('Not found', { status: 404 });
      if (url.searchParams.has('raw')) {
        return new Response(md, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
      const title = metadata?.title || path;
      const html = htmlPage(title, marked.parse(md));
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }

    // GET / — landing
    if (method === 'GET' && path === '') {
      return new Response(`md-share — POST markdown to create a doc\n\nPOST /\n  Authorization: Bearer <WRITE_TOKEN>\n  Content-Type: text/plain\n  <markdown body>\n\nGET /:slug       → rendered HTML\nGET /:slug?raw   → raw markdown\nPUT /:slug       → update\nDELETE /:slug    → delete\n`, {
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      });
    }

    return new Response('Not found', { status: 404 });
  }
};
