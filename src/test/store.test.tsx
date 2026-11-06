import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { initialState, mergePatientPatch, setState, useStore } from "@/lib/store";

afterEach(() => { act(() => setState(() => initialState())); });

describe("Safe patient updates", () => {
  it("merges a card-theme change without replacing the current name or other fields", () => {
    const state = {
      ...initialState(),
      patients: [{
        id: "patient-1",
        ownerId: "caregiver-1",
        name: "Nome atualizado em outro dispositivo",
        age: 72,
        notes: "Observação mais recente",
        cpf: "12345678900",
      }],
    };

    const updated = mergePatientPatch(state, { id: "patient-1", cardTheme: "lavanda" });
    expect(updated.patients[0]).toMatchObject({
      id: "patient-1",
      name: "Nome atualizado em outro dispositivo",
      age: 72,
      notes: "Observação mais recente",
      cpf: "12345678900",
      cardTheme: "lavanda",
    });
  });

  it("updates a requested field without blanking fields absent from the patch", () => {
    const state = {
      ...initialState(),
      patients: [{
        id: "patient-1",
        ownerId: "caregiver-1",
        name: "Paciente",
        age: 40,
        notes: "Manter esta anotação",
      }],
    };

    const updated = mergePatientPatch(state, { id: "patient-1", age: 41 });
    expect(updated.patients[0]?.name).toBe("Paciente");
    expect(updated.patients[0]?.notes).toBe("Manter esta anotação");
    expect(updated.patients[0]?.age).toBe(41);
  });
});

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