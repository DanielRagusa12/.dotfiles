# OpenCode-compatible MCP for Pi

Global Pi extension adapting the MCP behavior of OpenCode `v1.18.18`. It advertises MCP roots only (not sampling, elicitation, or tasks), supports stdio, Streamable HTTP, SSE fallback, OAuth/PKCE, tools, prompts, resources, and server instructions.

## Configuration

Global configuration: `~/.pi/agent/mcp.jsonc`. A trusted project may override servers by name in `<project>/.pi/mcp.jsonc`; untrusted project configuration is never read.

```jsonc
{
  "servers": {
    "local": {
      "type": "local", // optional when command is present
      "command": ["npx", "-y", "some-mcp-server"],
      "cwd": ".",
      "environment": { "TOKEN": "{env:MY_TOKEN}" },
      "timeout": 30000
    },
    "remote": {
      "url": "https://example.test/mcp", // type inferred as remote
      "headers": { "Authorization": "Bearer {env:MCP_TOKEN}" },
      "oauth": { "scope": "tools", "callbackPort": 19876 }
    }
  }
}
```

`{env:NAME}` works in command strings, environment, URL, headers, and OAuth strings. Missing names are reported without displaying values. Remote OAuth defaults to enabled; use `"oauth": false` to disable it. OAuth callback URIs must use IPv4 loopback (`http://127.0.0.1`). Credentials are atomically stored with mode `0600` in `~/.pi/agent/mcp-auth.json` and bound to server name plus URL.

> Avoid `npx` for unpinned/untrusted servers. Prefer an audited, exact-pinned local executable.

## Commands

- `/mcp list`
- `/mcp add [name] [JSON server config]`
- `/mcp connect [name]`, `/mcp disconnect [name]`
- `/mcp auth [name]`, `/mcp auth list`
- `/mcp logout [name]`
- `/mcp debug <name>` (tokens/secrets are redacted)

MCP tools become `<sanitized-server>_<sanitized-tool>`. Prompts become `/<server>:<prompt>`. Resources are available through `list_mcp_resources`, `list_mcp_resource_templates`, `read_mcp_resource`, and TUI `@mcp:` completion.

## Development

The SDK patch must be applied after every clean install:

```sh
npm ci --ignore-scripts
npm run apply:sdk-patch
npm run check
npm test
npm run test:pi
npm audit
```

See `NOTICE.md` and `patches/modelcontextprotocol-sdk-1.29.0.patch` for upstream attribution and compatibility fixes.
