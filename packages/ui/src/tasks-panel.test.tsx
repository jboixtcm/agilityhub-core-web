import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  AttachmentPicker,
  attachmentRejection,
  FollowupEditor,
  type FollowupEditorLabels,
  type TaskPanelItem,
  TasksPanel,
  type TasksPanelLabels,
} from "./index";

interface Task extends TaskPanelItem {
  author: string;
  date: string;
  doneBy?: string;
}

const labels: TasksPanelLabels = {
  add: "Afegir",
  attach: "Adjunta un fitxer",
  cancel: "Cancel·la",
  close: "Tanca",
  complete: "Marca-la com a feta",
  create: "Afegeix",
  doneLine: (task) => {
    const item = task as Task;
    return item.doneBy === undefined ? undefined : `feta per ${item.doneBy} el 02-08`;
  },
  edit: "Edita la tasca",
  editField: "Text de la tasca",
  empty: "Encara no hi ha cap tasca",
  loading: "Carregant",
  meta: (task) => `${(task as Task).date} · ${(task as Task).author}`,
  newTask: "Nova tasca",
  newTaskField: "Text de la tasca nova",
  rejection: (reason, file) => `${reason} ${file.name}`,
  remove: "Elimina la tasca",
  removeConfirm: "Elimina",
  removeFile: (name) => `Treu ${name}`,
  removeTitle: "Vols eliminar aquesta tasca?",
  reopen: "Torna-la a pendent",
  save: "Desa",
  state: (state) => (state === "DONE" ? "feta" : "pendent"),
  title: "Tasques",
};

const tasks: Task[] = [
  {
    attachments: [{ id: "a2", name: "vídeo_balancí.mp4" }],
    author: "Estel",
    date: "31-07",
    id: "t1",
    state: "PENDING",
    text: "Aquesta setmana practiqueu el balancí amb calma",
  },
  {
    attachments: [],
    author: "Estel",
    date: "28-07",
    doneBy: "la Laura",
    id: "t3",
    state: "DONE",
    text: "Treballar l'«espera» a la línia de sortida",
  },
];

function file(name: string, type: string, size = 10): File {
  const created = new File(["x"], name, { type });
  Object.defineProperty(created, "size", { value: size });
  return created;
}

function panel(overrides: Partial<Parameters<typeof TasksPanel<Task>>[0]> = {}) {
  const handlers = {
    onComplete: vi.fn(() => Promise.resolve(true)),
    onCreate: vi.fn(() => Promise.resolve(true)),
    onDelete: vi.fn(() => Promise.resolve(true)),
    onOpenAttachment: vi.fn(),
    onPatch: vi.fn(() => Promise.resolve(true)),
    onReject: vi.fn(),
    onReopen: vi.fn(() => Promise.resolve(true)),
  };
  const view = render(
    <TasksPanel
      canEdit
      labels={labels}
      limits={{ allowedTypes: ["image/*", "video/mp4"], maxPerEntity: 2, maxSizeMb: 25 }}
      tasks={tasks}
      {...handlers}
      {...overrides}
    />,
  );
  return { ...handlers, view };
}

