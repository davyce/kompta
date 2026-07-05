import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("../services/api", () => ({
  api: {
    realtimeTicket: vi.fn().mockRejectedValue(new Error("no ws in tests")),
    notifications: vi.fn().mockResolvedValue([]),
  },
}));

import { useWebSocketNotifications } from "./useWebSocketNotifications";

// Remarque: cet environnement de test n'a pas de `localStorage` global fonctionnel
// (jsdom sans --localstorage-file) ; le hook tolère cette absence via son try/catch
// interne (`loadHistory`/`saveHistory`), donc l'état en mémoire reste la source
// de vérité vérifiée ici.
describe("useWebSocketNotifications", () => {
  it("markOneRead flips only the targeted record's unread flag", () => {
    const { result } = renderHook(() => useWebSocketNotifications(undefined));

    act(() => {
      result.current.push("Alerte 1", "detail 1", "warning", "/billing");
    });
    act(() => {
      result.current.push("Alerte 2", "detail 2", "info", "/inventory");
    });

    expect(result.current.history).toHaveLength(2);
    expect(result.current.history.every((n) => n.unread)).toBe(true);

    const targetId = result.current.history[0].id; // most recent = "Alerte 2"
    act(() => {
      result.current.markOneRead(targetId);
    });

    const target = result.current.history.find((n) => n.id === targetId);
    const other = result.current.history.find((n) => n.id !== targetId);
    expect(target?.unread).toBe(false);
    expect(other?.unread).toBe(true);
  });

  it("push stores the moduleId so clicks can navigate", () => {
    const { result } = renderHook(() => useWebSocketNotifications(undefined));
    act(() => {
      result.current.push("Facture en retard", "", "warning", "/billing?status=late");
    });
    expect(result.current.history[0].moduleId).toBe("/billing?status=late");
  });

  it("markAllRead clears unread flags for every record", () => {
    const { result } = renderHook(() => useWebSocketNotifications(undefined));
    act(() => {
      result.current.push("A");
      result.current.push("B");
    });
    act(() => {
      result.current.markAllRead();
    });
    expect(result.current.history.every((n) => !n.unread)).toBe(true);
  });
});
