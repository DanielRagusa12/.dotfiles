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

for (const provider of ["openai", "openai-codex"]) {
  for (const [suffix, tier] of [["fast", "priority"], ["ultrafast", "ultrafast"]]) {
    test(`${provider}/${suffix} routes to the base model and sets ${tier}`, () => {
      const { models, transform } = setup();
      const selection = { provider, id: `gpt-6.1-sol-${suffix}` };
      const model = { provider, id: "gpt-6.1-sol", api: "openai-responses" };
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
    });
  }
}

test("registers only the four intended virtual entries", () => {
  assert.equal(setup().models.length, 4);
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
