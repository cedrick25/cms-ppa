(() => {
  const MODULES = ["all", "session", "credentials", "users"] as const;
  type ModuleFilter = (typeof MODULES)[number];
  const REQUEST_TIMEOUT_MS = 20000;
  const SEARCH_DELAY_MS = 300;
  const MODULE_CLASS: Record<string, string> = {
    session: "bg-gradient-info",
    credentials: "bg-gradient-primary",
    users: "bg-gradient-success",
  };

  interface CmsAuditEvent {
    id: number;
    occurred_at: string | null;
    actor_name: string | null;
    actor_username: string | null;
    module: string;
    module_label: string;
    action_label: string;
    summary: string | null;
    changed: string[];
  }

  interface CmsAuditList {
    data: CmsAuditEvent[];
    meta: {
      current_page: number;
      last_page: number;
      total: number;
      from: number | null;
      to: number | null;
      total_recorded: number;
      timezone: string;
    };
    counts: Record<ModuleFilter, number>;
  }

  const appElement = document.getElementById("cms-audit-app");
  if (!(appElement instanceof HTMLElement) || !window.CmsApi || !window.CmsApi.token()) {
    return;
  }
  const app: HTMLElement = appElement;
  const cmsApi = window.CmsApi;
  const signInUrl = app.dataset.signInUrl ?? "sign-in.html";
  const heading = byId<HTMLElement>("cms-audit-heading");
  const searchForm = byId<HTMLFormElement>("cms-audit-search-form");
  const searchInput = byId<HTMLInputElement>("cms-audit-search");
  const fromInput = byId<HTMLInputElement>("cms-audit-from");
  const toInput = byId<HTMLInputElement>("cms-audit-to");
  const filterButtons = Array.from(app.querySelectorAll<HTMLButtonElement>("[data-module]"));
  const warningBox = byId<HTMLElement>("cms-audit-warning");
  const live = byId<HTMLElement>("cms-audit-live");
  const loadingState = byId<HTMLElement>("cms-audit-loading");
  const emptyState = byId<HTMLElement>("cms-audit-empty");
  const noMatchState = byId<HTMLElement>("cms-audit-no-match");
  const noMatchText = byId<HTMLElement>("cms-audit-no-match-text");
  const loadErrorState = byId<HTMLElement>("cms-audit-load-error");
  const loadErrorText = byId<HTMLElement>("cms-audit-load-error-text");
  const tableWrap = byId<HTMLElement>("cms-audit-table-wrap");
  const rowsBody = byId<HTMLTableSectionElement>("cms-audit-rows");
  const pagination = byId<HTMLElement>("cms-audit-pagination");
  const rangeText = byId<HTMLElement>("cms-audit-range");
  const prevButton = byId<HTMLButtonElement>("cms-audit-prev");
  const nextButton = byId<HTMLButtonElement>("cms-audit-next");
  const refreshButton = byId<HTMLButtonElement>("cms-audit-refresh");
  const refreshSpinner = byId<HTMLElement>("cms-audit-refresh-spinner");
  const retryButton = byId<HTMLButtonElement>("cms-audit-retry");

  const query = new URLSearchParams(window.location.search);
  const state = {
    search: (query.get("search") ?? "").slice(0, 100),
    module: parseModule(query.get("module")),
    from: parseDate(query.get("from")),
    to: parseDate(query.get("to")),
    page: Math.max(1, Number.parseInt(query.get("page") ?? "1", 10) || 1),
  };

  let listController: AbortController | null = null;
  let hasRendered = false;
  let searchTimer = 0;
  let refreshing = false;

  searchInput.value = state.search;
  fromInput.value = state.from;
  toInput.value = state.to;
  updateFilterButtons();

  searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(applySearch, SEARCH_DELAY_MS);
  });
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    window.clearTimeout(searchTimer);
    applySearch();
  });
  for (const button of filterButtons) {
    button.addEventListener("click", () => {
      const moduleName = parseModule(button.dataset.module ?? null);
      if (moduleName === state.module) {
        return;
      }
      state.module = moduleName;
      state.page = 1;
      updateFilterButtons();
      void load();
    });
  }
  fromInput.addEventListener("change", () => applyDates());
  toInput.addEventListener("change", () => applyDates());
  byId<HTMLButtonElement>("cms-audit-clear").addEventListener("click", () => {
    searchInput.value = "";
    fromInput.value = "";
    toInput.value = "";
    state.search = "";
    state.module = "all";
    state.from = "";
    state.to = "";
    state.page = 1;
    updateFilterButtons();
    void load();
    searchInput.focus();
  });
  retryButton.addEventListener("click", () => void load());
  prevButton.addEventListener("click", () => {
    if (state.page > 1) {
      state.page -= 1;
      void load();
    }
  });
  nextButton.addEventListener("click", () => {
    state.page += 1;
    void load();
  });
  refreshButton.addEventListener("click", () => void refresh());
  warningBox.querySelector(".users-feedback-close")?.addEventListener("click", () => {
    warningBox.hidden = true;
    heading.focus();
  });

  void load();

  function applySearch(): void {
    const value = searchInput.value.trim();
    if (value === state.search) {
      return;
    }
    state.search = value;
    state.page = 1;
    void load();
  }

  function applyDates(): void {
    const from = parseDate(fromInput.value);
    const to = parseDate(toInput.value);
    if (from === state.from && to === state.to) {
      return;
    }
    state.from = from;
    state.to = to;
    state.page = 1;
    void load();
  }

  async function load(): Promise<void> {
    await request(false);
  }

  async function refresh(): Promise<void> {
    if (refreshing) {
      return;
    }
    refreshing = true;
    refreshButton.disabled = true;
    refreshSpinner.hidden = false;
    try {
      await request(true);
    } finally {
      refreshing = false;
      refreshButton.disabled = false;
      refreshSpinner.hidden = true;
    }
  }

  async function request(isRefresh: boolean): Promise<void> {
    listController?.abort();
    const controller = new AbortController();
    listController = controller;
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    rememberQuery();
    showLoading();

    try {
      const response = await fetch(listUrl(), {
        signal: controller.signal,
        headers: cmsApi.headers(),
      });
      const payload = await readJson(response);
      if (controller !== listController) {
        return;
      }
      if (!response.ok || !isCmsAuditList(payload)) {
        if (isRefresh && hasRendered) {
          showWarning(refreshProblem(response.status, payload));
          return;
        }
        showLoadError(response.status, payload);
        return;
      }
      if (payload.data.length === 0 && state.page > payload.meta.last_page) {
        state.page = Math.max(1, payload.meta.last_page);
        void load();
        return;
      }
      render(payload);
    } catch {
      if (controller !== listController) {
        return;
      }
      if (isRefresh && hasRendered) {
        showWarning(timedOut ? "The refresh took too long. Showing the records already loaded." : "Couldn't refresh the CMS audit trail. Showing the records already loaded.");
        return;
      }
      showLoadError(timedOut ? -1 : 0, {});
    } finally {
      window.clearTimeout(timer);
      if (controller === listController) {
        app.removeAttribute("aria-busy");
        tableWrap.classList.remove("is-loading");
      }
    }
  }

  function listUrl(): string {
    const queryString = currentQuery();
    const url = cmsApi.url("/cms-audit-trail");
    return queryString === "" ? url : `${url}?${queryString}`;
  }

  function currentQuery(): string {
    const params = new URLSearchParams();
    if (state.search !== "") params.set("search", state.search);
    if (state.module !== "all") params.set("module", state.module);
    if (state.from !== "") params.set("from", state.from);
    if (state.to !== "") params.set("to", state.to);
    if (state.page > 1) params.set("page", String(state.page));
    return params.toString();
  }

  function rememberQuery(): void {
    const queryString = currentQuery();
    window.history.replaceState(null, "", queryString === "" ? window.location.pathname : `?${queryString}`);
  }

  function showLoading(): void {
    app.setAttribute("aria-busy", "true");
    loadErrorState.hidden = true;
    if (hasRendered && !tableWrap.hidden) {
      tableWrap.classList.add("is-loading");
      live.textContent = "Loading CMS audit records…";
      return;
    }
    emptyState.hidden = true;
    noMatchState.hidden = true;
    tableWrap.hidden = true;
    pagination.hidden = true;
    loadingState.hidden = false;
  }

  function render(response: CmsAuditList): void {
    hasRendered = true;
    warningBox.hidden = true;
    loadingState.hidden = true;
    loadErrorState.hidden = true;
    for (const filter of MODULES) {
      const count = app.querySelector(`[data-count="${filter}"]`);
      if (count) {
        count.textContent = String(response.counts[filter] ?? 0);
      }
    }
    rowsBody.replaceChildren();
    const { meta } = response;
    emptyState.hidden = meta.total_recorded !== 0;
    noMatchState.hidden = meta.total_recorded === 0 || response.data.length > 0;
    tableWrap.hidden = response.data.length === 0;
    pagination.hidden = response.data.length === 0 || meta.last_page <= 1;

    if (meta.total_recorded === 0) {
      live.textContent = "No CMS activity recorded yet.";
      return;
    }
    if (response.data.length === 0) {
      noMatchText.textContent = describeNoMatch();
      live.textContent = "No CMS audit records match the current search or filter.";
      return;
    }

    const timeZone = safeTimeZone(meta.timezone);
    for (const record of response.data) {
      rowsBody.append(buildRow(record, timeZone));
    }
    rangeText.textContent = `Showing ${meta.from ?? 0}–${meta.to ?? 0} of ${meta.total} ${meta.total === 1 ? "record" : "records"}`;
    prevButton.disabled = meta.current_page <= 1;
    nextButton.disabled = meta.current_page >= meta.last_page;
    live.textContent = `${meta.total} ${meta.total === 1 ? "record" : "records"} found.`;
  }

  function buildRow(record: CmsAuditEvent, timeZone: string | undefined): HTMLTableRowElement {
    const row = document.createElement("tr");
    row.append(
      cell("When", formatWhen(record.occurred_at, timeZone)),
      cell("User", person(record)),
      badgeCell(record),
      cell("Action", record.action_label),
      cell("Detail", detail(record), true),
    );
    return row;
  }

  function person(record: CmsAuditEvent): string {
    const name = record.actor_name ?? "Unknown user";
    return record.actor_username ? `${name} (${record.actor_username})` : name;
  }

  function detail(record: CmsAuditEvent): string {
    const summary = record.summary ?? "—";
    if (record.changed.length === 0) {
      return summary;
    }
    return `${summary} Changed: ${record.changed.join(", ")}.`;
  }

  function cell(label: string, value: string, action = false): HTMLTableCellElement {
    const td = document.createElement("td");
    td.dataset.label = label;
    if (action) {
      td.className = "audit-action";
    }
    td.textContent = value;
    return td;
  }

  function badgeCell(record: CmsAuditEvent): HTMLTableCellElement {
    const td = document.createElement("td");
    td.dataset.label = "Module";
    const badge = document.createElement("span");
    badge.className = `badge ${MODULE_CLASS[record.module] ?? "bg-gradient-secondary"}`;
    badge.textContent = record.module_label;
    td.append(badge);
    return td;
  }

  function showWarning(message: string): void {
    app.removeAttribute("aria-busy");
    loadingState.hidden = true;
    const textNode = warningBox.querySelector(".users-feedback-text");
    if (textNode) {
      textNode.textContent = message;
    }
    warningBox.hidden = false;
    live.textContent = message;
  }

  function refreshProblem(status: number, payload: unknown): string {
    const message = messageOf(payload);
    if (status === 401) return message ?? "Your session has ended. Sign in again to refresh the CMS audit trail.";
    if (status === 403) return "Your account isn't allowed to refresh the CMS audit trail.";
    if (status === 422) return message ?? "Those filters aren't valid.";
    return message ?? "Couldn't refresh the CMS audit trail. Showing the records already loaded.";
  }

  function showLoadError(status: number, payload: unknown): void {
    const message = messageOf(payload);
    warningBox.hidden = true;
    loadingState.hidden = true;
    emptyState.hidden = true;
    noMatchState.hidden = true;
    tableWrap.hidden = true;
    pagination.hidden = true;
    loadErrorState.hidden = false;
    retryButton.hidden = false;
    if (status === 401) {
      loadErrorText.textContent = message ?? "Your session has ended. Sign in again to view the CMS audit trail.";
      retryButton.hidden = true;
      const link = document.createElement("a");
      link.className = "btn btn-outline-secondary btn-sm mb-0";
      link.href = signInUrl;
      link.textContent = "Sign in";
      retryButton.replaceWith(link);
    } else if (status === 403) {
      loadErrorText.textContent = "Your account isn't allowed to view the CMS audit trail.";
      retryButton.hidden = true;
    } else if (status === 422) {
      loadErrorText.textContent = message ?? "Those filters aren't valid.";
    } else if (status === -1) {
      loadErrorText.textContent = "The request took too long. Try again.";
    } else {
      loadErrorText.textContent = message ?? "Check your connection and try again.";
    }
    live.textContent = loadErrorText.textContent;
  }

  function describeNoMatch(): string {
    const parts: string[] = [];
    if (state.search !== "") parts.push(`matching “${state.search}”`);
    if (state.module !== "all") parts.push(`in ${moduleLabel(state.module)}`);
    if (state.from !== "" || state.to !== "") parts.push("in that date range");
    return parts.length > 0 ? `No records found ${parts.join(" ")}.` : "Try a different search or filter.";
  }

  function moduleLabel(moduleName: ModuleFilter): string {
    if (moduleName === "session") return "Sign-in";
    if (moduleName === "credentials") return "Credentials";
    if (moduleName === "users") return "Users";
    return "All";
  }

  function updateFilterButtons(): void {
    for (const button of filterButtons) {
      const selected = parseModule(button.dataset.module ?? null) === state.module;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    }
  }

  function parseModule(value: string | null): ModuleFilter {
    return MODULES.includes(value as ModuleFilter) ? (value as ModuleFilter) : "all";
  }

  function parseDate(value: string | null): string {
    return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  }

  function formatWhen(value: string | null, timeZone: string | undefined): string {
    if (value === null || value === "") {
      return "Unknown time";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "Unknown time";
    }
    return new Intl.DateTimeFormat("en-PH", {
      timeZone,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function safeTimeZone(timeZone: string): string | undefined {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
      return timeZone;
    } catch {
      return undefined;
    }
  }

  function messageOf(payload: unknown): string | null {
    if (typeof payload !== "object" || payload === null || !("message" in payload)) {
      return null;
    }
    const message = payload.message;
    return typeof message === "string" && message !== "" ? message : null;
  }

  function isCmsAuditList(value: unknown): value is CmsAuditList {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    const candidate = value as Partial<CmsAuditList>;
    return Array.isArray(candidate.data)
      && typeof candidate.meta === "object"
      && candidate.meta !== null
      && typeof candidate.counts === "object"
      && candidate.counts !== null;
  }

  function byId<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Missing #${id}`);
    }
    return element as T;
  }

  async function readJson(response: Response): Promise<unknown> {
    const textBody = await response.text();
    if (textBody === "") {
      return {};
    }
    try {
      return JSON.parse(textBody) as unknown;
    } catch {
      return {};
    }
  }
})();
