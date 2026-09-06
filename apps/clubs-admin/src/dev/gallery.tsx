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
        toast.push(t("common:gallery.updated"), "success");
      }}
    >
      {t("common:gallery.toast")}
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
    { level: "c", name: t("common:gallery.person"), status: "active" },
    { level: "d", name: t("common:gallery.dog"), status: "risk" },
  ];

  return (
    <ToastProvider dismissLabel={t("common:gallery.close")}>
      <main className="gallery-page">
        <header className="gallery-header">
          <div>
            <span className="gallery-header__eyebrow">{t("shell:app.clubsAdmin")}</span>
            <h1>{t("common:gallery.title")}</h1>
          </div>
          <Button onClick={onThemeChange} variant="secondary">
            {canic ? t("common:gallery.theme.agilityhub") : t("common:gallery.theme.canic")}
          </Button>
        </header>

        <GallerySection title={t("common:gallery.states")}>
          <div className="gallery-row">
            <Button>{t("common:gallery.save")}</Button>
            <Button variant="secondary">{t("common:gallery.cancel")}</Button>
            <Button variant="ghost">{t("common:gallery.edit")}</Button>
            <Button variant="danger">{t("common:gallery.delete")}</Button>
            <Button loading loadingLabel={t("common:gallery.saving")}>
              {t("common:gallery.save")}
            </Button>
            <IconButton icon="edit" label={t("common:gallery.edit")} />
          </div>
          <Card>
            <div className="gallery-row">
              <Chip tone="success">{t("common:gallery.active")}</Chip>
              <Chip tone="warning">{t("common:gallery.risk")}</Chip>
              <Chip tone="danger">{t("common:gallery.cancelled")}</Chip>
              <Chip tone="info">{t("common:gallery.noShow")}</Chip>
              <Chip>{t("common:gallery.levelC")}</Chip>
              <Badge tone="danger">4</Badge>
            </div>
          </Card>
        </GallerySection>

        <GallerySection title={t("common:gallery.forms")}>
          <div className="gallery-form-grid">
            <FormField
              help={t("common:gallery.help")}
              id="gallery-name"
              label={t("common:gallery.name")}
            >
              <Input id="gallery-name" placeholder={t("common:gallery.person")} />
            </FormField>
            <FormField id="gallery-notes" label={t("common:gallery.notes")}>
              <Textarea id="gallery-notes" />
            </FormField>
            <FormField id="gallery-level" label={t("common:gallery.level")}>
              <Select defaultValue="c" id="gallery-level">
                <option value="c">{t("common:gallery.levelC")}</option>
              </Select>
            </FormField>
            <FormField
              error={t("common:gallery.required")}
              id="gallery-required"
              label={t("common:gallery.name")}
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
              {t("common:gallery.select")}
            </label>
            <Switch
              checked={checked}
              label={t("common:gallery.notifications")}
              onCheckedChange={setChecked}
            />
            <RadioGroup
              label={t("common:gallery.modality")}
              onValueChange={setModality}
              options={[
                { label: t("common:gallery.agility"), value: "agility" },
                { label: t("common:gallery.initiation"), value: "initiation" },
              ]}
              value={modality}
            />
          </div>
        </GallerySection>

        <GallerySection title={t("common:gallery.navigation")}>
          <div className="gallery-mobile-preview">
            <AppBar
              end={<IconButton icon="bell" label={t("common:gallery.notifications")} />}
              start={<Avatar name={t("common:gallery.dog")} kind="dog" />}
              title={t("common:gallery.home")}
            />
            <Tabs
              items={[
                {
                  content: t("common:gallery.person"),
                  label: t("common:gallery.profile"),
                  value: "profile",
                },
                {
                  content: t("common:gallery.dog"),
                  label: t("common:gallery.dogs"),
                  value: "dogs",
                },
              ]}
              label={t("common:gallery.drawerTitle")}
            />
            <TabBar
              items={[
                { active: true, href: "#home", icon: "home", label: t("common:gallery.home") },
                { href: "#book", icon: "cal", label: t("common:gallery.reserve") },
                { href: "#training", icon: "cone", label: t("common:gallery.training") },
                { href: "#today", icon: "day", label: t("common:gallery.today") },
                { href: "#profile", icon: "user", label: t("common:gallery.profile") },
                { href: "#info", icon: "info", label: t("common:gallery.info") },
              ]}
              label={t("common:gallery.mainNav")}
            />
          </div>
          <Sidebar
            groups={[
              {
                entries: [
                  {
                    active: true,
                    href: "#dashboard",
                    icon: "grid",
                    label: t("common:gallery.dashboard"),
                  },
                  { count: 4, href: "#members", icon: "user", label: t("common:gallery.members") },
                ],
                label: t("common:gallery.club"),
              },
            ]}
            label={t("common:gallery.admin")}
          />
        </GallerySection>

        <GallerySection title={t("common:gallery.status")}>
          <div className="gallery-row">
            <Avatar name={t("common:gallery.person")} />
            <Avatar kind="dog" name={t("common:gallery.dog")} />
            <LevelDot label={t("common:gallery.levelC")} level="c" />
            <Toast tone="info">{t("common:gallery.updated")}</Toast>
            <GalleryToastButton />
            <Button
              onClick={() => {
                setModalOpen(true);
              }}
              variant="ghost"
            >
              {t("common:gallery.openModal")}
            </Button>
            <Button
              onClick={() => {
                setDrawerOpen(true);
              }}
              variant="ghost"
            >
              {t("common:gallery.openDrawer")}
            </Button>
          </div>
          <Skeleton height="1.5rem" label={t("common:gallery.loading")} />
          <EmptyState
            action={<Button variant="secondary">{t("common:gallery.add")}</Button>}
            description={t("common:gallery.emptyDescription")}
            title={t("common:gallery.emptyTitle")}
          />
          <DataTable
            caption={t("common:gallery.tableCaption")}
            columns={[
              { header: t("common:gallery.name"), key: "name", render: (row) => row.name },
              {
                header: t("common:gallery.level"),
                key: "level",
                render: (row) => (
                  <LevelDot label={`${t("common:gallery.level")} ${row.level}`} level={row.level} />
                ),
              },
              {
                header: t("common:gallery.status"),
                key: "status",
                render: (row) => (
                  <Chip tone={row.status === "active" ? "success" : "warning"}>
                    {row.status === "active"
                      ? t("common:gallery.active")
                      : t("common:gallery.risk")}
                  </Chip>
                ),
              },
            ]}
            empty={t("common:gallery.tableEmpty")}
            loadingLabel={t("common:gallery.loading")}
            rowKey={(row) => row.name}
            rows={members}
          />
        </GallerySection>

        <Modal
          closeLabel={t("common:gallery.close")}
          onClose={() => {
            setModalOpen(false);
          }}
          open={modalOpen}
          title={t("common:gallery.modalTitle")}
        >
          {t("common:gallery.confirmQuestion")}
        </Modal>
        <Drawer
          closeLabel={t("common:gallery.close")}
          onClose={() => {
            setDrawerOpen(false);
          }}
          open={drawerOpen}
          title={t("common:gallery.drawerTitle")}
        >
          {t("common:gallery.person")}
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
