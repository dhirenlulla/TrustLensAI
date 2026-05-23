/**
 * TrustLens AI — API Client
 * =========================
 * Centralised service layer for all communication with the FastAPI backend.
 *
 * Why a dedicated file?
 * ---------------------
 * Keeping all fetch() calls here means:
 *  • One place to change the base URL (dev → staging → prod)
 *  • Consistent error handling across the whole app
 *  • Easy to swap fetch for axios later without touching any component
 *
 * Usage (in any React component or page)
 * ---------------------------------------
 *   import { validateSubmission } from "@/services/api";
 *
 *   const result = await validateSubmission(formData);
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Base URL of the FastAPI backend.
 *
 * In development this points to the local Uvicorn server.
 * In production, set NEXT_PUBLIC_API_URL in your .env.production file
 * so Next.js replaces it at build time without touching this file.
 *
 * Example .env.local:
 *   NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
 */
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

/** Prefix shared by every TrustLens endpoint. */
const API_PREFIX = "/api/v1";

/** Full root URL — e.g. "http://127.0.0.1:8000/api/v1" */
const BASE = `${API_BASE_URL}${API_PREFIX}`;

// ---------------------------------------------------------------------------
// Request Types
// ---------------------------------------------------------------------------

/**
 * The salary submission payload sent to POST /validate.
 *
 * Every field mirrors the Pydantic SalarySubmission model in
 * backend/app/routes/validation.py — keep them in sync.
 */
export interface SalarySubmission {
  /** Employer name — must be one of the supported companies. */
  company: string;

  /** Job title / function (e.g. "Software Engineer"). */
  role: string;

  /** Seniority level (e.g. "Senior", "Intern"). */
  level: string;

  /** Total years of professional experience (0 – 50). */
  yearsOfExperience: number;

  /** Work location or "Remote". */
  location: string;

  /** Annual base salary in USD. */
  baseSalary: number;

  /** Annual cash bonus in USD. */
  bonus: number;

  /** Annual stock / RSU grant in USD. */
  stockGrant: number;

  /** Total annual compensation in USD (base + bonus + stock). */
  totalCompensation: number;

  /** "Remote" | "Hybrid" | "On-site" */
  workArrangement: string;
}

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

/**
 * Successful response from POST /validate.
 *
 * Maps 1-to-1 with the ValidationResponse Pydantic model in the backend.
 */
export interface ValidationResult {
  /** UUID assigned by the backend for traceability. */
  submission_id: string;

  /** True when the Isolation Forest model flags the entry as suspicious. */
  predicted_anomaly: boolean;

  /**
   * Raw Isolation Forest score.
   * More negative  →  more anomalous.
   * Typically in the range -0.5 … +0.1 for this dataset.
   */
  anomaly_score: number;

  /**
   * Model's estimated probability that this is a fraudulent entry.
   * Range: 0.0 (very trustworthy) → 1.0 (very suspicious).
   */
  fraud_probability: number;

  /**
   * Human-friendly composite trust score.
   * Range: 0 (critical) → 100 (fully trustworthy).
   * Combines the ML score with business-rule flags.
   */
  trust_score: number;

  /**
   * Categorical label derived from trust_score:
   *   "HIGH"     80 – 100  safe for analytics
   *   "MEDIUM"   55 – 79   include with caution
   *   "LOW"      30 – 54   exclude, queue for review
   *   "CRITICAL"  0 – 29   almost certainly fraudulent
   */
  trust_label: "HIGH" | "MEDIUM" | "LOW" | "CRITICAL";

  /**
   * Plain-English explanations for each business-rule flag triggered.
   * Empty array when no rules fired.
   */
  flags: string[];
}

/**
 * Structured error returned by the API client on any failure.
 * Components can check `ApiError.status` to distinguish 4xx from 5xx.
 */
export interface ApiError {
  /** HTTP status code (0 when the request never reached the server). */
  status: number;

  /** Short machine-readable error type. */
  error: string;

  /** Human-readable explanation suitable for displaying in the UI. */
  message: string;
}

export interface AnalyticsSummary {
  total_submissions: number;
  anomalies_detected: number;
  average_trust_score: number;
  fraud_rate: number;
  high_risk_submissions: number;
}

export interface RecentSubmission {
  submission_id: string;
  company: string;
  role: string;
  level: string;
  trust_score: number;
  trust_label: "HIGH" | "MEDIUM" | "LOW" | "CRITICAL";
  predicted_anomaly: boolean;
  fraud_probability: number;
}

/**
 * Discriminated union returned by every API function.
 *
 * Pattern:
 *   const result = await validateSubmission(data);
 *   if (result.ok) {
 *     console.log(result.data.trust_score);
 *   } else {
 *     console.error(result.error.message);
 *   }
 */
export type ApiResponse<T> =
  | { ok: true;  data: T }
  | { ok: false; error: ApiError };

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Default request headers sent with every JSON request.
 * Extend this if you later add auth tokens (e.g. "Authorization": `Bearer ${token}`).
 */
const DEFAULT_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  Accept:         "application/json",
};

/**
 * How long (ms) to wait before treating a request as timed out.
 * 15 seconds gives the ML inference pipeline plenty of breathing room
 * while still failing fast if the backend is completely unreachable.
 */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Wraps fetch() with:
 *   • A configurable timeout via AbortController
 *   • Consistent JSON + error parsing
 *   • A typed ApiResponse<T> discriminated union return value
 *
 * @param url     Full URL to fetch
 * @param options Standard RequestInit options (method, body, headers, …)
 */
