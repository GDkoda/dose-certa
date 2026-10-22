import { describe, expect, it } from "vitest";
import { attemptLogin, canAddPatient, initialState, recoverPassword } from "@/lib/store";

describe("Dose Certa rules", () => {
  it("caregiver can have at most 3 patients", () => {
    const s = initialState();
    s.patients = [1, 2, 3].map((i) => ({ id: `p${i}`, ownerId: "u", name: "x", age: 1, notes: "" }));
    expect(canAddPatient(s, "u")).toBe(false);
    s.patients.pop();
    expect(canAddPatient(s, "u")).toBe(true);
  });
  it("correct security answer resets password to 123 and forces change", () => {
    const s = initialState();
    s.users.push({ id: "u", login: "ana", password: "abcd", role: "cuidador", question: "pet?", answer: "Rex" });
    const r = recoverPassword(s, "ana", "rex");
    expect(r.ok).toBe(true);
    expect(attemptLogin(r.state, "ana", "123")?.mustChange).toBe(true);
    expect(recoverPassword(s, "ana", "wrong").ok).toBe(false);
  });
  it("master account Koda/batata exists", () => {
    expect(attemptLogin(initialState(), "Koda", "batata")?.role).toBe("mestre");
  });
});
