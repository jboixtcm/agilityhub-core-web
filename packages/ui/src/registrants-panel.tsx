import type { ReactNode } from "react";

import { Badge, Button, Chip, Skeleton, type Tone } from "./components";

export interface RegistrantsPanelRow {
  id: string;
  /** «Laura + Duna». */
  name: string;
  /** The dog's level code (mockup D12's chip after the name); absent: no chip. */
  level?: string | undefined;
  state: { label: string; tone: Tone };
}

export interface RegistrantsPanelWaiting {
  id: string;
  /** «Júlia + Kira», with its position in a FIFO club («1. Júlia + Kira»). */
  label: string;
}

export interface RegistrantsPanelProps {
  /** «Inscrits (4/5)». */
  title: string;
  emptyLabel: string;
  loadingLabel: string;
  loading: boolean;
  rows: RegistrantsPanelRow[];
  /** A failed load (with its retry), or a failed removal: shown inside the panel. */
  error?: ReactNode;
  /** `undefined`: the club has no waiting list (`WAITLIST` off), so there is no line at all. */
  waiting?: {
    entries: RegistrantsPanelWaiting[];
    /** «En espera: Júlia + Kira · Roser + Lluna». */
    text: string;
  };
  /** ADMIN only (R-08-16): one [Treu de la llista] per waiting entry. Absent: read-only. */
  removal?: {
    buttonLabel: string;
    label: (entry: RegistrantsPanelWaiting) => string;
    onRemove: (entry: RegistrantsPanelWaiting) => void;
    /** The entry whose removal is on its way: every button waits for it. */
    pendingId?: string | undefined;
  };
}

/**
 * The registrants of a class (S08 §6: D4's selected-class card, screen 23's class drawer): one row
 * per booking as the api orders them, with its state; then the «En espera: …» line of D12.
 */
export function RegistrantsPanel({
  emptyLabel,
  error,
  loading,
  loadingLabel,
  removal,
  rows,
  title,
  waiting,
}: RegistrantsPanelProps) {
  return (
    <section aria-label={title} className="ah-registrants">
      <h3 className="ah-registrants__title">{title}</h3>
      {loading ? (
        <Skeleton height="4rem" label={loadingLabel} />
      ) : (
        <>
          {rows.length === 0 ? (
            <p className="ah-registrants__empty">{emptyLabel}</p>
          ) : (
            <ul className="ah-registrants__list">
              {rows.map((row) => (
                <li className="ah-registrants__row" key={row.id}>
                  <span className="ah-registrants__who">
                    <strong>{row.name}</strong>
                    {row.level === undefined ? null : (
                      <Chip className="ah-registrants__level">{row.level}</Chip>
                    )}
                  </span>
                  <Badge tone={row.state.tone}>{row.state.label}</Badge>
                </li>
              ))}
            </ul>
          )}
          {waiting === undefined || waiting.entries.length === 0 ? null : (
            <div className="ah-registrants__waiting">
              <p>{waiting.text}</p>
              {removal === undefined ? null : (
                <ul className="ah-registrants__waiting-list">
                  {waiting.entries.map((entry) => (
                    <li key={entry.id}>
                      <span>{entry.label}</span>
                      <Button
                        aria-label={removal.label(entry)}
                        disabled={removal.pendingId !== undefined}
                        loading={removal.pendingId === entry.id}
                        onClick={() => {
                          removal.onRemove(entry);
                        }}
                        variant="ghost"
                      >
                        {removal.buttonLabel}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
      {error === undefined ? null : (
        <div className="ah-registrants__error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
