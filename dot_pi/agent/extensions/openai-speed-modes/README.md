# OpenAI speed modes for Pi

A dependency-free extension for Pi. It adds these virtual models under both `openai` and `openai-codex`:

| Picker name | Local model ID | Request service tier |
| --- | --- | --- |
| GPT-6.2 Astra (Fast) | `gpt-6.2-astra-fast` | `priority` |
| GPT-6.2 Astra (Ultra Fast) | `gpt-6.2-astra-ultrafast` | `ultrafast` |
| GPT-6.2 Sol (Fast) | `gpt-6.2-sol-fast` | `priority` |
| GPT-6.2 Sol (Ultra Fast) | `gpt-6.2-sol-ultrafast` | `ultrafast` |
| GPT-6.1 Sol (Fast) | `gpt-6.1-sol-fast` | `priority` |
| GPT-6.1 Sol (Ultra Fast) | `gpt-6.1-sol-ultrafast` | `ultrafast` |

Each alias routes to its matching base model on the same provider. It uses the base model's authentication, endpoint, tools, and supported thinking levels. The alias IDs are never sent to the server, and the extension doesn't change your default selection.

## Use

Load this directory from `~/.pi/agent/extensions/openai-speed-modes`, then restart Pi or run `/reload`. Run `/model` and search for `6.2` to select a mode. Select the entry without a speed suffix to stop overriding the provider's tier.

For a single invocation from this directory:

```bash
pi -e ./index.ts --model openai-codex/gpt-6.2-sol-fast
pi -e ./index.ts --model openai-codex/gpt-6.2-astra-ultrafast
```

Use `openai/` instead of `openai-codex/` for API-key access. Each provider requires its normal credentials.

## Limits and pricing

These are service tiers, not separate upstream models. Availability depends on the endpoint and account. See OpenAI's [GPT-6.2 launch notes](https://developers.openai.com/codex/whats-new/gpt-62-astra-sol) for Codex plan eligibility. A provider may reject or ignore the requested tier. This extension does not silently retry at another tier or claim that a request received faster service.

Fast and Ultra Fast can cost more. Pi's cost estimates still use its physical-model pricing logic, which may not account for these tiers correctly, especially `ultrafast`. Check provider billing rather than relying on the displayed estimate.

The request hook applies to base-model requests while a speed alias is selected, including retries, tool follow-ups, and summaries. Nested requests for the same base model also inherit the selection's tier. Requests for other model IDs are left unchanged. Pi shows unknown virtual context limits before the first response, then uses the routed physical model's limits.

## Test

Requires a Node.js version with built-in TypeScript stripping:

```bash
node --test index.test.mjs
```

Tests are offline and do not read credentials or send model requests.
