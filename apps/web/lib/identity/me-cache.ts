export type CachedMe = {
  display_name: string;
  permissions: string[];
};

let cachedMe: CachedMe | null = null;
let pendingMe: Promise<CachedMe | null> | null = null;

export function getCachedMe() {
  return cachedMe;
}

export function loadMe() {
  if (cachedMe) return Promise.resolve(cachedMe);
  pendingMe ??= fetch("/api/v1/me")
    .then((response) => response.json())
    .then((body) => {
      cachedMe = body.code === 0 && body.data ? body.data : null;
      return cachedMe;
    })
    .catch(() => null)
    .finally(() => { pendingMe = null; });
  return pendingMe;
}

export function clearCachedMe() {
  cachedMe = null;
  pendingMe = null;
}
