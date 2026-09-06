import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { t } from "@agilityhub/i18n";
import {
  AppBar,
  Avatar,
  Badge,
  type Branding,
  BrandingProvider,
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
} from "@agilityhub/ui";
import { type ReactNode, useState } from "react";

import "./gallery.css";

const canicBranding: Branding = {
  ...brandingCanicFixture,
  theme: {
    ...brandingCanicFixture.theme,
    mode: "dark",
  },
};

function GallerySection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="gallery-section">
      <h2>{title}</h2>
      <div className="gallery-section__content">{children}</div>
    </section>
  );
}

function GalleryToastButton() {
  const toast = useToast();
  return (
    <Button
      onClick={() => {
        toast.push(t("gallery.updated"), "success");
      }}
    >
      {t("gallery.toast")}
    </Button>
  );
}

interface GalleryMember {
  level: "c" | "d";
  name: string;
  status: "active" | "risk";
}

function GalleryContent({ canic, onThemeChange }: { canic: boolean; onThemeChange: () => void }) {
  const [checked, setChecked] = useState(true);
  const [modality, setModality] = useState("agility");
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const members: GalleryMember[] = [
    { level: "c", name: t("gallery.person"), status: "active" },
    { level: "d", name: t("gallery.dog"), status: "risk" },
  ];

  return (
    <ToastProvider dismissLabel={t("gallery.close")}>
      <main className="gallery-page">
        <header className="gallery-header">
          <div>
            <span className="gallery-header__eyebrow">{t("shell.clubsAdmin")}</span>
            <h1>{t("gallery.title")}</h1>
          </div>
          <Button onClick={onThemeChange} variant="secondary">
            {canic ? t("gallery.theme.agilityhub") : t("gallery.theme.canic")}
          </Button>
        </header>

        <GallerySection title={t("gallery.states")}>
          <div className="gallery-row">
            <Button>{t("gallery.save")}</Button>
            <Button variant="secondary">{t("gallery.cancel")}</Button>
            <Button variant="ghost">{t("gallery.edit")}</Button>
            <Button variant="danger">{t("gallery.delete")}</Button>
            <Button loading loadingLabel={t("gallery.saving")}>
              {t("gallery.save")}
            </Button>
            <IconButton icon="edit" label={t("gallery.edit")} />
          </div>
          <Card>
            <div className="gallery-row">
              <Chip tone="success">{t("gallery.active")}</Chip>
              <Chip tone="warning">{t("gallery.risk")}</Chip>
              <Chip tone="danger">{t("gallery.cancelled")}</Chip>
              <Chip tone="info">{t("gallery.noShow")}</Chip>
              <Chip>{t("gallery.levelC")}</Chip>
              <Badge tone="danger">4</Badge>
            </div>
          </Card>
        </GallerySection>

        <GallerySection title={t("gallery.forms")}>
          <div className="gallery-form-grid">
            <FormField help={t("gallery.help")} id="gallery-name" label={t("gallery.name")}>
              <Input id="gallery-name" placeholder={t("gallery.person")} />
            </FormField>
            <FormField id="gallery-notes" label={t("gallery.notes")}>
              <Textarea id="gallery-notes" />
            </FormField>
            <FormField id="gallery-level" label={t("gallery.level")}>
              <Select defaultValue="c" id="gallery-level">
                <option value="c">{t("gallery.levelC")}</option>
              </Select>
            </FormField>
            <FormField
              error={t("gallery.required")}
              id="gallery-required"
              label={t("gallery.name")}
            >
              <Input id="gallery-required" />
            </FormField>
          </div>
          <div className="gallery-row">
            <label className="gallery-check">
              <Checkbox
                checked={checked}
                onChange={(event) => {
                  setChecked(event.currentTarget.checked);
                }}
              />
              {t("gallery.select")}
            </label>
            <Switch
              checked={checked}
              label={t("gallery.notifications")}
              onCheckedChange={setChecked}
            />
            <RadioGroup
              label={t("gallery.modality")}
              onValueChange={setModality}
              options={[
                { label: t("gallery.agility"), value: "agility" },
                { label: t("gallery.initiation"), value: "initiation" },
              ]}
              value={modality}
            />
          </div>
        </GallerySection>

        <GallerySection title={t("gallery.navigation")}>
          <div className="gallery-mobile-preview">
            <AppBar
              end={<IconButton icon="bell" label={t("gallery.notifications")} />}
              start={<Avatar name={t("gallery.dog")} kind="dog" />}
              title={t("gallery.home")}
            />
            <Tabs
              items={[
                { content: t("gallery.person"), label: t("gallery.profile"), value: "profile" },
                { content: t("gallery.dog"), label: t("gallery.dogs"), value: "dogs" },
              ]}
              label={t("gallery.drawerTitle")}
            />
            <TabBar
              items={[
                { active: true, href: "#home", icon: "home", label: t("gallery.home") },
                { href: "#book", icon: "cal", label: t("gallery.reserve") },
                { href: "#training", icon: "cone", label: t("gallery.training") },
                { href: "#today", icon: "day", label: t("gallery.today") },
                { href: "#profile", icon: "user", label: t("gallery.profile") },
                { href: "#info", icon: "info", label: t("gallery.info") },
              ]}
              label={t("gallery.mainNav")}
            />
          </div>
          <Sidebar
            groups={[
              {
                entries: [
                  { active: true, href: "#dashboard", icon: "grid", label: t("gallery.dashboard") },
                  { count: 4, href: "#members", icon: "user", label: t("gallery.members") },
                ],
                label: t("gallery.club"),
              },
            ]}
            label={t("gallery.admin")}
          />
        </GallerySection>

        <GallerySection title={t("gallery.status")}>
          <div className="gallery-row">
            <Avatar name={t("gallery.person")} />
            <Avatar kind="dog" name={t("gallery.dog")} />
            <LevelDot label={t("gallery.levelC")} level="c" />
            <Toast tone="info">{t("gallery.updated")}</Toast>
            <GalleryToastButton />
            <Button
              onClick={() => {
                setModalOpen(true);
              }}
              variant="ghost"
            >
              {t("gallery.openModal")}
            </Button>
            <Button
              onClick={() => {
                setDrawerOpen(true);
              }}
              variant="ghost"
            >
              {t("gallery.openDrawer")}
            </Button>
          </div>
          <Skeleton height="1.5rem" label={t("gallery.loading")} />
          <EmptyState
            action={<Button variant="secondary">{t("gallery.add")}</Button>}
            description={t("gallery.emptyDescription")}
            title={t("gallery.emptyTitle")}
          />
          <DataTable
            caption={t("gallery.tableCaption")}
            columns={[
              { header: t("gallery.name"), key: "name", render: (row) => row.name },
              {
                header: t("gallery.level"),
                key: "level",
                render: (row) => (
                  <LevelDot label={`${t("gallery.level")} ${row.level}`} level={row.level} />
                ),
              },
              {
                header: t("gallery.status"),
                key: "status",
                render: (row) => (
                  <Chip tone={row.status === "active" ? "success" : "warning"}>
                    {row.status === "active" ? t("gallery.active") : t("gallery.risk")}
                  </Chip>
                ),
              },
            ]}
            empty={t("gallery.tableEmpty")}
            loadingLabel={t("gallery.loading")}
            rowKey={(row) => row.name}
            rows={members}
          />
        </GallerySection>

        <Modal
          closeLabel={t("gallery.close")}
          onClose={() => {
            setModalOpen(false);
          }}
          open={modalOpen}
          title={t("gallery.modalTitle")}
        >
          {t("gallery.confirmQuestion")}
        </Modal>
        <Drawer
          closeLabel={t("gallery.close")}
          onClose={() => {
            setDrawerOpen(false);
          }}
          open={drawerOpen}
          title={t("gallery.drawerTitle")}
        >
          {t("gallery.person")}
        </Drawer>
      </main>
    </ToastProvider>
  );
}

export function Gallery() {
  const [canic, setCanic] = useState(false);
  const content = (
    <GalleryContent
      canic={canic}
      onThemeChange={() => {
        setCanic((value) => !value);
      }}
    />
  );

  return canic ? <BrandingProvider branding={canicBranding}>{content}</BrandingProvider> : content;
}
