(() => {
  const SOURCES = ["all", "uams", "cmis", "ppis"] as const;
  type SourceFilter = (typeof SOURCES)[number];
  const REQUEST_TIMEOUT_MS = 20000;
  const REFRESH_TIMEOUT_MS = 35000;
  const SEARCH_DELAY_MS = 300;
  const SOURCE_CLASS: Record<string, string> = {
    uams: "bg-gradient-primary",
    cmis: "bg-gradient-info",
    ppis: "bg-gradient-success",
  };

  interface AuditRecord {
    id: number;
    source: string;
    source_label: string;
    external_id: number;
    occurred_at: string | null;
    actor_name: string | null;
    user_level: string | null;
    field_office: string | null;
    module: string | null;
    action: string | null;
  }

  interface AuditSourceStatus {
    source: string;
    label: string;
    available: boolean | null;
    last_synced_at: string | null;
    last_error: string | null;
    saved: number;
  }

  interface AuditList {
    data: AuditRecord[];
    message?: string;
    meta: {
      current_page: number;
      last_page: number;
      total: number;
      from: number | null;
      to: number | null;
      total_saved: number;
      timezone: string;
    };
    counts: Record<SourceFilter, number>;
    sources: AuditSourceStatus[];
  }

  const appElement = document.getElementById("audit-app");
  if (!(appElement instanceof HTMLElement) || !window.CmsApi || !window.CmsApi.token()) {
    return;
  }
  const app: HTMLElement = appElement;
  const cmsApi = window.CmsApi;
  const signInUrl = app.dataset.signInUrl ?? "sign-in.html";
  const heading = byId<HTMLElement>("audit-heading");
  const searchForm = byId<HTMLFormElement>("audit-search-form");
  const searchInput = byId<HTMLInputElement>("audit-search");
  const fromInput = byId<HTMLInputElement>("audit-from");
  const toInput = byId<HTMLInputElement>("audit-to");
  const filterButtons = Array.from(app.querySelectorAll<HTMLButtonElement>("[data-source]"));
  const successBox = byId<HTMLElement>("audit-success");
  const warningBox = byId<HTMLElement>("audit-warning");
  const sourceStatus = byId<HTMLElement>("audit-source-status");
  const live = byId<HTMLElement>("audit-live");
  const loadingState = byId<HTMLElement>("audit-loading");
  const emptyState = byId<HTMLElement>("audit-empty");
  const noMatchState = byId<HTMLElement>("audit-no-match");
  const noMatchText = byId<HTMLElement>("audit-no-match-text");
  const loadErrorState = byId<HTMLElement>("audit-load-error");
  const loadErrorText = byId<HTMLElement>("audit-load-error-text");
  const tableWrap = byId<HTMLElement>("audit-table-wrap");
  const rowsBody = byId<HTMLTableSectionElement>("audit-rows");
  const pagination = byId<HTMLElement>("audit-pagination");
  const rangeText = byId<HTMLElement>("audit-range");
  const prevButton = byId<HTMLButtonElement>("audit-prev");
  const nextButton = byId<HTMLButtonElement>("audit-next");
  const refreshButton = byId<HTMLButtonElement>("audit-refresh");
  const refreshSpinner = byId<HTMLElement>("audit-refresh-spinner");
  const retryButton = byId<HTMLButtonElement>("audit-retry");

  const query = new URLSearchParams(window.location.search);
  const state = {
    search: (query.get("search") ?? "").slice(0, 100),
    source: parseSource(query.get("source")),
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
      const source = parseSource(button.dataset.source ?? null);
      if (source === state.source) {
        return;
      }
      state.source = source;
      state.page = 1;
      updateFilterButtons();
      void load();
    });
  }
  fromInput.addEventListener("change", () => applyDates());
  toInput.addEventListener("change", () => applyDates());
  byId<HTMLButtonElement>("audit-clear").addEventListener("click", () => {
    searchInput.value = "";
    fromInput.value = "";
    toInput.value = "";
    state.search = "";
    state.source = "all";
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
  for (const box of [successBox, warningBox]) {
    box.querySelector(".users-feedback-close")?.addEventListener("click", () => {
      box.hidden = true;
      heading.focus();
    });
  }

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
    await request(listUrl(), false);
  }

  async function refresh(): Promise<void> {
    if (refreshing) {
      return;
    }
    refreshing = true;
    refreshButton.disabled = true;
    refreshSpinner.hidden = false;
    try {
      await request(refreshUrl(), true);
    } finally {
      refreshing = false;
      refreshButton.disabled = false;
      refreshSpinner.hidden = true;
    }
  }

  async function request(url: string, isRefresh: boolean): Promise<void> {
    listController?.abort();
    const controller = new AbortController();
    listController = controller;
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, isRefresh ? REFRESH_TIMEOUT_MS : REQUEST_TIMEOUT_MS);

    rememberQuery();
    showLoading();

    try {
      const response = await fetch(url, {
        method: isRefresh ? "POST" : "GET",
        signal: controller.signal,
        headers: cmsApi.headers(),
      });
      const payload = await readJson(response);
      if (controller !== listController) {
        return;
      }
      if (!response.ok || !isAuditList(payload)) {
        if (isRefresh && hasRendered) {
          showRefreshProblem(response.status, payload);
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
      render(payload, isRefresh);
    } catch {
      if (controller !== listController) {
        return;
      }
      if (isRefresh && hasRendered) {
        showRefreshProblem(timedOut ? -1 : 0, {});
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
    return withQuery(cmsApi.url("/audit-trail"));
  }

  function refreshUrl(): string {
    return withQuery(cmsApi.url("/audit-trail/refresh"));
  }

  function withQuery(url: string): string {
    const queryString = currentQuery();
    return queryString === "" ? url : `${url}?${queryString}`;
  }

  function currentQuery(): string {
    const params = new URLSearchParams();
    if (state.search !== "") params.set("search", state.search);
    if (state.source !== "all") params.set("source", state.source);
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
      live.textContent = "Loading audit records…";
      return;
    }
    emptyState.hidden = true;
    noMatchState.hidden = true;
    tableWrap.hidden = true;
    pagination.hidden = true;
    loadingState.hidden = false;
  }

  function render(response: AuditList, isRefresh: boolean): void {
    hasRendered = true;
    loadingState.hidden = true;
    loadErrorState.hidden = true;
    for (const filter of SOURCES) {
      const count = app.querySelector(`[data-count="${filter}"]`);
      if (count) {
        count.textContent = String(response.counts[filter] ?? 0);
      }
    }
    renderSources(response);
    rowsBody.replaceChildren();
    const { meta } = response;
    emptyState.hidden = meta.total_saved !== 0;
    noMatchState.hidden = meta.total_saved === 0 || response.data.length > 0;
    tableWrap.hidden = response.data.length === 0;
    pagination.hidden = response.data.length === 0 || meta.last_page <= 1;

    if (isRefresh && response.message) {
      const problems = response.sources.some((source) => source.last_error);
      const box = problems ? warningBox : successBox;
      const other = problems ? successBox : warningBox;
      other.hidden = true;
      text(box, ".users-feedback-text", response.message);
      box.hidden = false;
    }

    if (meta.total_saved === 0) {
      live.textContent = "No audit records saved yet.";
      return;
    }
    if (response.data.length === 0) {
      noMatchText.textContent = describeNoMatch();
      live.textContent = "No audit records match the current search or filter.";
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

  function renderSources(response: AuditList): void {
    const timeZone = safeTimeZone(response.meta.timezone);
    const parts = response.sources.map((source) => {
      if (source.last_error) {
        return `${source.label}: ${source.last_error}`;
      }
      if (source.last_synced_at) {
        return `${source.label} last read ${formatWhen(source.last_synced_at, timeZone)}`;
      }
      return `${source.label} has not been read yet`;
    });
    sourceStatus.textContent = parts.join(" · ");
  }

  function buildRow(record: AuditRecord, timeZone: string | undefined): HTMLTableRowElement {
    const row = document.createElement("tr");
    row.append(
      cell("When", formatWhen(record.occurred_at, timeZone)),
      badgeCell(record),
      cell("Name", record.actor_name ?? "Unknown user"),
      cell("Level", record.user_level ?? "—"),
      cell("Field office", record.field_office ?? "—"),
      cell("Module", record.module ?? "—"),
      cell("Action", record.action ?? "—", true),
    );
    return row;
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

  function badgeCell(record: AuditRecord): HTMLTableCellElement {
    const td = document.createElement("td");
    td.dataset.label = "System";
    const badge = document.createElement("span");
    badge.className = `badge ${SOURCE_CLASS[record.source] ?? "bg-gradient-secondary"}`;
    badge.textContent = record.source_label;
    td.append(badge);
    return td;
  }

  function showRefreshProblem(status: number, payload: unknown): void {
    app.removeAttribute("aria-busy");
    loadingState.hidden = true;
    successBox.hidden = true;
    text(warningBox, ".users-feedback-text", refreshProblem(status, payload));
    warningBox.hidden = false;
    live.textContent = textContent(warningBox);
  }

  function refreshProblem(status: number, payload: unknown): string {
    const message = messageOf(payload);
    if (status === 401) return message ?? "Your session has ended. Sign in again to refresh the systems audit trail.";
    if (status === 403) return "Your account isn't allowed to refresh the systems audit trail.";
    if (status === 422) return message ?? "Those filters aren't valid.";
    if (status === -1) return "The refresh took too long. Showing the records already loaded.";
    return message ?? "Couldn't refresh the systems audit trail. Showing the records already loaded.";
  }

  function textContent(root: ParentNode): string {
    return root.querySelector(".users-feedback-text")?.textContent ?? "";
  }

  function showLoadError(status: number, payload: unknown): void {
    const message = messageOf(payload);
    successBox.hidden = true;
    warningBox.hidden = true;
    loadingState.hidden = true;
    emptyState.hidden = true;
    noMatchState.hidden = true;
    tableWrap.hidden = true;
    pagination.hidden = true;
    loadErrorState.hidden = false;
    retryButton.hidden = false;
    if (status === 401) {
      loadErrorText.textContent = message ?? "Your session has ended. Sign in again to view the systems audit trail.";
      retryButton.hidden = true;
      const link = document.createElement("a");
      link.className = "btn btn-outline-secondary btn-sm mb-0";
      link.href = signInUrl;
      link.textContent = "Sign in";
      retryButton.replaceWith(link);
    } else if (status === 403) {
      loadErrorText.textContent = "Your account isn't allowed to view the systems audit trail.";
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
    if (state.source !== "all") parts.push(`in ${state.source.toUpperCase()}`);
    if (state.from !== "" || state.to !== "") parts.push("in that date range");
    return parts.length > 0 ? `No records found ${parts.join(" ")}.` : "Try a different search or filter.";
  }

  function updateFilterButtons(): void {
    for (const button of filterButtons) {
      const selected = parseSource(button.dataset.source ?? null) === state.source;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    }
  }

  function parseSource(value: string | null): SourceFilter {
    return SOURCES.includes(value as SourceFilter) ? (value as SourceFilter) : "all";
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

  function text(root: ParentNode, selector: string, value: string): void {
    const element = root.querySelector(selector);
    if (element) {
      element.textContent = value;
    }
  }

  function isAuditList(value: unknown): value is AuditList {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    const candidate = value as Partial<AuditList>;
    return Array.isArray(candidate.data)
      && typeof candidate.meta === "object"
      && candidate.meta !== null
      && typeof candidate.counts === "object"
      && candidate.counts !== null
      && Array.isArray(candidate.sources);
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
