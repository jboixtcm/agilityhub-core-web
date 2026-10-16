import type { components } from "@agilityhub/api-client";
import {
  Button,
  missingModuleDependencies,
  moduleDependents,
  type ModulePreset,
  modulePresets,
  Switch,
} from "@agilityhub/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { ConsoleTabProps } from "../ClubRecordPage";
import {
  type ClubModule,
  consoleErrorMessage,
  CONSOLE_MODULES,
  FormMessage,
  inCatalogOrder,
  SectionCard,
  useRebasedDraft,
  useWriteState,
} from "../shared";

type ModulesRequest = components["schemas"]["PlatformModulesRequest"];

export const MODULE_PRESETS = [
  "COMPLET",
  "MINIM",
  "CANIC",
] as const satisfies readonly ModulePreset[];

/**
 * S17 §2 «Mòduls» (R-17-04): a switch per module with what it turns on, its dependencies
 * (CATALEG_MODULS «Depèn de») and the three presets. Turning a module off never deletes data.
 */
export function ModulesTab({ client, club, onReload }: ConsoleTabProps) {
  const { t } = useTranslation(["console", "errors", "common"]);
  const form = useRebasedDraft(
    { modules: inCatalogOrder<string>(club.modules, CONSOLE_MODULES) },
    `${club.id}:${String(club.version)}`,
  );
  const write = useWriteState();
  const [preset, setPreset] = useState<ModulePreset>();
  const enabled = form.draft.modules;
  const label = (module: string) => t(`console:modules.${module}.label`);

  const send = async (body: ModulesRequest) => {
    const saved = await write.run(async () => {
      const result = await client.PUT("/platform/clubs/{id}/modules", {
        body,
        params: { path: { id: club.id } },
      });
      if (result.data === undefined) throw new TypeError("Modules without data");
      return result.data;
    }, onReload);
    // The answer is `{modules, version}`: the record (checklist, other tabs) is read again.
    if (saved !== undefined) {
      setPreset(undefined);
      await onReload();
    }
  };

  return (
    <div className="console-form">
      <SectionCard
        description={t("console:modulesTab.description")}
        title={t("console:modulesTab.title")}
      >
        <div className="console-presets" role="group" aria-label={t("console:modulesTab.presets")}>
          {MODULE_PRESETS.map((candidate) => (
            <Button
              aria-pressed={preset === candidate}
              disabled={write.pending}
              key={candidate}
              onClick={() => {
                setPreset(candidate);
                form.setField(
                  "modules",
                  CONSOLE_MODULES.filter((module) =>
                    (modulePresets[candidate] as readonly string[]).includes(module),
                  ),
                );
              }}
              variant="secondary"
            >
              {t(`console:presets.${candidate}`)}
            </Button>
          ))}
        </div>
        <ul className="console-modules">
          {CONSOLE_MODULES.map((module) => {
            const on = enabled.includes(module);
            const missing = missingModuleDependencies(enabled, module);
            const dependents = moduleDependents(enabled, module);
            // A module turns on only with what it needs, and off only when nothing on needs it.
            const blocked = on ? dependents.length > 0 : missing.length > 0;
            return (
              <li className="console-module" key={module}>
                <span>
                  <strong>{label(module)}</strong>
                  <small>{t(`console:modules.${module}.help`)}</small>
                  {missing.length > 0 && !on ? (
                    <small className="console-module__dependency">
                      {t("console:modulesTab.requires", { modules: missing.map(label).join(", ") })}
                    </small>
                  ) : null}
                  {dependents.length > 0 && on ? (
                    <small className="console-module__dependency">
                      {t("console:modulesTab.requiredBy", {
                        modules: dependents.map(label).join(", "),
                      })}
                    </small>
                  ) : null}
                </span>
                <Switch
                  checked={on}
                  disabled={blocked || write.pending}
                  label={label(module)}
                  onCheckedChange={(checked) => {
                    setPreset(undefined);
                    form.setField(
                      "modules",
                      CONSOLE_MODULES.filter((candidate) =>
                        candidate === module ? checked : enabled.includes(candidate),
                      ),
                    );
                  }}
                />
              </li>
            );
          })}
        </ul>
        <p className="console-muted">{t("console:modulesTab.noDataLoss")}</p>
      </SectionCard>
      <FormMessage
        message={write.error === undefined ? undefined : consoleErrorMessage(t, write.error)}
        tone="danger"
      />
      <FormMessage message={write.done ? t("console:common.saved") : undefined} tone="success" />
      <div className="console-actions">
        <Button
          disabled={form.changed.length === 0 || write.pending}
          onClick={() => {
            setPreset(undefined);
            form.reset();
          }}
          variant="ghost"
        >
          {t("console:common.discard")}
        </Button>
        <Button
          disabled={form.changed.length === 0}
          loading={write.pending}
          loadingLabel={t("console:common.saving")}
          onClick={() =>
            void send(
              preset === undefined
                ? { modules: enabled as ClubModule[], version: club.version }
                : { preset, version: club.version },
            )
          }
        >
          {t("console:common.save")}
        </Button>
      </div>
    </div>
  );
}
