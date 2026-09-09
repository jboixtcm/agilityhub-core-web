import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  AppBar,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  DataTable,
  Drawer,
  EmptyState,
  FormField,
  IconButton,
  Input,
  LevelDot,
  Modal,
  RadioGroup,
  Select,
  Sidebar,
  Skeleton,
  Switch,
  TabBar,
  Tabs,
  Textarea,
  Toast,
  ToastProvider,
  useToast,
} from "./components";

describe("base components", () => {
  it("Button exposes a disabled loading state", () => {
    render(
      <Button loading loadingLabel="Desant">
        Desa
      </Button>,
    );

    expect(screen.getByRole("button", { name: /Desant/ })).toBeDisabled();
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
  });

  it("IconButton requires an accessible label", () => {
    render(<IconButton icon="edit" label="Edita" />);
    expect(screen.getByRole("button", { name: "Edita" })).toBeInTheDocument();
  });

  it("Chip renders its semantic tone", () => {
    render(<Chip tone="success">Activa</Chip>);
    expect(screen.getByText("Activa")).toHaveClass("ah-tone--success");
  });

  it("Badge renders a counter", () => {
    render(<Badge>4</Badge>);
    expect(screen.getByText("4")).toHaveClass("ah-badge");
  });

  it("Card contains grouped content", () => {
    render(<Card>Contingut</Card>);
    expect(screen.getByText("Contingut")).toHaveClass("ah-card");
  });

  it("Input forwards native accessible attributes", () => {
    render(<Input aria-label="Nom" />);
    expect(screen.getByRole("textbox", { name: "Nom" })).toHaveClass("ah-input");
  });

  it("Textarea forwards native accessible attributes", () => {
    render(<Textarea aria-label="Observacions" />);
    expect(screen.getByRole("textbox", { name: "Observacions" }).tagName).toBe("TEXTAREA");
  });

  it("Select renders native options", () => {
    render(
      <Select aria-label="Nivell">
        <option>Nivell C</option>
      </Select>,
    );
    expect(screen.getByRole("combobox", { name: "Nivell" })).toHaveValue("Nivell C");
  });

  it("Checkbox preserves its checked state", () => {
    render(<Checkbox aria-label="Selecciona" defaultChecked />);
    expect(screen.getByRole("checkbox", { name: "Selecciona" })).toBeChecked();
  });

  it("Switch announces and changes its state", () => {
    const onCheckedChange = vi.fn();
    render(<Switch checked={false} label="Notificacions" onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByRole("switch", { name: "Notificacions" }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("RadioGroup changes the selected option", () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup
        label="Modalitat"
        onValueChange={onValueChange}
        options={[
          { label: "Agility", value: "agility" },
          { label: "Iniciació", value: "intro" },
        ]}
        value="agility"
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Iniciació" }));
    expect(onValueChange).toHaveBeenCalledWith("intro");
  });

  it("FormField associates its label and reports errors", () => {
    render(
      <FormField error="Camp obligatori" id="name" label="Nom">
        <Input id="name" />
      </FormField>,
    );
    expect(screen.getByRole("textbox", { name: "Nom" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Camp obligatori");
  });

  it("Modal closes with Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal closeLabel="Tanca" onClose={onClose} open title="Confirmació">
        Segur?
      </Modal>,
    );
    expect(screen.getByRole("dialog", { name: "Confirmació" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Modal can require an explicit in-dialog action", () => {
    const onClose = vi.fn();
    render(
      <Modal closeLabel="Tanca" dismissible={false} onClose={onClose} open title="Consentiment">
        <button>Accepta</button>
      </Modal>,
    );
    expect(screen.queryByRole("button", { name: "Tanca" })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Modal can require an explicit action", () => {
    const onClose = vi.fn();
    render(
      <Modal closeLabel="Tanca" dismissible={false} onClose={onClose} open title="Confirmació">
        Segur?
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Tanca" })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Drawer renders a desktop side panel", () => {
    const onClose = vi.fn();
    render(
      <Drawer closeLabel="Tanca" onClose={onClose} open title="Detall">
        Fitxa
      </Drawer>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Tanca" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Toast exposes status and dismissal", () => {
    const onDismiss = vi.fn();
    render(
      <Toast dismissLabel="Tanca" onDismiss={onDismiss} tone="success">
        Fet
      </Toast>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Fet");
    fireEvent.click(screen.getByRole("button", { name: "Tanca" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("Toast queue is available through useToast", () => {
    function Harness() {
      const toast = useToast();
      return <button onClick={() => toast.push("Actualitzat")}>Mostra</button>;
    }
    render(
      <ToastProvider dismissLabel="Tanca">
        <Harness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mostra" }));
    expect(screen.getByRole("status")).toHaveTextContent("Actualitzat");
  });

  it("Tabs switches the active panel", () => {
    render(
      <Tabs
        items={[
          { content: "Perfil", label: "Perfil", value: "profile" },
          { content: "Gossos", label: "Gossos", value: "dogs" },
        ]}
        label="Fitxa"
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Gossos" }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Gossos");
  });

  it("AppBar renders mobile start and end actions", () => {
    render(<AppBar end={<button>Acció</button>} start={<span>Marca</span>} title="Inici" />);
    expect(screen.getByRole("banner")).toHaveTextContent("MarcaIniciAcció");
  });

  it("TabBar renders six mobile destinations", () => {
    render(
      <TabBar
        items={[
          { active: true, href: "#home", icon: "home", label: "Inici" },
          { href: "#book", icon: "cal", label: "Reservar" },
          { href: "#training", icon: "cone", label: "Entrenaments" },
          { href: "#today", icon: "day", label: "Avui" },
          { href: "#profile", icon: "user", label: "Perfil" },
          { href: "#info", icon: "info", label: "Info" },
        ]}
        label="Principal"
      />,
    );
    expect(screen.getByRole("navigation", { name: "Principal" })).toHaveTextContent("Info");
    expect(screen.getAllByRole("link")).toHaveLength(6);
  });

  it("Sidebar renders grouped entries and counters", () => {
    render(
      <Sidebar
        groups={[
          {
            entries: [{ count: 3, href: "#members", icon: "user", label: "Abonats" }],
            label: "Club",
          },
        ]}
        label="Administració"
      />,
    );
    expect(screen.getByRole("navigation", { name: "Administració" })).toHaveTextContent("Abonats3");
  });

  it("EmptyState offers a recovery action", () => {
    render(
      <EmptyState
        action={<Button>Afegeix</Button>}
        description="Encara no hi ha dades"
        title="Sense dades"
      />,
    );
    expect(screen.getByRole("heading", { name: "Sense dades" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Afegeix" })).toBeInTheDocument();
  });

  it("Skeleton announces loading without motion-dependent content", () => {
    render(<Skeleton label="Carregant" />);
    expect(screen.getByRole("status", { name: "Carregant" })).toHaveClass("ah-skeleton");
  });

  it("Avatar derives person initials", () => {
    render(<Avatar name="Laia Pons" />);
    expect(screen.getByRole("img", { name: "Laia Pons" })).toHaveTextContent("LP");
  });

  it("LevelDot exposes its level label", () => {
    render(<LevelDot label="Nivell C" level="c" />);
    expect(screen.getByRole("img", { name: "Nivell C" })).toHaveClass("ah-level-dot--c");
  });

  it("DataTable renders headers and rows", () => {
    render(
      <DataTable
        caption="Abonats"
        columns={[{ header: "Nom", key: "name", render: (row: { name: string }) => row.name }]}
        empty="Sense resultats"
        loadingLabel="Carregant"
        rowKey={(row) => row.name}
        rows={[{ name: "Laia Pons" }]}
      />,
    );
    expect(screen.getByRole("table", { name: "Abonats" })).toHaveTextContent("NomLaia Pons");
  });
});
