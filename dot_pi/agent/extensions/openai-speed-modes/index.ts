import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PROVIDERS = ["openai", "openai-codex"] as const;
const BASE_MODELS = [
  { id: "gpt-6.1-sol", name: "GPT-6.1 Sol" },
  { id: "gpt-6.2-astra", name: "GPT-6.2 Astra" },
  { id: "gpt-6.2-sol", name: "GPT-6.2 Sol" },
] as const;
const SPEEDS = [
  { suffix: "fast", label: "Fast", tier: "priority" },
  { suffix: "ultrafast", label: "Ultra Fast", tier: "ultrafast" },
] as const;
const MODES = BASE_MODELS.flatMap((base) => SPEEDS.map((speed) => ({
  id: `${base.id}-${speed.suffix}`,
  name: `${base.name} (${speed.label})`,
  baseModelId: base.id,
  tier: speed.tier,
})));

export default function (pi: ExtensionAPI) {
  for (const provider of PROVIDERS) {
    for (const mode of MODES) {
      pi.registerVirtualModel({
        provider,
        id: mode.id,
        name: mode.name,
        thinkingLevels: ["off", "minimal", "low", "medium", "high", "xhigh", "max"],
        route(request, ctx) {
          const model = ctx.modelRegistry.find(provider, mode.baseModelId);
          if (!model) throw new Error(`Model ${provider}/${mode.baseModelId} is not in the catalog`);
          // Pi clamps the selected thinking level to what the physical model supports.
          return { model, thinkingLevel: request.thinkingLevel };
        },
      });
    }
  }

  pi.on("before_provider_request", (event, ctx) => {
    // ctx.model is the user's virtual selection, not the routed physical model.
    if (!ctx.model || !PROVIDERS.some((provider) => provider === ctx.model?.provider)) return;
    const mode = MODES.find((mode) => mode.id === ctx.model?.id);
    if (!mode) return;

    const payload = event.payload;
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return;
    if (!("model" in payload) || payload.model !== mode.baseModelId) return;

    // Preserve tools, reasoning, cache settings, and changes from earlier hooks.
    return { ...payload, service_tier: mode.tier };
  });
}
