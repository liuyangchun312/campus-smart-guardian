export function onRequest({ request, env }) {
  // Service binding preserves the public origin and reuses the existing database.
  return env.CAMPUS.fetch(request);
}
