'use client';

import { useEffect, useState } from 'react';

import { getPlannerStore } from '../lib/storage/get-store.js';
import type { PlannerRing, PlannerVenue } from '../lib/storage/types.js';

import { NeutralBadge } from './ui/Badge.js';
import { Card, CardTitle } from './ui/Card.js';

export interface VenueRingSelectorLabels {
  readonly title: string;
  readonly venue: string;
  readonly ring: string;
  readonly loading: string;
  readonly pickVenue: string;
  readonly pickVenueFirst: string;
  readonly pickRing: string;
  readonly loadError: string;
  readonly venueOption: (venue: PlannerVenue) => string;
  readonly ringOption: (ring: PlannerRing) => string;
  readonly markerCount: (count: number) => string;
  readonly doorCount: (count: number) => string;
  readonly noGoZoneCount: (count: number) => string;
}

interface Props {
  readonly venue: PlannerVenue | null;
  readonly ring: PlannerRing | null;
  readonly labels: VenueRingSelectorLabels;
  readonly onVenue: (venue: PlannerVenue) => void;
  readonly onRing: (ring: PlannerRing) => void;
}

export function VenueRingSelector({ venue, ring, labels, onVenue, onRing }: Props) {
  const [venues, setVenues] = useState<readonly PlannerVenue[] | null>(null);
  const [rings, setRings] = useState<readonly PlannerRing[]>([]);
  const [ringsVenueId, setRingsVenueId] = useState<string | null>(null);
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getPlannerStore().listVenues().then(
      (items) => {
        if (cancelled) return;
        setVenues(items);
        setLoadErrorKey(null);
        const first = items[0];
        if (venue === null && items.length === 1 && first !== undefined) onVenue(first);
      },
      () => {
        if (!cancelled) setLoadErrorKey('venues');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [onVenue, venue]);

  useEffect(() => {
    if (venue === null) return;
    let cancelled = false;
    const venueId = venue.id;
    void getPlannerStore().listRings(venueId).then(
      (items) => {
        if (cancelled) return;
        setRings(items);
        setRingsVenueId(venueId);
        setLoadErrorKey(null);
        const first = items[0];
        if (ring === null && items.length === 1 && first !== undefined) onRing(first);
      },
      () => {
        if (!cancelled) setLoadErrorKey(venueId);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [onRing, ring, venue]);

  const loadingVenues = venues === null;
  const currentRings = venue !== null && ringsVenueId === venue.id ? rings : [];
  const loadingRings = venue !== null && ringsVenueId !== venue.id;
  const hasCurrentError = loadErrorKey === 'venues' || loadErrorKey === venue?.id;

  return (
    <Card>
      <CardTitle>{labels.title}</CardTitle>

      <div className="space-y-3">
        <label className="block">
          <span className="block text-xs text-muted mb-1">{labels.venue}</span>
          <select
            value={venue?.id ?? ''}
            onChange={(event) => {
              const selected = venues?.find((item) => item.id === event.target.value);
              if (selected !== undefined) onVenue(selected);
            }}
            disabled={loadingVenues}
            className="block w-full bg-surface-2 text-text border border-border rounded-agh px-3 py-2 text-sm"
          >
            <option value="" disabled>
              {loadingVenues ? labels.loading : labels.pickVenue}
            </option>
            {venues?.map((item) => (
              <option key={item.id} value={item.id}>
                {labels.venueOption(item)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs text-muted mb-1">{labels.ring}</span>
          <select
            value={ring?.id ?? ''}
            onChange={(event) => {
              const selected = currentRings.find((item) => item.id === event.target.value);
              if (selected !== undefined) onRing(selected);
            }}
            disabled={venue === null || loadingRings}
            className="block w-full bg-surface-2 text-text border border-border rounded-agh px-3 py-2 text-sm disabled:opacity-50"
          >
            <option value="" disabled>
              {venue === null
                ? labels.pickVenueFirst
                : loadingRings
                  ? labels.loading
                  : labels.pickRing}
            </option>
            {currentRings.map((item) => (
              <option key={item.id} value={item.id}>
                {labels.ringOption(item)}
              </option>
            ))}
          </select>
        </label>

        {hasCurrentError ? (
          <p className="text-xs text-danger" role="alert">
            {labels.loadError}
          </p>
        ) : null}

        {ring !== null ? (
          <div className="flex flex-wrap gap-2 text-xs">
            <NeutralBadge>{labels.markerCount(ring.markers.length)}</NeutralBadge>
            <NeutralBadge>{labels.doorCount(ring.doors.length)}</NeutralBadge>
            <NeutralBadge>{labels.noGoZoneCount(ring.no_go_zones.length)}</NeutralBadge>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