async function request<T>(
  url: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  // AbortController lets us cancel the fetch() after REQUEST_TIMEOUT_MS.
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      headers: { ...DEFAULT_HEADERS, ...(options.headers ?? {}) },
      signal:  controller.signal,
    });

    // Always clear the timeout once we have any response (even an error one).
    clearTimeout(timeoutId);

    // ----------------------------------------------------------------
    // Parse the response body as JSON regardless of status code.
    // FastAPI sends structured error bodies for 4xx/5xx too, so we want
    // that detail rather than a generic "something went wrong" message.
    // ----------------------------------------------------------------
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      // The server returned a non-JSON body (e.g. an Nginx 502 HTML page).
      body = null;
    }

    // ----------------------------------------------------------------
    // HTTP error (4xx / 5xx)
    // ----------------------------------------------------------------
    if (!response.ok) {
      // FastAPI validation errors (422) nest the message inside `detail`.
      const detail =
        body != null && typeof body === "object" && "detail" in body
          ? String((body as Record<string, unknown>).detail)
          : `HTTP ${response.status} — ${response.statusText}`;

      return {
        ok:    false,
        error: {
          status:  response.status,
          error:   statusToErrorType(response.status),
          message: detail,
        },
      };
    }

    // ----------------------------------------------------------------
    // Success
    // ----------------------------------------------------------------
    return { ok: true, data: body as T };

  } catch (err: unknown) {
    // Always clear the timeout so it doesn't fire after we've returned.
    clearTimeout(timeoutId);

    // ----------------------------------------------------------------
    // Network / timeout errors
    // ----------------------------------------------------------------
    if (err instanceof DOMException && err.name === "AbortError") {
      return {
        ok:    false,
        error: {
          status:  0,
          error:   "TIMEOUT",
          message: `Request timed out after ${REQUEST_TIMEOUT_MS / 1_000} seconds. Is the backend running?`,
        },
      };
    }

    // Any other fetch failure (DNS failure, refused connection, CORS, …)
    const message =
      err instanceof Error ? err.message : "Unknown network error.";

    return {
      ok:    false,
      error: {
        status:  0,
        error:   "NETWORK_ERROR",
        message: `Could not reach the TrustLens API: ${message}`,
      },
    };
  }
}

/**
 * Maps common HTTP status codes to short, readable error type strings.
 * Shown in logs and optionally in the developer console.
 */
function statusToErrorType(status: number): string {
  const map: Record<number, string> = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    500: "SERVER_ERROR",
    502: "BAD_GATEWAY",
    503: "SERVICE_UNAVAILABLE",
    504: "GATEWAY_TIMEOUT",
  };
  return map[status] ?? `HTTP_${status}`;
}

// ---------------------------------------------------------------------------
// Public API Functions
// ---------------------------------------------------------------------------

/**
 * validateSubmission
 * ------------------
 * Sends a salary submission to the TrustLens validation engine and returns
 * a structured trust assessment.
 *
 * Endpoint  POST /api/v1/validate
 *
 * @param submission  The compensation data to validate.
 * @returns           ApiResponse<ValidationResult> — check `.ok` before using `.data`.
 *
 * @example
 * ```ts
 * const response = await validateSubmission({
 *   company:           "Google",
 *   role:              "Software Engineer",
 *   level:             "Senior",
 *   yearsOfExperience: 8,
 *   location:          "San Francisco, CA",
 *   baseSalary:        210000,
 *   bonus:             40000,
 *   stockGrant:        80000,
 *   totalCompensation: 330000,
 *   workArrangement:   "Hybrid",
 * });
 *
 * if (response.ok) {
 *   console.log("Trust score:", response.data.trust_score);
 *   console.log("Trust label:", response.data.trust_label);
 * } else {
 *   console.error("Validation failed:", response.error.message);
 * }
 * ```
 */
export async function validateSubmission(
  submission: SalarySubmission,
): Promise<ApiResponse<ValidationResult>> {
  return request<ValidationResult>(`${BASE}/validate`, {
    method: "POST",
    body:   JSON.stringify(submission),
  });
}

/**
 * checkApiHealth
 * --------------
 * Pings the FastAPI health-check endpoint to confirm the backend is reachable.
 * Useful for showing a "Backend offline" banner in the UI on page load.
 *
 * Endpoint  GET /health
 *
 * @example
 * ```ts
 * const health = await checkApiHealth();
 * if (!health.ok) setBackendOffline(true);
 * ```
 */
export async function checkApiHealth() {
  const res = await fetch(`${API_BASE_URL}/health`);
  return {
    ok: res.ok,
    data: await res.json(),
  };
}

/**
 * checkModelStatus
 * ----------------
 * Checks whether the Isolation Forest model and preprocessor are loaded
 * and ready to serve predictions.
 *
 * Endpoint  GET /api/v1/validate/status
 *
 * Returns 503 when the model hasn't been trained yet — useful for showing
 * a "Model not ready" warning in the admin dashboard.
 */
export async function checkModelStatus() {
  const res = await fetch(`${BASE}/validate/status`);

  return {
    ok: res.ok,
    data: await res.json(),
  };
}

export async function getAnalytics(): Promise<ApiResponse<AnalyticsSummary>> {
  return request<AnalyticsSummary>(`${BASE}/analytics`);
}

export async function getRecentSubmissions(): Promise<ApiResponse<RecentSubmission[]>> {
  return request<RecentSubmission[]>(`${BASE}/recent-submissions`);
}