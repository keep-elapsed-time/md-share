# md-share

Markdown document sharing via Cloudflare Worker + KV.

## Setup

```bash
# 1. Install deps
npm install

# 2. Create KV namespace
wrangler kv:namespace create DOCS
wrangler kv:namespace create DOCS --preview
# → paste the IDs into wrangler.toml

# 3. Set write token (secret)
wrangler secret put WRITE_TOKEN

# 4. Deploy
npm run deploy
```

## Usage

```bash
# Create a doc
curl -X POST https://your-worker.workers.dev/ \
  -H "Authorization: Bearer <WRITE_TOKEN>" \
  -H "Content-Type: text/plain" \
  --data-binary "# Hello World\n\nThis is my doc."
# → {"slug":"abc12345","url":"https://...","raw":"..."}

# View rendered
open https://your-worker.workers.dev/abc12345

# View raw markdown
open https://your-worker.workers.dev/abc12345?raw

# Update
curl -X PUT https://your-worker.workers.dev/abc12345 \
  -H "Authorization: Bearer <WRITE_TOKEN>" \
  -H "Content-Type: text/plain" \
  --data-binary "# Updated\n\nNew content."

# Delete
curl -X DELETE https://your-worker.workers.dev/abc12345 \
  -H "Authorization: Bearer <WRITE_TOKEN>"
```

## Local dev

```bash
echo "WRITE_TOKEN=your-secret-token" > .dev.vars
npm run dev
```
