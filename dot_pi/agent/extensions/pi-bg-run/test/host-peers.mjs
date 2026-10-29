// Resolve the host-provided TypeBox peer without installing a second copy.
import { createRequire, registerHooks } from "node:module";
const entry = process.env.PI_BG_RUN_HOST_ENTRY;
if (!entry) throw new Error("Set PI_BG_RUN_HOST_ENTRY to the installed Pi CLI entry point");
const typebox = createRequire(entry).resolve("typebox");
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "typebox") return nextResolve(typebox, context);
    return nextResolve(specifier, context);
  },
});
