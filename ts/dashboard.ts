(() => {
  type StatusState = "up" | "down" | "unknown";

  interface SystemStatusInfo {
    state: StatusState;
    reason: string | null;
    http_status: number | null;
    response_time_ms: number | null;
    checked_at: string | null;
    next_check_at: string | null;
    is_stale: boolean;
  }

  interface DashboardSystem {
    id: number;
    name: string;
    domain: string | null;
    domain_hidden: boolean;
    ip_address: string | null;
    ip_address_hidden: boolean;
    status: SystemStatusInfo;
  }

  interface SystemsResponse {
    data: DashboardSystem[];
    meta: {
      total: number;
      check_interval_minutes: number;
      stale_after_minutes: number;
      timezone: string;
      generated_at: string;
    };
  }

  interface SignIn {
    id: number;
    name: string;
    signed_in_at: string;
  }

  interface SignInsResponse {
    data: SignIn[];
    meta: { shows: string; limit: number; timezone: string; generated_at: string };
  }

  type ChartKind = "bar" | "line";
  type ActivityRange = "current_week" | "last_week" | "last_30_days";

  interface ActivityPoint {
    date: string;
    label: string;
    count: number;
  }

  interface ActivityResponse {
    data: ActivityPoint[];
    meta: {
      series: string;
      series_label: string;
      range: string;
      range_label: string;
      from: string;
      to: string;
      total: number;
      timezone: string;
      generated_at: string;
    };
  }

  interface WidgetConfig<T> {
    path: string | (() => string);
    card: HTMLElement;
    noun: string;
    loading: HTMLElement;
    error: HTMLElement;
    errorText: HTMLElement;
    retry: HTMLButtonElement;
    forbidden: HTMLElement | null;
    refreshError: HTMLElement;
    content: HTMLElement[];
    live: HTMLElement;
    isValid(payload: unknown): payload is T;
    render(payload: T, announce: boolean): void;
  }

  interface Widget {
    load(announce: boolean): Promise<void>;
    loadedAt(): number;
  }

  /** The API only returns saved results, so polling it never contacts the monitored systems. */
  const REFRESH_MS = 60000;
  const REQUEST_TIMEOUT_MS = 15000;
  const STATUS_LABELS: Record<StatusState, string> = { up: "Up", down: "Down", unknown: "Unknown" };
  const NOT_CHECKED = "Not checked yet.";

  const api = window.CmsApi;
  const systemsCard = document.getElementById("dashboard-systems");
  const signInsCard = document.getElementById("dashboard-sign-ins");
  if (!api || !api.token() || !(systemsCard instanceof HTMLElement) || !(signInsCard instanceof HTMLElement)) {
    return;
  }
  const cmsApi = api;
  const signInUrl = "sign-in.html";

  const systemsSummary = byId<HTMLElement>("dashboard-systems-summary");
  const systemsUpdated = byId<HTMLElement>("dashboard-systems-updated");
  const systemsEmpty = byId<HTMLElement>("dashboard-systems-empty");
  const systemsTable = byId<HTMLElement>("dashboard-systems-table");
  const systemsRows = byId<HTMLTableSectionElement>("dashboard-systems-rows");
  const systemRowTemplate = byId<HTMLTemplateElement>("dashboard-system-row");

  const signInsList = byId<HTMLElement>("dashboard-sign-ins-list");
  const signInsEmpty = byId<HTMLElement>("dashboard-sign-ins-empty");
  const signInsTimezone = byId<HTMLElement>("dashboard-sign-ins-timezone");
  const signInTemplate = byId<HTMLTemplateElement>("dashboard-sign-in-item");

  const systemsWidget = createWidget<SystemsResponse>({
    path: "/dashboard/systems",
    card: systemsCard,
    noun: "systems",
    loading: byId("dashboard-systems-loading"),
    error: byId("dashboard-systems-error"),
    errorText: byId("dashboard-systems-error-text"),
    retry: byId("dashboard-systems-retry"),
    forbidden: null,
    refreshError: byId("dashboard-systems-refresh-error"),
    content: [systemsEmpty, systemsTable],
    live: byId("dashboard-systems-live"),
    isValid: isSystemsResponse,
    render: renderSystems,
  });

  const signInsWidget = createWidget<SignInsResponse>({
    path: "/dashboard/sign-ins",
    card: signInsCard,
    noun: "sign-ins",
    loading: byId("dashboard-sign-ins-loading"),
    error: byId("dashboard-sign-ins-error"),
    errorText: byId("dashboard-sign-ins-error-text"),
    retry: byId("dashboard-sign-ins-retry"),
    forbidden: byId("dashboard-sign-ins-forbidden"),
    refreshError: byId("dashboard-sign-ins-refresh-error"),
    content: [signInsEmpty, signInsList],
    live: byId("dashboard-sign-ins-live"),
    isValid: isSignInsResponse,
    render: renderSignIns,
  });

  const widgets = [systemsWidget, signInsWidget];
  mountActivityCharts(widgets);
  for (const widget of widgets) {
    void widget.load(true);
  }

  window.setInterval(() => {
    if (document.visibilityState === "visible") {
      for (const widget of widgets) {
        void widget.load(false);
      }
    }
  }, REFRESH_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") {
      return;
    }
    for (const widget of widgets) {
      if (Date.now() - widget.loadedAt() >= REFRESH_MS) {
        void widget.load(false);
      }
    }
  });

  function createWidget<T>(config: WidgetConfig<T>): Widget {
    let controller: AbortController | null = null;
    let hasRendered = false;
    let stopped = false;
    let loadedAt = 0;
    let lastSuccess: Date | null = null;

    config.retry.addEventListener("click", () => void load(true));

    async function load(announce: boolean): Promise<void> {
      if (stopped) {
        return;
      }
      controller?.abort();
      const current = new AbortController();
      controller = current;
      let timedOut = false;
      const timer = window.setTimeout(() => {
        timedOut = true;
        current.abort();
      }, REQUEST_TIMEOUT_MS);

      config.card.setAttribute("aria-busy", "true");
      if (!hasRendered) {
        show(config.loading);
      }

      let status: number;
      let payload: unknown = {};
      try {
        const path = typeof config.path === "function" ? config.path() : config.path;
        const response = await fetch(cmsApi.url(path), { signal: current.signal, headers: cmsApi.headers() });
        status = response.status;
        payload = await readJson(response);
      } catch {
        status = timedOut ? -1 : 0;
      } finally {
        window.clearTimeout(timer);
      }

      if (current !== controller) {
        return;
      }
      config.card.setAttribute("aria-busy", "false");
      loadedAt = Date.now();

      if (status === 200 && config.isValid(payload)) {
        hasRendered = true;
        lastSuccess = new Date();
        config.refreshError.hidden = true;
        config.loading.hidden = true;
        config.error.hidden = true;
        config.render(payload, announce);
        return;
      }

      const message = typeof (payload as { message?: unknown }).message === "string"
        ? (payload as { message: string }).message
        : null;

      if (status === 401 || status === 403) {
        stopped = true;
        hasRendered = false;
        config.refreshError.hidden = true;
      }

      if (status === 403 && config.forbidden) {
        show(config.forbidden);
        return;
      }

      if (hasRendered && lastSuccess) {
        config.refreshError.textContent =
          `Couldn't refresh ${config.noun}. ${describeFailure(status, message)} Showing what was loaded at ${formatClock(lastSuccess)}.`;
        config.refreshError.hidden = false;
        return;
      }

      config.errorText.textContent = describeFailure(status, message);
      show(config.error);
      config.retry.hidden = stopped;
      if (status === 401) {
        replaceWithSignInLink(config.retry);
      }
      config.live.textContent = `Couldn't load ${config.noun}. ${config.errorText.textContent}`;
    }

    function show(visible: HTMLElement): void {
      for (const element of [config.loading, config.error, ...(config.forbidden ? [config.forbidden] : []), ...config.content]) {
        element.hidden = element !== visible;
      }
    }

    return { load, loadedAt: () => loadedAt };
  }

  function mountActivityCharts(target: Widget[]): void {
    const cards = document.querySelectorAll<HTMLElement>("[data-activity-card]");
    const redraws: Array<() => void> = [];

    cards.forEach((card) => {
      const series = card.dataset.series ?? "";
      const summary = part<HTMLElement>(card, "summary");
      const chartWrap = part<HTMLElement>(card, "chart");
      const canvas = part<HTMLCanvasElement>(card, "canvas");
      const live = part<HTMLElement>(card, "live");
      const forbidden = part<HTMLElement>(card, "forbidden");
      let chartKind: ChartKind = "bar";
      let chart: CmsChart | null = null;
      let latest: ActivityResponse | null = null;

      function selectedRange(): ActivityRange {
        const active = card.querySelector<HTMLButtonElement>("[data-range].is-active");
        const range = active?.dataset.range;
        if (range === "last_week" || range === "last_30_days") {
          return range;
        }
        return "current_week";
      }

      function draw(): void {
        if (!latest || chartWrap.hidden || typeof Chart === "undefined") {
          return;
        }
        chart?.destroy();
        const dark = document.documentElement.getAttribute("data-theme") === "dark";
        const tick = dark ? "#a1a1aa" : "#71717a";
        const grid = dark ? "rgba(255,255,255,0.08)" : "rgba(24,24,27,0.06)";
        const counts = latest.data.map((point) => point.count);
        const highest = counts.reduce((max, count) => Math.max(max, count), 0);
        chart = new Chart(canvas, {
          type: chartKind,
          data: {
            labels: latest.data.map((point) => point.label),
            datasets: [chartDataset(chartKind, latest.meta.series_label, counts)],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            interaction: { intersect: false, mode: "index" },
            scales: {
              y: {
                beginAtZero: true,
                suggestedMax: highest === 0 ? 4 : undefined,
                grid: { color: grid, drawBorder: false },
                ticks: {
                  color: tick,
                  precision: 0,
                  font: { family: "Inter", size: 11 },
                },
              },
              x: {
                grid: { display: false, drawBorder: false },
                ticks: {
                  color: tick,
                  maxRotation: counts.length > 10 ? 45 : 0,
                  autoSkip: true,
                  maxTicksLimit: counts.length > 10 ? 8 : counts.length,
                  font: { family: "Inter", size: 11 },
                },
              },
            },
          },
        });
      }

      const widget = createWidget<ActivityResponse>({
        path: () => `/dashboard/activity?series=${encodeURIComponent(series)}&range=${selectedRange()}`,
        card,
        noun: "activity",
        loading: part(card, "loading"),
        error: part(card, "error"),
        errorText: part(card, "error-text"),
        retry: part(card, "retry"),
        forbidden,
        refreshError: part(card, "refresh-error"),
        content: [chartWrap],
        live,
        isValid: isActivityResponse,
        render(response, announce) {
          latest = response;
          const events = response.meta.total === 1 ? "event" : "events";
          summary.textContent = `${response.meta.total} ${events} · ${response.meta.range_label}`;
          chartWrap.hidden = false;
          window.requestAnimationFrame(draw);
          if (announce) {
            live.textContent = `${response.meta.series_label}: ${response.meta.total} ${events} for ${response.meta.range_label.toLowerCase()}.`;
          }
        },
      });

      card.querySelectorAll<HTMLButtonElement>("[data-range]").forEach((button) => {
        button.addEventListener("click", () => {
          if (!forbidden.hidden || button.classList.contains("is-active")) {
            return;
          }
          card.querySelectorAll<HTMLButtonElement>("[data-range]").forEach((other) => {
            const active = other === button;
            other.classList.toggle("is-active", active);
            other.setAttribute("aria-pressed", active ? "true" : "false");
          });
          void widget.load(true);
        });
      });

      card.querySelectorAll<HTMLButtonElement>("[data-chart-type]").forEach((button) => {
        button.addEventListener("click", () => {
          const kind = button.dataset.chartType;
          if ((kind !== "bar" && kind !== "line") || kind === chartKind) {
            return;
          }
          chartKind = kind;
          card.querySelectorAll<HTMLButtonElement>("[data-chart-type]").forEach((other) => {
            const active = other === button;
            other.classList.toggle("is-active", active);
            other.setAttribute("aria-pressed", active ? "true" : "false");
          });
          draw();
        });
      });

      redraws.push(draw);
      target.push(widget);
    });

    if (redraws.length > 0) {
      new MutationObserver(() => {
        for (const redraw of redraws) {
          redraw();
        }
      }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    }
  }

  function chartDataset(kind: ChartKind, label: string, counts: number[]): object {
    if (kind === "line") {
      return {
        label,
        data: counts,
        tension: 0.35,
        borderWidth: 3,
        borderColor: "#f97316",
        backgroundColor: "rgba(249, 115, 22, 0.15)",
        pointRadius: 3,
        pointBackgroundColor: "#f97316",
        fill: true,
      };
    }
    return {
      label,
      data: counts,
      borderWidth: 0,
      borderRadius: 6,
      backgroundColor: "#f97316",
      maxBarThickness: 28,
    };
  }

  function renderSystems(response: SystemsResponse, announce: boolean): void {
    const timeZone = safeTimeZone(response.meta.timezone);
    const generatedAt = new Date(response.meta.generated_at);
    const systems = response.data;

    systemsRows.replaceChildren(...systems.map((system) => buildSystemRow(system, timeZone, generatedAt)));
    systemsEmpty.hidden = systems.length !== 0;
    systemsTable.hidden = systems.length === 0;

    const counts: Record<StatusState, number> = { up: 0, down: 0, unknown: 0 };
    let stale = 0;
    for (const system of systems) {
      counts[system.status.state] += 1;
      if (system.status.is_stale) stale += 1;
    }

    const noun = systems.length === 1 ? "production system" : "production systems";
    const parts = [`${counts.up} up`, `${counts.down} down`];
    if (counts.unknown > 0) parts.push(`${counts.unknown} unknown`);
    if (stale > 0) parts.push(`${stale} stale`);

    systemsSummary.replaceChildren();
    const total = document.createElement("span");
    total.className = "font-weight-bold";
    total.textContent = `${systems.length} ${noun}`;
    systemsSummary.append(total, systems.length === 0 ? " configured" : ` · ${parts.join(" · ")}`);

    systemsUpdated.textContent = `Updated ${formatTime(generatedAt, timeZone)}`;
    systemsUpdated.title = `Results are refreshed every minute. Each system is re-checked about every ${response.meta.check_interval_minutes} minutes. Times are in ${timeZone ?? "your local time"}.`;

    if (announce) {
      byId<HTMLElement>("dashboard-systems-live").textContent = systems.length === 0
        ? "No production systems are configured."
        : `${systems.length} ${noun}: ${parts.join(", ")}.`;
    }
  }

  function buildSystemRow(system: DashboardSystem, timeZone: string | undefined, generatedAt: Date): HTMLTableRowElement {
    const fragment = systemRowTemplate.content.cloneNode(true) as DocumentFragment;
    const row = fragment.querySelector("tr") as HTMLTableRowElement;
    const { status } = system;

    field(row, "name").textContent = system.name;
    fillAddress(field(row, "domain"), system.domain, system.domain_hidden);
    fillAddress(field(row, "ip"), system.ip_address, system.ip_address_hidden);

    const badge = field(row, "status");
    badge.classList.add(`is-${status.state}`);
    badge.textContent = STATUS_LABELS[status.state];

    const staleBadge = field(row, "stale");
    staleBadge.hidden = !status.is_stale;

    const checked = field(row, "checked");
    const detail = field(row, "detail");
    if (status.checked_at) {
      const checkedAt = new Date(status.checked_at);
      checked.textContent = `${status.is_stale ? "Last checked" : "Checked"} ${formatCheckedAt(checkedAt, generatedAt, timeZone)}`;
      checked.title = formatTime(checkedAt, timeZone);
      detail.textContent = status.state === "up" && status.http_status !== null
        ? `HTTP ${status.http_status}${status.response_time_ms !== null ? ` · ${status.response_time_ms} ms` : ""}`
        : status.reason ?? "";
    } else {
      checked.textContent = status.reason ?? NOT_CHECKED;
      detail.hidden = true;
    }

    const explanations = [`${STATUS_LABELS[status.state]}: ${status.reason ?? NOT_CHECKED}`];
    if (status.is_stale) {
      explanations.push("The scheduled re-check is overdue, so this result may be out of date.");
    }
    if (status.state === "up") {
      explanations.push("Up only means the web address answered. It doesn't confirm the system works correctly.");
    }
    field(row, "status-cell").title = explanations.join(" ");
    return row;
  }

  function fillAddress(cell: HTMLElement, value: string | null, hidden: boolean): void {
    if (value) {
      cell.textContent = value;
      cell.title = value;
      return;
    }
    const badge = document.createElement("span");
    badge.className = "systems-na";
    if (hidden) {
      badge.textContent = "Hidden";
      badge.title = "Only administrators can see private addresses.";
    } else {
      badge.textContent = "N/A";
      badge.setAttribute("aria-label", "Not available");
    }
    cell.replaceWith(badge);
  }

  function renderSignIns(response: SignInsResponse, announce: boolean): void {
    const timeZone = safeTimeZone(response.meta.timezone);
    const items = response.data.map((signIn) => {
      const fragment = signInTemplate.content.cloneNode(true) as DocumentFragment;
      const block = fragment.querySelector(".timeline-block") as HTMLElement;
      field(block, "name").textContent = signIn.name;
      const time = field(block, "time");
      time.textContent = formatTime(new Date(signIn.signed_in_at), timeZone);
      time.setAttribute("datetime", signIn.signed_in_at);
      return block;
    });
    items[items.length - 1]?.classList.remove("mb-3");

    signInsList.replaceChildren(...items);
    signInsList.hidden = items.length === 0;
    signInsEmpty.hidden = items.length !== 0;
    signInsTimezone.textContent = timeZone ? `Times in ${timeZone}.` : "";

    if (announce) {
      byId<HTMLElement>("dashboard-sign-ins-live").textContent = items.length === 0
        ? "No sign-ins recorded yet."
        : `${items.length} recent sign-ins loaded.`;
    }
  }

  function describeFailure(status: number, message: string | null): string {
    if (status === 401) return `${message ?? "Your session has ended."} Sign in again to continue.`;
    if (status === 403) return "Your account isn't allowed to view this.";
    if (status === 429) return "Too many requests. It will try again in a minute.";
    if (status === -1) return "The server took too long to respond.";
    if (status === 0) return "Couldn't connect to the server. Check your connection.";
    return `Something went wrong on the server (Error ${status}).`;
  }

  function replaceWithSignInLink(button: HTMLButtonElement): void {
    const link = document.createElement("a");
    link.href = signInUrl;
    link.className = button.className;
    link.textContent = "Go to sign in";
    button.replaceWith(link);
  }

  /** Falls back to the browser's zone if the server sends a zone this browser doesn't know. */
  function safeTimeZone(timeZone: string): string | undefined {
    try {
      new Intl.DateTimeFormat(undefined, { timeZone });
      return timeZone;
    } catch {
      return undefined;
    }
  }

  function formatTime(date: Date, timeZone: string | undefined): string {
    return date.toLocaleString(undefined, { timeZone, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function formatClock(date: Date): string {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  /** Shows only the time for checks made on the same day as the server's response, otherwise the date too. */
  function formatCheckedAt(date: Date, reference: Date, timeZone: string | undefined): string {
    const day = (value: Date) => value.toLocaleDateString("en-CA", { timeZone });
    return day(date) === day(reference)
      ? date.toLocaleTimeString(undefined, { timeZone, hour: "numeric", minute: "2-digit" })
      : date.toLocaleString(undefined, { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function field(root: ParentNode, name: string): HTMLElement {
    const element = root.querySelector<HTMLElement>(`[data-field="${name}"]`);
    if (!element) {
      throw new Error(`Missing [data-field="${name}"]`);
    }
    return element;
  }

  function isSystemsResponse(value: unknown): value is SystemsResponse {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Partial<SystemsResponse>;
    return Array.isArray(candidate.data) && typeof candidate.meta === "object" && candidate.meta !== null;
  }

  function isSignInsResponse(value: unknown): value is SignInsResponse {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Partial<SignInsResponse>;
    return Array.isArray(candidate.data) && typeof candidate.meta === "object" && candidate.meta !== null;
  }

  function isActivityResponse(value: unknown): value is ActivityResponse {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Partial<ActivityResponse>;
    if (!Array.isArray(candidate.data) || typeof candidate.meta !== "object" || candidate.meta === null) {
      return false;
    }
    if (typeof candidate.meta.total !== "number" || typeof candidate.meta.range_label !== "string" || typeof candidate.meta.series_label !== "string") {
      return false;
    }
    return candidate.data.every((point) => {
      if (typeof point !== "object" || point === null) return false;
      const item = point as Partial<ActivityPoint>;
      return typeof item.date === "string" && typeof item.label === "string" && typeof item.count === "number";
    });
  }

  function part<T extends HTMLElement>(root: ParentNode, name: string): T {
    const element = root.querySelector<T>(`[data-part="${name}"]`);
    if (!element) {
      throw new Error(`Missing [data-part="${name}"]`);
    }
    return element;
  }

  function byId<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Missing #${id}`);
    }
    return element as T;
  }

  async function readJson(response: Response): Promise<unknown> {
    const text = await response.text();
    if (text === "") return {};
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return {};
    }
  }
})();
