import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryKV } from "@/lib/memkv";

test("memory store: TTL required, expiry, key cap, byte budget refuse new writes, replacing keeps the budget right", () => {
  let t = 0;
  const kv = new MemoryKV(3, 400, () => t);
  assert.throws(() => kv.set("a", "x", 0));
  assert.ok(kv.set("a", "1", 10));
  assert.ok(kv.set("b", "1", 10));
  assert.ok(kv.set("c", "1", 1));
  assert.equal(kv.set("d", "1", 10), false); // key cap
  t = 1_500; // c expired: room again after the sweep
  assert.ok(kv.set("d", "1", 10));
  assert.equal(kv.get("c"), null);
  assert.ok(kv.set("a", "y".repeat(50), 10)); // replace in place
  assert.equal(kv.set("e", "z".repeat(10), 10), false); // still 3 keys
  kv.del("b");
  assert.equal(kv.set("e", "z".repeat(300), 10), false); // byte budget
  assert.ok(kv.set("e", "z".repeat(20), 10));
  assert.ok(kv.stats().bytes <= 400);
  t = 20_000;
  assert.equal(kv.get("a"), null);
  kv.sweep();
  assert.deepEqual(kv.stats(), { keys: 0, bytes: 0 });
});
