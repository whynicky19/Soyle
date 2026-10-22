import assert from "node:assert/strict";
import test from "node:test";
import { api, ApiError } from "../lib/api.ts";

test("HTTP conflicts preserve their status so a stale game can refresh instead of resubmitting", async (t) => {
  const originalWindow = globalThis.window, originalFetch = globalThis.fetch;
  globalThis.window = { setTimeout, clearTimeout };
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: "Результат уже сохранён" }), { status: 409 });
  t.after(() => { globalThis.window = originalWindow; globalThis.fetch = originalFetch; });
  await assert.rejects(api('/api/sessions', { method: 'POST', body: '{}' }), error => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 409);
    assert.equal(error.message, 'Результат уже сохранён');
    return true;
  });
});
