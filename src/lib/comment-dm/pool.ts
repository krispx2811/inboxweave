/**
 * Run `worker` over every item, at most `limit` at a time. The worker must
 * not throw (catch inside it); one slow item never holds up the others.
 */
export async function runPool<T>(items: readonly T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await worker(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}
