import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TicketManagement } from "@/components/TicketManagement";
import { getState, initialState, replaceCloudState, type Ticket, type User } from "@/lib/store";

vi.mock("@/lib/cloud-store", () => ({ flushCloudWrites: vi.fn().mockResolvedValue(undefined) }));
const ticket: Ticket = { id: "support-1", userId: "caregiver", subject: "Dúvida", status: "aberto", messages: [{ from: "Ana", text: "Mensagem original", at: "2026-10-25T01:47:00Z" }] };
const master: User = { id: "master", login: "Koda", role: "mestre", password: "", question: "", answer: "" };
afterEach(() => { cleanup(); act(() => replaceCloudState(initialState())); });

describe("Master support ticket management", () => {
  it("allows Master to edit another account's ticket without changing ownership or authorship", async () => {
    replaceCloudState({ ...initialState(), tickets: [ticket] });
    render(<TicketManagement ticket={ticket} me={master} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar chamado" }));
    fireEvent.change(screen.getByLabelText("Assunto"), { target: { value: "Assunto corrigido" } });
    fireEvent.change(screen.getByLabelText("Situação"), { target: { value: "fechado" } });
    fireEvent.change(screen.getByLabelText("Mensagem 1 · Ana"), { target: { value: "Mensagem corrigida" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(getState().tickets[0]).toEqual({ ...ticket, subject: "Assunto corrigido", status: "fechado", messages: [{ ...ticket.messages[0], text: "Mensagem corrigida" }] }));
  });
  it("deletes another account's ticket only after Master confirms, and cancel preserves it", async () => {
    replaceCloudState({ ...initialState(), tickets: [ticket] });
    render(<TicketManagement ticket={ticket} me={master} />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir chamado" }));
    expect(getState().tickets).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(getState().tickets).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Excluir chamado" }));
    fireEvent.click(screen.getByRole("button", { name: "Excluir definitivamente" }));
    await waitFor(() => expect(getState().tickets).toHaveLength(0));
  });
  it.each(["operador", "cuidador"] as const)("does not expose Master edit/delete actions to %s", (role) => {
    render(<TicketManagement ticket={ticket} me={{ ...master, role }} />);
    expect(screen.queryByRole("button", { name: "Editar chamado" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Excluir chamado" })).toBeNull();
  });
});