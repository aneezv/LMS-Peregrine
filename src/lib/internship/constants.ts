/** Keep in sync with DB RPC `internship_process_heartbeat` v_idle (seconds). */
export const SERVER_INACTIVITY_SECONDS = 3 * 60
export const CLIENT_INACTIVITY_MS = SERVER_INACTIVITY_SECONDS * 1000

export const HEARTBEAT_INTERVAL_MS = 12_000

/** Optional random “still there?” prompt between these bounds */
export const PING_CHALLENGE_MIN_MS = 20 * 60 * 1000
export const PING_CHALLENGE_MAX_MS = 40 * 60 * 1000

/** UTC day cap for credited active internship time (must match DB RPC `internship_process_heartbeat`). */
export const MAX_DAILY_ACTIVE_SECONDS = 3600
