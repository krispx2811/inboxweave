import assert from "node:assert/strict";
import { test } from "node:test";
import { runPool } from "../src/lib/comment-dm/pool.ts";

test("runs at most `limit` workers at once and processes every item", async () => {
  let running = 0;
  let peak = 0;
  const done: number[] = [];
  await runPool(Array.from({ length: 12 }, (_, i) => i), 5, async (n) => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running--;
    done.push(n);
  });
  assert.equal(peak, 5);
  assert.deepEqual(done.sort((a, b) => a - b), Array.from({ length: 12 }, (_, i) => i));
});

test("a worker that catches its own error doesn't stop the rest", async () => {
  const done: number[] = [];
  await runPool([1, 2, 3, 4], 2, async (n) => {
    try {
      if (n === 2) throw new Error("boom");
      done.push(n);
    } catch {
      // handled per item, like index.ts does
    }
  });
  assert.deepEqual(done.sort(), [1, 3, 4]);
});

test("an empty list resolves at once", async () => {
  await runPool([], 5, async () => assert.fail("no items"));
});
