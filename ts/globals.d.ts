/** Defined by js/api.js, which every dashboard page loads before its page script. */
interface CmsApiClient {
  token(): string | null;
  setToken(token: string): void;
  clearToken(): void;
  url(path: string): string;
  headers(extra?: Record<string, string>): Record<string, string>;
}

interface BootstrapModal {
  show(): void;
  hide(): void;
}

interface BootstrapToast {
  show(): void;
  hide(): void;
}

declare const bootstrap: {
  Modal: {
    getOrCreateInstance(element: Element): BootstrapModal;
  };
  Toast: {
    getOrCreateInstance(element: Element, config?: { autohide?: boolean; delay?: number }): BootstrapToast;
  };
};

/** Set by js/guard.js once the signed-in account has loaded. */
interface CmsUser {
  role?: string;
  can?: { manage_users?: boolean; manage_systems?: boolean; view_audit_trail?: boolean };
}

interface Window {
  CmsApi?: CmsApiClient;
  CMS_USER?: CmsUser;
}