describe("E6-W02 step 2 · attachmentRejection with the api's numbers (R-10-11)", () => {
  it("refuses a file over files.maxSizeMb (MiB), a type outside files.allowedTypes and one past files.maxAttachmentsPerEntity", () => {
    const limits = { allowedTypes: ["image/*", "video/mp4"], maxPerEntity: 10, maxSizeMb: 25 };
    expect(attachmentRejection(file("a.jpg", "image/jpeg", 25 * 1024 * 1024), limits, 0)).toBe(
      undefined,
    );
    expect(attachmentRejection(file("b.mp4", "video/mp4", 25 * 1024 * 1024 + 1), limits, 0)).toBe(
      "FILE_TOO_LARGE",
    );
    expect(attachmentRejection(file("c.exe", "application/x-msdownload"), limits, 0)).toBe(
      "FILE_TYPE_NOT_ALLOWED",
    );
    expect(attachmentRejection(file("d.png", "image/png"), limits, 10)).toBe(
      "ATTACHMENT_LIMIT_REACHED",
    );
    // A limit the session could not read is left to the api.
    expect(attachmentRejection(file("e.exe", "application/x-msdownload", 1e9), {}, 99)).toBe(
      undefined,
    );
  });

  it("the picker passes the accepted files and reports each refused one with its reason", () => {
    const onPick = vi.fn();
    const onReject = vi.fn();
    render(
      <AttachmentPicker
        allowedTypes={["image/*"]}
        current={0}
        label="Adjunta un fitxer"
        maxPerEntity={2}
        maxSizeMb={1}
        onPick={onPick}
        onReject={onReject}
      />,
    );
    const input = screen.getByLabelText("Adjunta un fitxer", { selector: "input" });
    const big = file("gran.jpg", "image/jpeg", 2 * 1024 * 1024);
    const exe = file("prog.exe", "application/x-msdownload");
    const ok = file("foto.jpg", "image/jpeg");
    const third = file("tercera.jpg", "image/jpeg");
    const fourth = file("quarta.jpg", "image/jpeg");
    fireEvent.change(input, { target: { files: [big, exe, ok, third, fourth] } });
    expect(onPick).toHaveBeenCalledWith([ok, third]);
    expect(
      onReject.mock.calls.map(([reason, item]) => `${String(reason)} ${(item as File).name}`),
    ).toEqual([
      "FILE_TOO_LARGE gran.jpg",
      "FILE_TYPE_NOT_ALLOWED prog.exe",
      "ATTACHMENT_LIMIT_REACHED quarta.jpg",
    ]);
  });
});

