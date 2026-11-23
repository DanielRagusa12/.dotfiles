import assert from "node:assert/strict";
import test from "node:test";
import extension from "./index.ts";

function setup() {
  const models = [];
  const handlers = new Map();
  extension({
    registerVirtualModel(model) { models.push(model); },
    on(event, handler) { handlers.set(event, handler); },
  });
  return { models, transform: handlers.get("before_provider_request") };
}

const baseModels = ["gpt-6.1-sol", "gpt-6.2-astra", "gpt-6.2-sol"];

for (const provider of ["openai", "openai-codex"]) {
  for (const baseModelId of baseModels) {
    for (const [suffix, tier] of [["fast", "priority"], ["ultrafast", "ultrafast"]]) {
      test(`${provider}/${baseModelId}-${suffix} routes to the base model and sets ${tier}`, () => {
        const { models, transform } = setup();
        const selection = { provider, id: `${baseModelId}-${suffix}` };
        const model = { provider, id: baseModelId };
        const ctx = {
          model: selection,
          modelRegistry: {
            find(p, id) {
              assert.equal(p, provider);
              assert.equal(id, model.id);
              return model;
            },
          },
        };
        const virtual = models.find((entry) => entry.provider === provider && entry.id === selection.id);
        assert.ok(virtual);
        for (const reason of ["user", "continuation", "retry", "direct"]) {
          assert.deepEqual(virtual.route({ thinkingLevel: "high", reason }, ctx), {
            model, thinkingLevel: "high",
          });
        }
        const payload = {
          model: model.id,
          input: [{ role: "user", content: "test" }],
          tools: [{ type: "function", name: "read" }],
          reasoning: { effort: "high" },
          service_tier: "auto",
        };
        assert.deepEqual(transform({ payload }, ctx), { ...payload, service_tier: tier });
        assert.equal(payload.service_tier, "auto", "does not mutate the original payload");
        for (const otherId of baseModels.filter((id) => id !== baseModelId)) {
          assert.equal(transform({ payload: { ...payload, model: otherId } }, ctx), undefined);
        }
        assert.equal(transform({ payload }, { model }), undefined);
      });
    }
  }
}

test("registers only the twelve intended virtual entries", () => {
  assert.equal(setup().models.length, 12);
});

test("leaves base selections, unrelated providers, and other requests unchanged", () => {
  const { transform } = setup();
  for (const model of [undefined,
    { provider: "openai", id: "gpt-6.1-sol" },
    { provider: "openai-codex", id: "gpt-6.1-sol" },
    { provider: "other", id: "gpt-6.1-sol-fast" },
    { provider: "openai", id: "another-model" },
  ]) {
    assert.equal(transform({ payload: { model: "gpt-6.1-sol" } }, { model }), undefined);
  }
  const ctx = { model: { provider: "openai", id: "gpt-6.1-sol-fast" } };
  for (const payload of [null, undefined, "text", [], {}, { model: "another-model" }]) {
    assert.equal(transform({ payload }, ctx), undefined);
  }
});

test("missing base model fails with a useful error", () => {
  const { models } = setup();
  assert.throws(() => models[0].route({ thinkingLevel: "high" }, {
    modelRegistry: { find() { return undefined; } },
  }), /Model openai\/gpt-6\.1-sol is not in the catalog/);
});
