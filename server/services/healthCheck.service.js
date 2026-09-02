// First-version application health check.
//
// Goal: distinguish "an HTTP server is reachable on the published host port"
// from "nothing is listening". It does NOT assume a dedicated /health route.
// Any HTTP response - including 404 / 5xx - counts as reachable; only a
// failure to get any response at all (connection refused/reset, timeout,
// DNS) counts as unhealthy. Frontend and backend apps are treated the same.

const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : fallback;
};

// Tunable without code changes; sensible defaults for cold `npm start` +
// dependency connection time.
const DEFAULT_RETRIES = toPositiveInt(process.env.HEALTHCHECK_RETRIES, 10);
const DEFAULT_DELAY_MS = toPositiveInt(process.env.HEALTHCHECK_DELAY_MS, 2000);
const DEFAULT_TIMEOUT_MS = toPositiveInt(
  process.env.HEALTHCHECK_TIMEOUT_MS,
  3000
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// One probe. { responded: true, status } if the server answered with any
// HTTP status; { responded: false } if nothing usable is listening.
const probeHttp = async (url, timeoutMs) => {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });

    return { responded: true, status: response.status };
  } catch {
    return { responded: false };
  }
};

// Polls http://localhost:<hostPort> until the HTTP server responds or the
// retry budget is exhausted. Returns
//   { healthy: true, attempts, status }  or  { healthy: false, attempts }.
export const waitForApplicationHttp = async (hostPort, options = {}) => {
  const retries = toPositiveInt(options.retries, DEFAULT_RETRIES);
  const delayMs = toPositiveInt(options.delayMs, DEFAULT_DELAY_MS);
  const timeoutMs = toPositiveInt(options.timeoutMs, DEFAULT_TIMEOUT_MS);

  const url = `http://localhost:${hostPort}`;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const result = await probeHttp(url, timeoutMs);

    if (result.responded) {
      return { healthy: true, attempts: attempt, status: result.status };
    }

    if (attempt < retries) {
      await sleep(delayMs);
    }
  }

  return { healthy: false, attempts: retries };
};