describe("E6-W02 step 2 · TasksPanel (R-10-10, mockup 26)", () => {
  it("paints each task with its state chip, text, «{dd-mm} · {autor}», the clip chip and, done, struck through with «feta per …»", () => {
    const { onOpenAttachment } = panel();
    const [pending, done] = screen.getAllByRole("listitem");
    if (pending === undefined || done === undefined) throw new TypeError("Two cards expected");
    expect(within(pending).getByText("pendent")).toHaveClass("ah-tone--warning");
    expect(pending).toHaveTextContent("31-07 · Estel · vídeo_balancí.mp4");
    expect(within(done).getByText("feta")).toHaveClass("ah-tone--success");
    expect(done).toHaveClass("ah-task--done");
    expect(done).toHaveTextContent("28-07 · Estel · feta per la Laura el 02-08");
    fireEvent.click(screen.getByRole("button", { name: "vídeo_balancí.mp4" }));
    expect(onOpenAttachment).toHaveBeenCalledWith(tasks[0], {
      id: "a2",
      name: "vídeo_balancí.mp4",
    });
  });

  it("«＋ Afegir» opens the inline form beside the title; it creates with the text and the picked files, and closes only when the write succeeded", async () => {
    const onCreate = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    panel({ onCreate });
    fireEvent.click(screen.getByRole("button", { name: "Afegir" }));
    const form = screen.getByRole("form", { name: "Nova tasca" });
    expect(within(form).getByRole("button", { name: "Afegeix" })).toBeDisabled();
    fireEvent.change(within(form).getByLabelText("Text de la tasca nova"), {
      target: { value: "Salts amb calma" },
    });
    const video = file("salt.mp4", "video/mp4");
    fireEvent.change(within(form).getByLabelText("Adjunta un fitxer", { selector: "input" }), {
      target: { files: [video] },
    });
    expect(within(form).getByRole("button", { name: "salt.mp4" })).toBeVisible();
    await act(async () => {
      fireEvent.click(within(form).getByRole("button", { name: "Afegeix" }));
      await Promise.resolve();
    });
    // A refused write keeps the form and what was typed.
    expect(onCreate).toHaveBeenLastCalledWith("Salts amb calma", [video]);
    expect(within(form).getByLabelText("Text de la tasca nova")).toHaveValue("Salts amb calma");
    await act(async () => {
      fireEvent.click(within(form).getByRole("button", { name: "Afegeix" }));
      await Promise.resolve();
    });
    expect(screen.queryByRole("form", { name: "Nova tasca" })).toBeNull();
  });

  it("the pencil edits the text in place; the ✕ asks «Vols eliminar aquesta tasca?» before deleting; ✓ completes and ↺ reopens", async () => {
    const { onComplete, onDelete, onPatch, onReopen } = panel();
    fireEvent.click(screen.getByRole("button", { name: "Edita la tasca" }));
    const field = screen.getByLabelText("Text de la tasca");
    expect(field).toHaveFocus();
    fireEvent.change(field, { target: { value: "Balancí amb calma" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Desa" }));
      await Promise.resolve();
    });
    expect(onPatch).toHaveBeenCalledWith(tasks[0], "Balancí amb calma", undefined);
    const [remove] = screen.getAllByRole("button", { name: "Elimina la tasca" });
    if (remove === undefined) throw new TypeError("A ✕ expected");
    fireEvent.click(remove);
    const dialog = screen.getByRole("dialog", { name: "Vols eliminar aquesta tasca?" });
    expect(onDelete).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));
      await Promise.resolve();
    });
    expect(onDelete).toHaveBeenCalledWith(tasks[0]);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Marca-la com a feta" }));
    expect(onComplete).toHaveBeenCalledWith(tasks[0]);
    fireEvent.click(screen.getByRole("button", { name: "Torna-la a pendent" }));
    expect(onReopen).toHaveBeenCalledWith(tasks[1]);
  });

  it("an edit is sent with the version it was opened at, even after a read brings a newer one (optimistic lock)", async () => {
    const onPatch = vi.fn(() => Promise.resolve(true));
    const versioned = tasks.map((task) => ({ ...task, version: 1 }));
    const { view } = panel({ onPatch, tasks: versioned });
    fireEvent.click(screen.getByRole("button", { name: "Edita la tasca" }));
    fireEvent.change(screen.getByLabelText("Text de la tasca"), {
      target: { value: "Balancí amb calma" },
    });
    // Another instructor's change arrives with a read while the edit is open.
    const newer = versioned.map((task) => ({ ...task, version: 2 }));
    view.rerender(
      <TasksPanel
        canEdit
        labels={labels}
        limits={{}}
        onOpenAttachment={vi.fn()}
        onPatch={onPatch}
        tasks={newer}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Desa" }));
      await Promise.resolve();
    });
    expect(onPatch).toHaveBeenCalledWith(newer[0], "Balancí amb calma", 1);
  });

  it("while a write runs every action waits (pending state), and a read-only list has no «＋ Afegir», pencil, ✕ nor reopening", () => {
    const { view } = panel({ busy: "complete:t1" });
    expect(screen.getByRole("button", { name: "Afegir" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edita la tasca" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Marca-la com a feta" })).toBeDisabled();
    expect(screen.getAllByRole("listitem")[0]).toHaveAttribute("aria-busy", "true");
    view.unmount();
    panel({ canEdit: false, onCreate: undefined, onComplete: undefined });
    expect(screen.queryByRole("button", { name: "Afegir" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edita la tasca" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Elimina la tasca" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Torna-la a pendent" })).toBeNull();
  });

  it("a refused file reaches the caller as a message; the error is shown inside the panel", () => {
    const onReject = vi.fn();
    panel({ error: "Aquesta tasca ja està completada.", onReject });
    expect(screen.getByRole("alert")).toHaveTextContent("Aquesta tasca ja està completada.");
    fireEvent.click(screen.getByRole("button", { name: "Afegir" }));
    fireEvent.change(screen.getByLabelText("Adjunta un fitxer", { selector: "input" }), {
      target: { files: [file("prog.exe", "application/x-msdownload")] },
    });
    expect(onReject).toHaveBeenCalledWith("FILE_TYPE_NOT_ALLOWED prog.exe");
  });

  it("round 2 #2: «Mostra'n més» below the list reads the next page, waits while it reads and says why a page failed", () => {
    const onMore = vi.fn();
    const { view } = panel({ more: { label: "Mostra'n més", loading: false, onMore } });
    fireEvent.click(screen.getByRole("button", { name: "Mostra'n més" }));
    expect(onMore).toHaveBeenCalledTimes(1);
    view.rerender(
      <TasksPanel
        canEdit
        labels={labels}
        limits={{}}
        more={{ label: "Mostra'n més", loading: true, onMore }}
        onOpenAttachment={vi.fn()}
        tasks={tasks}
      />,
    );
    expect(screen.getByRole("button", { name: /Mostra'n més|Carregant/u })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    view.rerender(
      <TasksPanel
        canEdit
        labels={labels}
        limits={{}}
        more={{ error: "No s'han pogut carregar les tasques.", label: "Mostra'n més", onMore }}
        onOpenAttachment={vi.fn()}
        tasks={tasks}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("No s'han pogut carregar les tasques.");
    expect(screen.getByRole("button", { name: "Mostra'n més" })).toBeEnabled();
  });

  it("round 2 #4: a clip whose opening fails says why next to it; a later click clears it, and a late failure of an earlier click is dropped", async () => {
    let fail: (message: string | undefined) => void = () => undefined;
    const onOpenAttachment = vi.fn(
      () =>
        new Promise<string | undefined>((resolve) => {
          fail = resolve;
        }),
    );
    panel({ onOpenAttachment });
    const clip = screen.getByRole("button", { name: "vídeo_balancí.mp4" });
    fireEvent.click(clip);
    await act(async () => {
      fail("No s'ha pogut obrir el fitxer.");
      await Promise.resolve();
    });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("No s'ha pogut obrir el fitxer.");
    expect(clip.closest(".ah-attachment-chip")?.nextElementSibling).toBe(alert);
    fireEvent.click(clip);
    expect(screen.queryByRole("alert")).toBeNull();
    const first = fail;
    fireEvent.click(clip);
    await act(async () => {
      first("Una resposta tardana");
      fail(undefined);
      await Promise.resolve();
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("E6-W02 step 3 · FollowupEditor (the body of 26 and D13's drawer)", () => {
  const editorLabels: FollowupEditorLabels = {
    attach: "Adjunta un fitxer",
    historyLink: "Veure l'historial complet ›",
    memberNotesHint: "· de l'alumne · només lectura",
    memberNotesTitle: "Notes als instructors",
    noValue: "—",
    observationsField: "Observacions privades",
    observationsHint: "· privades · camp únic",
    observationsTitle: "Observacions",
    recover: "Recupera el meu text",
    removeFile: (name) => `Treu ${name}`,
    save: "Desa",
    saving: "Desant",
    staleNotice: "Algú ha desat les observacions fa un moment: revisa-les.",
  };

  function editor(
    observations: Partial<Parameters<typeof FollowupEditor<Task>>[0]["observations"]> = {},
  ) {
    const actions = {
      onAttach: vi.fn(),
      onChange: vi.fn(),
      onDetach: vi.fn(),
      onOpen: vi.fn(),
      onRecover: vi.fn(),
      onSave: vi.fn(),
    };
    render(
      <FollowupEditor<Task>
        labels={editorLabels}
        limits={{}}
        memberNote={{
          attachments: [{ id: "a1", name: "foto_balancí.jpg" }],
          onOpen: vi.fn(),
          text: "El gos s'atura",
        }}
        observations={{
          attachments: [],
          dirty: false,
          recoverable: undefined,
          saving: false,
          stale: false,
          text: "Va molt bé",
          ...actions,
          ...observations,
        }}
        onHistory={vi.fn()}
        onReject={vi.fn()}
        rejection={labels.rejection}
        tasks={{ canEdit: true, labels, limits: {}, onOpenAttachment: vi.fn(), tasks }}
      />,
    );
    return actions;
  }

  it("lays out the observations field, the tasks, the history link, the member's note read-only and [DESA], disabled until the text changes", () => {
    const actions = editor();
    expect(
      screen.getByRole("heading", { name: "Observacions · privades · camp únic" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Observacions privades")).toHaveValue("Va molt bé");
    expect(
      screen.getByRole("heading", { name: "Notes als instructors · de l'alumne · només lectura" }),
    ).toBeVisible();
    expect(screen.getByText("El gos s'atura")).toBeVisible();
    expect(screen.queryByRole("textbox", { name: /Notes/u })).toBeNull();
    expect(screen.getByRole("button", { name: "Desa" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Observacions privades"), {
      target: { value: "Molt bé" },
    });
    expect(actions.onChange).toHaveBeenCalledWith("Molt bé");
  });

  it("a stale save shows the notice and the typed text to recover; saving keeps the field read-only", () => {
    const actions = editor({ dirty: true, recoverable: "El meu text", saving: true, stale: true });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Algú ha desat les observacions fa un moment: revisa-les.",
    );
    expect(screen.getByText("El meu text")).toBeVisible();
    expect(screen.getByLabelText("Observacions privades")).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: /Desa/u })).toHaveAttribute("aria-busy", "true");
    fireEvent.click(screen.getByRole("button", { name: "Recupera el meu text" }));
    expect(actions.onRecover).toHaveBeenCalled();
  });
});
