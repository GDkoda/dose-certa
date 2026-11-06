import { describe, expect, it } from "vitest";
import { initialState, type State } from "@/lib/store";
import { reconcilePendingChanges, type OfflineChange } from "@/lib/offline-cache";

describe("offline confirmation reconciliation", () => {
  const pendingChange: OfflineChange = {
    key: "doses:dose-1",
    id: "dose-1",
    kind: "doses",
    ownerId: "caregiver-1",
    payload: {
      id: "dose-1",
      ownerId: "caregiver-1",
      medId: "med-1",
      patientId: "patient-1",
      scheduledAt: "2026-11-04T08:00:00.000Z",
      status: "pendente",
    },
    changedAt: 100,
  };

  it.each(["tomado", "nao_tomado"] as const)("drops a stale offline copy when the server says %s", (status) => {
    const remote: State = {
      ...initialState(),
      doses: [{
        id: "dose-1",
        ownerId: "caregiver-1",
        medId: "med-1",
        patientId: "patient-1",
        scheduledAt: "2026-11-04T08:00:00.000Z",
        status,
      }],
    };
    expect(reconcilePendingChanges(remote, [pendingChange])).toEqual([]);
  });

  it("keeps a local change while the server dose is still pending", () => {
    const remote: State = {
      ...initialState(),
      doses: [{
        id: "dose-1",
        ownerId: "caregiver-1",
        medId: "med-1",
        patientId: "patient-1",
        scheduledAt: "2026-11-04T08:00:00.000Z",
        status: "pendente",
      }],
    };
    expect(reconcilePendingChanges(remote, [pendingChange])).toEqual([pendingChange]);
  });

  it("prevents a legacy whole-patient update from restoring a stale name", () => {
    const remote: State = {
      ...initialState(),
      patients: [{
        id: "patient-1",
        ownerId: "caregiver-1",
        name: "Nome atual na nuvem",
        age: 70,
        notes: "Informação atual",
      }],
    };
    const legacyChange: OfflineChange = {
      key: "patients:patient-1",
      id: "patient-1",
      kind: "patients",
      ownerId: "caregiver-1",
      payload: {
        id: "patient-1",
        ownerId: "caregiver-1",
        name: "Nome antigo",
        age: 70,
        notes: "Informação antiga",
        cardTheme: "lavanda",
      },
      changedAt: 200,
    };

    const [rebased] = reconcilePendingChanges(remote, [legacyChange]);
    expect(rebased?.payload).toMatchObject({
      name: "Nome atual na nuvem",
      notes: "Informação atual",
    });
    expect(rebased?.payload).not.toHaveProperty("cardTheme");
  });

  it("rebases only the fields intentionally changed by a newer patient update", () => {
    const remote: State = {
      ...initialState(),
      patients: [{
        id: "patient-1",
        ownerId: "caregiver-1",
        name: "Nome atual na nuvem",
        age: 70,
        notes: "Informação atual",
      }],
    };
    const change: OfflineChange = {
      key: "patients:patient-1",
      id: "patient-1",
      kind: "patients",
      ownerId: "caregiver-1",
      payload: {
        id: "patient-1",
        ownerId: "caregiver-1",
        name: "Nome antigo",
        age: 70,
        notes: "Informação antiga",
        cardTheme: "lavanda",
      },
      changedAt: 201,
      changedFields: ["cardTheme"],
    };

    const [rebased] = reconcilePendingChanges(remote, [change]);
    expect(rebased?.payload).toMatchObject({
      name: "Nome atual na nuvem",
      notes: "Informação atual",
      cardTheme: "lavanda",
    });
  });

  it("allows an intentional name edit to win when name is explicitly marked as changed", () => {
    const remote: State = {
      ...initialState(),
      patients: [{
        id: "patient-1",
        ownerId: "caregiver-1",
        name: "Nome anterior",
        age: 70,
        notes: "",
      }],
    };
    const change: OfflineChange = {
      key: "patients:patient-1",
      id: "patient-1",
      kind: "patients",
      ownerId: "caregiver-1",
      payload: { id: "patient-1", ownerId: "caregiver-1", name: "Nome escolhido" },
      changedAt: 202,
      changedFields: ["name"],
    };

    const [rebased] = reconcilePendingChanges(remote, [change]);
    expect(rebased?.payload).toMatchObject({ name: "Nome escolhido" });
  });
});
