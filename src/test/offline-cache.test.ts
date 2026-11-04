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
});
