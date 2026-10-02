'use client';

import { useEffect } from 'react';
import { Button } from './Button';
import { Icon } from './Icon';

/**
 * Shared error boundary body for route segments (app/<role>/error.tsx).
 * Before this, a failed query rendered as an empty list ("No meetings yet"),
 * which hid real problems.
 */
export function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto mt-xl flex max-w-lg flex-col items-center gap-sm rounded-xl border border-error/30 bg-error-container/40 p-lg text-center">
      <Icon name="error" size={32} className="text-error" />
      <h1 className="font-h3 text-h3">This page couldn&apos;t load</h1>
      <p className="font-body-sm text-on-surface-variant">
        Something went wrong while loading this page. Check your internet connection, then try again.
        {error.digest ? ` (Reference: ${error.digest})` : ''}
      </p>
      <Button icon="refresh" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}

/** Skeleton shown while a server page is loading (no shimmer: reduced-motion safe by design). */
export function RouteLoading() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-md">
      <div className="h-9 w-64 rounded-lg bg-surface-container" />
      <div className="h-5 w-96 max-w-full rounded-lg bg-surface-container-low" />
      <div className="mt-md grid grid-cols-1 gap-md md:grid-cols-3">
        <div className="h-32 rounded-xl bg-surface-container-low" />
        <div className="h-32 rounded-xl bg-surface-container-low" />
        <div className="h-32 rounded-xl bg-surface-container-low" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
