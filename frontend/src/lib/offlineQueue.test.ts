import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";

import { enqueue, listPending, dequeue, clearAll } from "./offlineQueue";

const samplePayload = {
  payment_method: "cash",
  payment_account_id: null,
  items: [{ product_id: 1, quantity: 2 }],
};

describe("offlineQueue — persistence (IndexedDB)", () => {
  beforeEach(() => {
    // Fresh IndexedDB per test so queued items from a previous test never leak in
    // and mask a real persistence bug (e.g. a queue that silently fails to save).
    (globalThis as any).indexedDB = new IDBFactory();
  });

  it("queuing an action while offline persists it (readable back from storage)", async () => {
    await enqueue(samplePayload);
    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].payload).toEqual(samplePayload);
    expect(pending[0].id).toBeDefined();
    expect(typeof pending[0].queued_at).toBe("string");
  });

  it("persists across a fresh read of the same IndexedDB (simulates reload)", async () => {
    await enqueue(samplePayload);
    // Simulate a page reload: nothing in memory carries over, only IndexedDB does.
    // Re-reading via listPending() opens a brand new connection to the same DB.
    const pendingAfterReload = await listPending();
    expect(pendingAfterReload).toHaveLength(1);
    expect(pendingAfterReload[0].payload.items[0].product_id).toBe(1);
  });

  it("preserves FIFO order across multiple queued sales", async () => {
    await enqueue({ ...samplePayload, items: [{ product_id: 1, quantity: 1 }] });
    await enqueue({ ...samplePayload, items: [{ product_id: 2, quantity: 1 }] });
    await enqueue({ ...samplePayload, items: [{ product_id: 3, quantity: 1 }] });

    const pending = await listPending();
    expect(pending.map((p) => p.payload.items[0].product_id)).toEqual([1, 2, 3]);
    // ids should be monotonically increasing, confirming insertion order is preserved
    expect(pending[0].id!).toBeLessThan(pending[1].id!);
    expect(pending[1].id!).toBeLessThan(pending[2].id!);
  });

  it("dequeue removes only the targeted item, preserving order of the rest", async () => {
    const id1 = await enqueue({ ...samplePayload, items: [{ product_id: 1, quantity: 1 }] });
    const id2 = await enqueue({ ...samplePayload, items: [{ product_id: 2, quantity: 1 }] });
    const id3 = await enqueue({ ...samplePayload, items: [{ product_id: 3, quantity: 1 }] });

    await dequeue(id2);

    const pending = await listPending();
    expect(pending.map((p) => p.id)).toEqual([id1, id3]);
  });

  it("clearAll empties the queue", async () => {
    await enqueue(samplePayload);
    await enqueue(samplePayload);
    await clearAll();
    expect(await listPending()).toHaveLength(0);
  });
});

describe("offlineQueue — flush simulation (sync loop as used by PosPage)", () => {
  beforeEach(() => {
    (globalThis as any).indexedDB = new IDBFactory();
  });

  /**
   * Mirrors the sync loop in PosPage.syncPending(): for each pending row, call the
   * API; on success dequeue it, on failure leave it in the queue (caught, no throw).
   */
  async function flush(apiCall: (payload: unknown) => Promise<void>) {
    const rows = await listPending();
    let synced = 0;
    for (const row of rows) {
      try {
        await apiCall(row.payload);
        await dequeue(row.id!);
        synced++;
      } catch {
        /* keep in queue for retry, matches PosPage behavior */
      }
    }
    return synced;
  }

  it("flushes and clears the queue when the API call succeeds", async () => {
    await enqueue(samplePayload);
    await enqueue(samplePayload);

    const synced = await flush(async () => {});

    expect(synced).toBe(2);
    expect(await listPending()).toHaveLength(0);
  });

  it("leaves a failed item in the queue for retry rather than dropping it", async () => {
    await enqueue({ ...samplePayload, items: [{ product_id: 1, quantity: 1 }] });
    await enqueue({ ...samplePayload, items: [{ product_id: 2, quantity: 1 }] });

    const synced = await flush(async (payload: any) => {
      if (payload.items[0].product_id === 2) throw new Error("network error");
    });

    expect(synced).toBe(1);
    const remaining = await listPending();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].payload.items[0].product_id).toBe(2);
  });

  it("a subsequent successful flush clears an item that previously failed", async () => {
    await enqueue(samplePayload);

    // First attempt fails — item must remain queued (no silent data loss).
    let synced = await flush(async () => {
      throw new Error("server down");
    });
    expect(synced).toBe(0);
    expect(await listPending()).toHaveLength(1);

    // Retry succeeds — item is finally cleared.
    synced = await flush(async () => {});
    expect(synced).toBe(1);
    expect(await listPending()).toHaveLength(0);
  });

  it("preserves FIFO order when retrying after a partial failure", async () => {
    await enqueue({ ...samplePayload, items: [{ product_id: 1, quantity: 1 }] });
    await enqueue({ ...samplePayload, items: [{ product_id: 2, quantity: 1 }] });
    await enqueue({ ...samplePayload, items: [{ product_id: 3, quantity: 1 }] });

    // product 2 fails on the first pass
    await flush(async (payload: any) => {
      if (payload.items[0].product_id === 2) throw new Error("fail");
    });

    let remaining = await listPending();
    expect(remaining.map((p) => p.payload.items[0].product_id)).toEqual([2]);

    // Retry succeeds, queue empties, and no reordering ever happened for product 1/3.
    await flush(async () => {});
    remaining = await listPending();
    expect(remaining).toHaveLength(0);
  });
});
