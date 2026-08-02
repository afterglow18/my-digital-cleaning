/**
 * Module-level signal for the background vision indexer.
 * Components subscribe to know when indexing is running so they
 * can show the "Preparing photo search…" toast without prop-drilling.
 */

export type Listener = () => void;

const listeners = new Set<Listener>();
export let isIndexing = false;

export function setIndexing(v: boolean): void {
  isIndexing = v;
  listeners.forEach((fn) => fn());
}

/** Subscribe to indexing state changes. Returns an unsubscribe function. */
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
