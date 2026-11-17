const inFlight = new Map<string, Promise<unknown>>();

/**
 * Runs at most one task per key: callers arriving while it runs share its
 * result instead of starting a second run. Wine prefixes are shared by every
 * launch of a game, and two installers in one prefix break each other.
 */
export const runSingleFlight = <T>(
  key: string,
  task: () => Promise<T>
): Promise<T> => {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  // Deferred so the entry is registered before the task can settle.
  const promise = Promise.resolve()
    .then(task)
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
};
