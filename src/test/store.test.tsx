import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { initialState, setState, useStore } from "@/lib/store";

afterEach(() => { act(() => setState(() => initialState())); });

describe("Store subscriptions after account creation", () => {
  it("supports filtered lists and receives newly created caregiver data without a render loop", () => {
    const { result } = renderHook(() => useStore((s) => s.users.filter((u) => u.role === "cuidador")));
    expect(result.current).toEqual([]);
    act(() => setState((s) => ({
      ...s,
      users: [...s.users, { id: "caregiver", login: "teste", password: "test5678", role: "cuidador", question: "Animal?", answer: "gato" }],
      sessionId: "caregiver",
    })));
    expect(result.current.map((u) => u.id)).toEqual(["caregiver"]);
  });
});