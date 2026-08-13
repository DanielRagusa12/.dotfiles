# OpenCode Web Tools for Pi

A private global Pi extension that ports OpenCode's `webfetch` and `websearch` tools and adapts their tool rows to Pi's terminal UI.

## Provenance

Behavior and presentation are pinned to OpenCode commit:

`cc4b45612974f735ddec46009ede07729511fba4`

Primary references:

- `packages/opencode/src/tool/webfetch.ts` and `webfetch.txt`
- `packages/opencode/src/tool/websearch.ts`, `websearch.txt`, and `mcp-websearch.ts`
- `packages/session-ui/src/components/message-part.tsx` and `message-part.css`

HTML conversion dependencies are pinned to OpenCode's versions: `htmlparser2@8.0.2` and `turndown@7.2.0`.

## Installation and reload

This extension is already installed globally at:

`~/.pi/agent/extensions/opencode-web/`

Pi auto-discovers it in every project. After editing it, run:

```text
/reload
```

In this dotfiles setup, chezmoi's symlink mode resolves extension imports from the source directory. A `run_onchange` chezmoi script restores the pinned dependencies whenever `package-lock.json` changes, using lifecycle scripts disabled. To restore them manually:

```bash
cd "$(chezmoi source-path)/dot_pi/agent/extensions/opencode-web"
npm ci --ignore-scripts
```

## Tools

### `webfetch`

Fetches an HTTP or HTTPS URL as `markdown` (default), `text`, or `html`.

- 30-second default timeout; caller-selectable up to 120 seconds
- 5 MB response limit
- OpenCode's Accept headers and browser user agent
- Retries a Cloudflare challenge with the honest `opencode` user agent
- Converts HTML with OpenCode's exact parser/Turndown configuration
- Returns raster images as Pi image tool-result content; SVG remains text
- Truncates model-facing text to 2,000 lines or 50 KB and saves the complete output under `/tmp/pi-webfetch-*`

Like the pinned OpenCode implementation, ordinary redirects are followed and localhost/private-network URLs are allowed.

### `websearch`

Uses OpenCode's local web-search backends:

- Exa: `https://mcp.exa.ai/mcp`
- Parallel: `https://search.parallel.ai/mcp`

Without an override, provider selection is stable per Pi session using OpenCode's FNV-1a/base-36 checksum split. Anonymous provider access is attempted when no key is configured.

Optional environment variables:

```bash
export EXA_API_KEY=...
export PARALLEL_API_KEY=...
export OPENCODE_WEBSEARCH_PROVIDER=exa       # or parallel
```

OpenCode-compatible provider flags are also recognized:

```bash
export OPENCODE_EXPERIMENTAL=true        # also enables Exa, matching OpenCode
export OPENCODE_ENABLE_EXA=true
export OPENCODE_ENABLE_PARALLEL=true
```

Parallel takes precedence if both flags are enabled. Search calls time out after 25 seconds. JSON and SSE JSON-RPC responses are supported.

## Network and security behavior

As requested, the extension performs network requests directly **without permission prompts**. Tool calls can send URLs, search queries, the Pi session ID, and (for Parallel) the current model ID to external services. Optional API keys are used only in transport credentials and are not included in tool output.

`webfetch` intentionally accepts localhost and private-network targets for parity with OpenCode. Only use the extension with models and prompts you trust.

## UI adaptation

OpenCode's graphical app uses SolidJS, CSS, clickable links, and shimmer animation. Pi renders terminal cells, so pixel-identical output is impossible. The Pi renderer preserves the same information hierarchy:

- window-style glyph
- `Web Fetch` plus URL
- provider-aware `Exa Web Search` / `Parallel Web Search` labels
- query subtitle
- compact collapsed status
- extracted result links in expanded tool output

Model-facing output is unchanged across TUI, print, JSON, and RPC modes; only terminal presentation is customized.

## Development

```bash
cd "$(chezmoi source-path)/dot_pi/agent/extensions/opencode-web"
npm test
npm run check
npm run test:pi   # global discovery, schemas, dynamic year, and narrow-width renderers
pi -e ~/.pi/agent/extensions/opencode-web/index.ts --list-models
```
