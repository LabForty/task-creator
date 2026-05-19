import type { JobEvent } from "@/lib/jobs/types";

// Must stay in sync with every variant of JobEvent.type. Named SSE events
// (`event: <type>\n…`) only reach a listener registered for that exact name —
// the default onmessage handler never fires for them. Forgetting one here
// silently breaks the surface that depends on it (e.g. diagrams_created was
// missed and the "Create diagrams" flow hung forever).
const EVENT_TYPES: ReadonlyArray<JobEvent["type"]> = [
  "role_started",
  "role_progress",
  "role_token",
  "gate_result",
  "role_finished",
  "finalized",
  "gates_failed",
  "diagrams_created",
  "diagrams_analyzed",
  "diagrams_applied",
  "help_progress",
  "help_message",
  "help_done",
  "error",
];

/**
 * Subscribe to `/api/jobs/:id/stream` over Server-Sent Events.
 * Returns an unsubscribe function that closes the underlying EventSource.
 */
export function subscribeToJob(jobId: string, onEvent: (e: JobEvent) => void): () => void {
  const es = new EventSource(`/api/jobs/${jobId}/stream`);
  const handler = (raw: MessageEvent) => {
    try {
      onEvent(JSON.parse(raw.data) as JobEvent);
    } catch {
      /* ignore malformed payload */
    }
  };
  for (const t of EVENT_TYPES) {
    es.addEventListener(t, handler as EventListener);
  }
  return () => es.close();
}
