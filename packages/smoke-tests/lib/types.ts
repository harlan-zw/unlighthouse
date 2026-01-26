/* ------------------------------------------------------------------ */
/*  Smoke Test Target Configuration Types                             */
/* ------------------------------------------------------------------ */

/**
 * A page to smoke-test. At minimum, provide a `path`.
 * Optionally list CSS selectors that must be visible and whether the
 * page requires authentication.
 */
export interface PageConfig {
  /** Path relative to baseUrl (e.g. "/" or "/dashboard") */
  path: string;
  /** Human-readable label for test reports */
  name?: string;
  /** CSS selectors that must be visible on the page */
  selectors?: string[];
  /** Page requires authentication (default: false) */
  auth?: boolean;
  /** Expected HTTP status code (default: 200) */
  expectedStatus?: number;
}

/* ------------------------------------------------------------------ */
/*  Flows                                                             */
/* ------------------------------------------------------------------ */

export type FlowAction =
  | 'goto'
  | 'click'
  | 'fill'
  | 'upload'
  | 'wait'
  | 'select'
  | 'press';

export interface FlowStep {
  /** Action to perform */
  action: FlowAction;
  /** CSS selector for the target element */
  selector?: string;
  /** Value for fill / upload / select / press actions */
  value?: string;
  /** URL path for goto action */
  path?: string;
  /** Timeout in ms for wait action (default: 10 000) */
  timeout?: number;
}

export interface FlowConfig {
  /** Flow name shown in reports */
  name: string;
  /** Whether this flow requires authentication */
  auth?: boolean;
  /** Ordered steps to execute */
  steps: FlowStep[];
  /** Selectors that must be visible after the flow completes */
  expectSelectors?: string[];
  /** Assert zero JS errors during the flow (default: true) */
  expectNoJsErrors?: boolean;
}

/* ------------------------------------------------------------------ */
/*  SEO                                                               */
/* ------------------------------------------------------------------ */

export interface SeoPageConfig {
  path: string;
  title?: string | RegExp;
  description?: string | RegExp;
  ogTitle?: string | RegExp;
  ogImage?: string | RegExp;
  canonical?: string | RegExp;
  h1?: string | RegExp;
  /** If true, expects a noindex robots tag */
  noindex?: boolean;
}

export interface SeoConfig {
  pages: SeoPageConfig[];
}

/* ------------------------------------------------------------------ */
/*  Authentication                                                    */
/* ------------------------------------------------------------------ */

export type AuthStrategy = 'form' | 'bearer' | 'basic' | 'cookie';

export interface AuthConfig {
  /** Authentication strategy */
  strategy: AuthStrategy;

  /* --- form strategy --- */
  /** Login page URL path */
  loginUrl?: string;
  /**
   * Map of CSS selector → env-var reference.
   * Use "${ENV_VAR}" syntax to read from environment.
   * Example: { "#email": "${MY_APP_EMAIL}" }
   */
  fields?: Record<string, string>;
  /** CSS selector for the submit button */
  submitSelector?: string;
  /** URL path or CSS selector that confirms successful login */
  successIndicator?: string;

  /* --- bearer strategy --- */
  /** Env-var reference for the bearer token, e.g. "${API_TOKEN}" */
  token?: string;

  /* --- basic strategy --- */
  username?: string;
  password?: string;

  /* --- cookie strategy --- */
  cookieName?: string;
  /** Env-var reference for the cookie value */
  cookieValue?: string;

  /** Max age of cached auth state in ms (default: 24 h) */
  maxAge?: number;
}

/* ------------------------------------------------------------------ */
/*  Product Target — the top-level config per site                    */
/* ------------------------------------------------------------------ */

export interface ProductTarget {
  /** Unique name (used as Playwright project name) */
  name: string;
  /** Base URL of the product */
  baseUrl: string;
  /** Env var that overrides baseUrl at runtime */
  baseUrlEnv?: string;

  /** Authentication configuration */
  auth?: AuthConfig;
  /** Pages to smoke-test */
  pages: PageConfig[];
  /** Multi-step functional flows */
  flows?: FlowConfig[];
  /** SEO checks */
  seo?: SeoConfig;

  /**
   * JS error patterns to ignore (matched as case-insensitive regex).
   * Common third-party noise (analytics, hotjar, etc.) is already
   * filtered by default — add product-specific patterns here.
   */
  allowedErrors?: string[];
}
