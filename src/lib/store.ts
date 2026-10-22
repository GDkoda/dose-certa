import { useSyncExternalStore } from "react";

export type Role = "cuidador" | "operador" | "mestre";
export interface User { id: string; login: string; password: string; role: Role; question: string; answer: string; mustChange?: boolean }
export interface Patient { id: string; ownerId: string; name: string; age: number; notes: string }
export interface Med { id: string; patientId: string; ownerId: string; name: string; dose: string; times: string[]; stock: number; tolerance: number }
export type DoseStatus = "pendente" | "tomado" | "nao_tomado";
export interface Dose { id: string; medId: string; patientId: string; ownerId: string; scheduledAt: string; status: DoseStatus; snoozeUntil?: string; lastShown?: string; takenAt?: string; lateAlerted?: boolean }
export interface Alert { id: string; ownerId: string; text: string; at: string; read: boolean }
export interface Ticket { id: string; userId: string; subject: string; status: "aberto" | "respondido" | "fechado"; messages: { from: string; text: string; at: string }[] }
export interface State {
  users: User[]; patients: Patient[]; meds: Med[]; doses: Dose[]; alerts: Alert[]; tickets: Ticket[];
  texts: Record<string, string>; images: Record<string, string>; sessionId: string | null;
}

export const MAX_PATIENTS = 3;
export const RESET_PASSWORD = "123";
export const SNOOZE_MIN = 5;
const KEY = "dose-certa-v1";

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function initialState(): State {
  return {
    users: [{ id: "master", login: "Koda", password: "batata", role: "mestre", question: "Palavra mestra?", answer: "batata" }],
    patients: [], meds: [], doses: [], alerts: [], tickets: [], texts: {}, images: {}, sessionId: null,
  };
}

let state: State = initialState();
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try { const raw = localStorage.getItem(KEY); if (raw) state = { ...initialState(), ...JSON.parse(raw) }; } catch { /* ignore */ }
  window.addEventListener("storage", (e) => { if (e.key === KEY && e.newValue) { state = JSON.parse(e.newValue); listeners.forEach((l) => l()); } });
}

export function getState() { load(); return state; }
export function setState(fn: (s: State) => State) {
  load();
  state = fn(state);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota */ }
  listeners.forEach((l) => l());
}
const serverSnap = initialState();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const getServerSnapshot = () => serverSnap;
export function useStore<T>(sel: (s: State) => T): T {
  const snapshot = useSyncExternalStore(subscribe, getState, getServerSnapshot);
  return sel(snapshot);
}

// ---- Pure rules (tested) ----
export function canAddPatient(s: State, ownerId: string) {
  return s.patients.filter((p) => p.ownerId === ownerId).length < MAX_PATIENTS;
}
export function recoverPassword(s: State, login: string, answer: string): { ok: boolean; state: State } {
  const u = s.users.find((x) => x.login.toLowerCase() === login.trim().toLowerCase());
  if (!u || u.answer.trim().toLowerCase() !== answer.trim().toLowerCase()) return { ok: false, state: s };
  return { ok: true, state: { ...s, users: s.users.map((x) => (x.id === u.id ? { ...x, password: RESET_PASSWORD, mustChange: true } : x)) } };
}
export function attemptLogin(s: State, login: string, password: string): User | null {
  const u = s.users.find((x) => x.login.toLowerCase() === login.trim().toLowerCase() && x.password === password);
  if (!u) return null;
  return password === RESET_PASSWORD ? { ...u, mustChange: true } : u;
}
