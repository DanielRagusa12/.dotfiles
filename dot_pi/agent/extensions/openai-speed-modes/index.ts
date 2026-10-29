import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const BASE_MODEL = "gpt-6.1-sol";
const PROVIDERS = ["openai", "openai-codex"] as const;
const MODES = [
  { id: `${BASE_MODEL}-fast`, name: "GPT-6.1 Sol (Fast)", tier: "priority" },
  { id: `${BASE_MODEL}-ultrafast`, name: "GPT-6.1 Sol (Ultra Fast)", tier: "ultrafast" },
] as const;

export default function (pi: ExtensionAPI) {
  for (const provider of PROVIDERS) {
    for (const mode of MODES) {
      pi.registerVirtualModel({
        provider,
        id: mode.id,
        name: mode.name,
        thinkingLevels: ["off", "minimal", "low", "medium", "high", "xhigh", "max"],
        route(request, ctx) {
          const model = ctx.modelRegistry.find(provider, BASE_MODEL);
          if (!model) throw new Error(`Model ${provider}/${BASE_MODEL} is not in the catalog`);
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
    if (!("model" in payload) || payload.model !== BASE_MODEL) return;

    // Preserve tools, reasoning, cache settings, and changes from earlier hooks.
    return { ...payload, service_tier: mode.tier };
  });
}
