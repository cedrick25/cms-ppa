(() => {
  type Environment = "production" | "test" | "legacy";
  type EnvironmentFilter = "all" | Environment;
  type RemoteType = "anydesk" | "rustdesk" | "rdp" | "ssh";

  interface RemoteAccess {
    type: RemoteType;
    label: string;
    value: string;
    address: string;
    username: string | null;
  }

  type LinkHelper = "ssh" | "rdp";

  interface SshTarget {
    href: string;
    command: string;
  }

  interface SystemSummary {
    id: number;
    name: string;
    description: string | null;
    environment: Environment | null;
    remote_access: RemoteAccess[];
    local_ip: string | null;
    mysql_host: string | null;
    domain: string | null;
    vm_host: string | null;
    created_at: string | null;
    updated_at: string | null;
  }

  type SystemDetail = { id: number; created_at: string | null; updated_at: string | null } & Record<FormField, string | null>;

  interface ListResponse {
    data: SystemSummary[];
    meta: {
      current_page: number;
      last_page: number;
      per_page: number;
      total: number;
      from: number | null;
      to: number | null;
      total_registered: number;
    };
    counts: Record<EnvironmentFilter, number>;
  }

  interface ApiPayload {
    message?: string;
    errors?: Record<string, string[]>;
    system?: SystemDetail;
  }

  interface SendResult {
    status: number;
    payload: ApiPayload;
  }

  const REQUEST_TIMEOUT_MS = 20000;
  /** Must match the length of the .timed-alert animation in auth-theme.css. */
  const TIMED_ALERT_MS = 3000;
  const SEARCH_DELAY_MS = 300;
  const LAUNCH_TOAST_MS = 8000;
  const COPIED_RESET_MS = 1500;
  const NAME_MAX = 100;
  /** Remembers, per browser, which link helpers are installed (see assets/downloads). */
  const LINK_SETTING_KEYS: Record<LinkHelper, string> = { ssh: "cms-ppa-ssh-links", rdp: "cms-ppa-rdp-links" };
  /** Must match the scheme registered by assets/downloads/install-rdp-link-handler.ps1. */
  const RDP_SCHEME = "cms-ppa-rdp";
  const ANYDESK_ID = /^(?:\d{6,12}|[A-Za-z0-9._-]+@[A-Za-z0-9._-]+)$/;
  const RUSTDESK_ID = /^[A-Za-z0-9_-]{6,32}$/;
  const HOST_AND_PORT = /^([A-Za-z0-9][A-Za-z0-9.-]{0,252})(?::(\d{1,5}))?$/;
  const SSH_USERNAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
  const RDP_USERNAME = /^[^\u0000-\u001f\u007f]{1,100}$/;
  const IS_MAC = /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints === 0;
  const TERMINAL_NAME = IS_MAC ? "Terminal" : "PowerShell";
  const COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V6a2 2 0 0 1 2-2h9"></path></svg>';
  const COPIED_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>';
  const ENVIRONMENTS: Record<Environment, string> = { production: "Production", test: "Test", legacy: "Legacy" };
  const FILTERS: EnvironmentFilter[] = ["all", "production", "test", "legacy"];
  const SECRET_FIELDS = [
    "anydesk_password", "rustdesk_password", "rdp_password", "ssh_password",
    "local_password", "mysql_password", "domain_password", "vm_password",
  ] as const;
  const FORM_FIELDS = [
    "name", "environment", "description",
    "anydesk_id", "anydesk_password", "rustdesk_id", "rustdesk_password",
    "rdp_host", "rdp_username", "rdp_password", "ssh_host", "ssh_username", "ssh_password",
    "local_ip", "local_username", "local_password", "mysql_host", "mysql_username", "mysql_password",
    "domain", "domain_username", "domain_password", "vm_host", "vm_username", "vm_password",
    "notes",
  ] as const;
  type FormField = (typeof FORM_FIELDS)[number];
  const PASSWORD_FIELDS: Record<RemoteType, FormField> = {
    anydesk: "anydesk_password",
    rustdesk: "rustdesk_password",
    rdp: "rdp_password",
    ssh: "ssh_password",
  };
  type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

  const appElement = document.getElementById("systems-app");
  const api = window.CmsApi;
  if (!(appElement instanceof HTMLElement) || typeof bootstrap === "undefined" || !api || !api.token()) {
    return;
  }
  const app = appElement;
  const cmsApi = api;

  const baseUrl = cmsApi.url("/systems");
  const signInUrl = app.dataset.signInUrl ?? "sign-in.html";

  const heading = byId<HTMLElement>("systems-heading");
  const createButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-action='create']"));
  const searchForm = byId<HTMLFormElement>("systems-search-form");
  const searchInput = byId<HTMLInputElement>("systems-search");
  const filterButtons = Array.from(app.querySelectorAll<HTMLButtonElement>("[data-environment]"));
  const successBox = byId<HTMLElement>("systems-success");
  const errorBox = byId<HTMLElement>("systems-error");
  const live = byId<HTMLElement>("systems-live");
  const loadingState = byId<HTMLElement>("systems-loading");
  const emptyState = byId<HTMLElement>("systems-empty");
  const noMatchState = byId<HTMLElement>("systems-no-match");
  const noMatchText = byId<HTMLElement>("systems-no-match-text");
  const loadErrorState = byId<HTMLElement>("systems-load-error");
  const loadErrorText = byId<HTMLElement>("systems-load-error-text");
  const tableWrap = byId<HTMLElement>("systems-table-wrap");
  const rowsBody = byId<HTMLTableSectionElement>("systems-rows");
  const rowTemplate = byId<HTMLTemplateElement>("systems-row-template");
  const pagination = byId<HTMLElement>("systems-pagination");
  const rangeText = byId<HTMLElement>("systems-range");
  const prevButton = byId<HTMLButtonElement>("systems-prev");
  const nextButton = byId<HTMLButtonElement>("systems-next");

  const formModal = byId<HTMLElement>("system-form-modal");
  const form = byId<HTMLFormElement>("system-form");
  const formTitle = byId<HTMLElement>("system-form-title");
  const formAlert = byId<HTMLElement>("system-form-alert");
  const formFields = byId<HTMLFieldSetElement>("system-form-fields");
  const formMeta = byId<HTMLElement>("system-form-meta");
  const formLoading = byId<HTMLElement>("system-form-loading");
  const formLoadError = byId<HTMLElement>("system-form-load-error");
  const formLoadErrorText = byId<HTMLElement>("system-form-load-error-text");
  const formRetry = byId<HTMLButtonElement>("system-form-retry");
  const formSubmit = byId<HTMLButtonElement>("system-form-submit");
  const inputs = {} as Record<FormField, FormControl>;
  for (const name of FORM_FIELDS) {
    inputs[name] = byId<FormControl>(`system-${name}`);
  }

  const removeModal = byId<HTMLElement>("system-remove-modal");
  const removeForm = byId<HTMLFormElement>("system-remove-form");
  const removeAlert = byId<HTMLElement>("system-remove-alert");
  const removeCancel = byId<HTMLButtonElement>("system-remove-cancel");

  const setupModals: Record<LinkHelper, HTMLElement> = {
    ssh: byId<HTMLElement>("systems-ssh-setup-modal"),
    rdp: byId<HTMLElement>("systems-rdp-setup-modal"),
  };
  const linkToggles: Record<LinkHelper, HTMLInputElement> = {
    ssh: byId<HTMLInputElement>("systems-ssh-links-toggle"),
    rdp: byId<HTMLInputElement>("systems-rdp-links-toggle"),
  };
  const toastContainer = byId<HTMLElement>("systems-toast-container");
  const toast = byId<HTMLElement>("systems-toast");
  const toastTag = byId<HTMLElement>("systems-toast-tag");
  const toastTitle = byId<HTMLElement>("systems-toast-title");
  const toastMessage = byId<HTMLElement>("systems-toast-message");
  const toastPassword = byId<HTMLButtonElement>("systems-toast-password");
  const toastSetup = byId<HTMLButtonElement>("systems-toast-setup");
  const toastStatus = byId<HTMLElement>("systems-toast-status");

  const query = new URLSearchParams(window.location.search);
  const state = {
    search: (query.get("search") ?? "").slice(0, 100),
    environment: parseFilter(query.get("environment")),
    page: Math.max(1, Number.parseInt(query.get("page") ?? "1", 10) || 1),
  };

  const records = new Map<number, SystemSummary>();
  let listController: AbortController | null = null;
  let detailController: AbortController | null = null;
  let hasRendered = false;
  let searchTimer = 0;
  let successTimer = 0;
  let editing: SystemSummary | null = null;
  let removing: SystemSummary | null = null;
  let busyModal: HTMLElement | null = null;
  let focusAfterClose: HTMLElement | null = null;
  let formShown = false;
  let toastTarget: { system: SystemSummary; entry: RemoteAccess } | null = null;
  let toastTrigger: HTMLElement | null = null;

  document.body.append(toastContainer);
  for (const modal of [formModal, removeModal, setupModals.ssh, setupModals.rdp]) {
    document.body.append(modal);
    modal.addEventListener("hide.bs.modal", (event) => {
      if (busyModal === modal) {
        event.preventDefault();
      }
    });
    modal.addEventListener("hidden.bs.modal", () => {
      const target = focusAfterClose && focusAfterClose.isConnected ? focusAfterClose : heading;
      focusAfterClose = null;
      target.focus();
    });
  }
  formModal.addEventListener("shown.bs.modal", () => {
    formShown = true;
    focusFormSection();
  });
  formModal.addEventListener("hidden.bs.modal", () => {
    formShown = false;
    detailController?.abort();
    detailController = null;
    editing = null;
    clearSecrets();
  });
  removeModal.addEventListener("hidden.bs.modal", () => {
    removing = null;
  });

  searchInput.value = state.search;
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
      const environment = parseFilter(button.dataset.environment ?? null);
      if (environment === state.environment) {
        return;
      }
      state.environment = environment;
      state.page = 1;
      updateFilterButtons();
      void load();
    });
  }

  byId<HTMLButtonElement>("systems-clear").addEventListener("click", () => {
    searchInput.value = "";
    state.search = "";
    state.environment = "all";
    state.page = 1;
    updateFilterButtons();
    void load();
    searchInput.focus();
  });
  byId<HTMLButtonElement>("systems-retry").addEventListener("click", () => void load());
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

  for (const box of [successBox, errorBox]) {
    box.querySelector(".users-feedback-close")?.addEventListener("click", () => {
      hideFeedback();
      heading.focus();
    });
  }

  for (const button of createButtons) {
    button.addEventListener("click", () => openCreate(button));
  }

  rowsBody.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const remoteControl = target.closest<HTMLElement>("[data-remote-action]");
    if (remoteControl) {
      handleRemoteAction(remoteControl, event);
      return;
    }
    const button = target.closest<HTMLButtonElement>("button[data-row-action]");
    const row = button?.closest<HTMLTableRowElement>("tr[data-system-id]");
    const record = row ? records.get(Number(row.dataset.systemId)) : undefined;
    if (!button || !record) {
      return;
    }
    if (button.dataset.rowAction === "edit") {
      openEdit(record, button);
    } else if (button.dataset.rowAction === "remove") {
      openRemove(record, button);
    }
  });

  for (const toggle of Array.from(formModal.querySelectorAll<HTMLButtonElement>(".password-toggle"))) {
    toggle.addEventListener("click", () => {
      const input = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
      if (input instanceof HTMLInputElement) {
        setSecretVisible(toggle, input, input.type === "password");
      }
    });
  }

  inputs.name.addEventListener("input", () => {
    if (inputs.name.classList.contains("is-invalid")) {
      setFieldError("name", validateName());
    }
  });
  for (const name of FORM_FIELDS) {
    if (name !== "name") {
      inputs[name].addEventListener("input", () => setFieldError(name, null));
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitForm();
  });
  formRetry.addEventListener("click", () => {
    if (editing) {
      void loadDetails(editing);
    }
  });
  removeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitRemove();
  });

  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-action='link-setup']"))) {
    button.addEventListener("click", () => {
      const trigger = button === toastSetup ? toastTrigger : button;
      bootstrap.Toast.getOrCreateInstance(toast).hide();
      openLinkSetup(button.dataset.setup === "rdp" ? "rdp" : "ssh", trigger ?? button);
    });
  }
  linkToggles.ssh.addEventListener("change", () => {
    writeSetting(LINK_SETTING_KEYS.ssh, linkToggles.ssh.checked ? "on" : "off");
    live.textContent = linkToggles.ssh.checked
      ? `SSH entries now open ${TERMINAL_NAME}.`
      : "SSH entries now copy the ssh command instead of opening it.";
  });
  linkToggles.rdp.addEventListener("change", () => {
    writeSetting(LINK_SETTING_KEYS.rdp, linkToggles.rdp.checked ? "on" : "off");
    live.textContent = linkToggles.rdp.checked
      ? "RDP entries now open Remote Desktop."
      : "RDP entries now copy the host instead of opening Remote Desktop.";
  });
  toastPassword.addEventListener("click", () => void copyToastPassword());

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

  async function load(): Promise<void> {
    listController?.abort();
    const controller = new AbortController();
    listController = controller;
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    const params = new URLSearchParams();
    if (state.search !== "") params.set("search", state.search);
    if (state.environment !== "all") params.set("environment", state.environment);
    if (state.page > 1) params.set("page", String(state.page));
    const queryString = params.toString();
    window.history.replaceState(null, "", queryString === "" ? window.location.pathname : `?${queryString}`);

    showLoading();

    try {
      const response = await fetch(queryString === "" ? baseUrl : `${baseUrl}?${queryString}`, {
        signal: controller.signal,
        headers: cmsApi.headers(),
      });
      const payload = await readJson(response);
      if (controller !== listController) {
        return;
      }
      if (!response.ok || !isListResponse(payload)) {
        showLoadError(response.status, payload as ApiPayload);
        return;
      }
      if (payload.data.length === 0 && state.page > 1 && state.page > payload.meta.last_page) {
        state.page = Math.max(1, payload.meta.last_page);
        void load();
        return;
      }
      render(payload);
    } catch {
      if (controller !== listController) {
        return;
      }
      showLoadError(timedOut ? -1 : 0, {});
    } finally {
      window.clearTimeout(timer);
      if (controller === listController) {
        app.removeAttribute("aria-busy");
        tableWrap.classList.remove("is-loading");
        setCreateDisabled(false);
      }
    }
  }

  function showLoading(): void {
    app.setAttribute("aria-busy", "true");
    loadErrorState.hidden = true;
    setCreateDisabled(true);
    if (hasRendered && !tableWrap.hidden) {
      tableWrap.classList.add("is-loading");
      live.textContent = "Loading systems…";
      return;
    }
    emptyState.hidden = true;
    noMatchState.hidden = true;
    tableWrap.hidden = true;
    pagination.hidden = true;
    loadingState.hidden = false;
  }

  function render(response: ListResponse): void {
    hasRendered = true;
    loadingState.hidden = true;
    loadErrorState.hidden = true;

    for (const filter of FILTERS) {
      const count = app.querySelector(`[data-count="${filter}"]`);
      if (count) {
        count.textContent = String(response.counts[filter] ?? 0);
      }
    }

    records.clear();
    rowsBody.replaceChildren();

    const { meta } = response;
    emptyState.hidden = meta.total_registered !== 0;
    noMatchState.hidden = meta.total_registered === 0 || response.data.length > 0;
    tableWrap.hidden = response.data.length === 0;
    pagination.hidden = response.data.length === 0 || meta.last_page <= 1;

    if (meta.total_registered === 0) {
      live.textContent = "No systems registered yet.";
      return;
    }
    if (response.data.length === 0) {
      noMatchText.textContent = describeNoMatch();
      live.textContent = "No systems match the current search or filter.";
      return;
    }

    for (const system of response.data) {
      records.set(system.id, system);
      rowsBody.append(buildRow(system));
    }

    const noun = meta.total === 1 ? "system" : "systems";
    rangeText.textContent = `Showing ${meta.from ?? 0}–${meta.to ?? 0} of ${meta.total} ${noun}`;
    prevButton.disabled = meta.current_page <= 1;
    nextButton.disabled = meta.current_page >= meta.last_page;
    live.textContent = `${meta.total} ${noun} found.`;
  }

  function buildRow(system: SystemSummary): HTMLTableRowElement {
    const fragment = rowTemplate.content.cloneNode(true) as DocumentFragment;
    const row = fragment.querySelector("tr") as HTMLTableRowElement;
    row.dataset.systemId = String(system.id);

    setText(row, "name", system.name);
    const description = row.querySelector<HTMLElement>('[data-field="description"]');
    if (description) {
      description.textContent = system.description ?? "";
      description.hidden = !system.description;
    }
    const environment = row.querySelector<HTMLElement>('[data-field="environment"]');
    if (environment) {
      applyEnvironmentBadge(environment, system.environment);
    }

    const remote = row.querySelector<HTMLElement>('[data-field="remote"]');
    if (remote) {
      if (system.remote_access.length === 0) {
        remote.replaceWith(notAvailable());
      } else {
        system.remote_access.forEach((entry, index) => remote.append(buildRemoteItem(system, entry, index)));
      }
    }

    for (const field of ["local_ip", "mysql_host", "domain", "vm_host"] as const) {
      const cell = row.querySelector<HTMLElement>(`[data-field="${field}"]`);
      const value = system[field];
      if (!cell) continue;
      if (value) {
        setBreakableText(cell, value);
        cell.title = value;
      } else {
        cell.replaceWith(notAvailable());
      }
    }

    row.querySelector('[data-row-action="edit"]')?.setAttribute("aria-label", `View or update ${system.name}`);
    row.querySelector('[data-row-action="remove"]')?.setAttribute("aria-label", `Remove ${system.name}`);
    return row;
  }

  function buildRemoteItem(system: SystemSummary, entry: RemoteAccess, index: number): HTMLLIElement {
    const item = document.createElement("li");
    item.className = "systems-remote-item";
    item.dataset.remoteIndex = String(index);

    const href = launchHref(entry);
    let control: HTMLElement;
    if (href) {
      const link = document.createElement("a");
      link.href = href;
      control = link;
    } else {
      control = document.createElement("span");
    }
    control.className = href ? "systems-remote-launch" : "systems-remote-static";

    const tag = document.createElement("span");
    tag.className = `systems-remote-tag is-${entry.type}`;
    tag.textContent = entry.label;
    const value = document.createElement("span");
    value.className = "systems-mono";
    value.textContent = entry.value;
    control.append(tag, value);

    if (href) {
      control.dataset.remoteAction = "launch";
      control.setAttribute("aria-label", launchLabel(system, entry));
      control.title = launchHint(entry);
    } else {
      value.title = entry.value;
    }

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "systems-remote-copy";
    copy.dataset.remoteAction = "copy";
    copy.setAttribute("aria-label", `${copyLabel(entry)} for ${system.name}`);
    copy.title = copyLabel(entry);
    copy.innerHTML = COPY_ICON;

    item.append(control, copy);
    return item;
  }

  function recordRemoteDeskOpen(system: SystemSummary, entry: RemoteAccess): void {
    void fetch(cmsApi.url(`/systems/${system.id}/remote-desks`), {
      method: "POST",
      headers: cmsApi.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ type: entry.type }),
      keepalive: true,
    }).catch(() => undefined);
  }

  function handleRemoteAction(control: HTMLElement, event: MouseEvent): void {
    const row = control.closest<HTMLElement>("tr[data-system-id]");
    const system = row ? records.get(Number(row.dataset.systemId)) : undefined;
    const index = Number(control.closest<HTMLElement>("[data-remote-index]")?.dataset.remoteIndex);
    const entry = system?.remote_access[index];
    if (!system || !entry) {
      return;
    }
    if (control.dataset.remoteAction === "copy") {
      void copyRemote(control as HTMLButtonElement, entry);
      return;
    }

    if (!launchHref(entry)) {
      return;
    }
    recordRemoteDeskOpen(system, entry);
    toastTrigger = control;

    if (entry.type === "rdp") {
      const address = entry.address.trim();
      const username = entry.username?.trim();
      const signIn = username ? ` and sign in as ${username}` : "";
      const rdpLinksEnabled = linksEnabled("rdp");
      if (!rdpLinksEnabled) {
        event.preventDefault();
      }
      void copyText(address).then((copied) => {
        if (rdpLinksEnabled) {
          showLaunchToast(system, entry, "Opening Remote Desktop",
            `Connecting to ${address}${username ? ` as ${username}` : ""}. Remote Desktop asks for the password when it connects.${copied ? " The host is also copied." : ""}`);
          return;
        }
        const setupHint = IS_MAC ? "" : " Set up one-click RDP to open Remote Desktop for you.";
        showLaunchToast(system, entry, copied ? "RDP host copied" : "RDP host",
          copied
            ? `Paste ${address} into Remote Desktop Connection${signIn}.${setupHint}`
            : `Enter ${address} in Remote Desktop Connection${signIn}.${setupHint}`,
          IS_MAC ? null : "rdp");
      });
      return;
    }

    if (entry.type !== "ssh") {
      showLaunchToast(system, entry, `Opening ${entry.label}`,
        `Connecting to ${entry.value}. If ${entry.label} doesn't open, check that it's installed on this computer.`);
      return;
    }

    const ssh = sshTarget(entry) as SshTarget;
    const sshLinksEnabled = linksEnabled("ssh");
    if (!sshLinksEnabled) {
      event.preventDefault();
    }
    void copyText(ssh.command).then((copied) => {
      if (sshLinksEnabled) {
        showLaunchToast(system, entry, `Opening ${TERMINAL_NAME}`,
          `Connecting with ${ssh.command}. ssh asks for the password in the ${TERMINAL_NAME} window.${copied ? " The command is also copied." : ""}`);
      } else {
        showLaunchToast(system, entry, copied ? "SSH command copied" : "SSH command",
          copied
            ? `Paste ${ssh.command} into ${TERMINAL_NAME} to connect. Set up one-click SSH to open ${TERMINAL_NAME} for you.`
            : `Run ${ssh.command} in ${TERMINAL_NAME} to connect. Set up one-click SSH to open ${TERMINAL_NAME} for you.`,
          "ssh");
      }
    });
  }

  function launchHref(entry: RemoteAccess): string | null {
    if (entry.type === "anydesk" || entry.type === "rustdesk") {
      const id = entry.address.replace(/\s+/g, "");
      if (entry.type === "anydesk") {
        return ANYDESK_ID.test(id) ? `anydesk:${id}` : null;
      }
      return RUSTDESK_ID.test(id) ? `rustdesk://connection/new/${id}` : null;
    }
    if (entry.type === "ssh") {
      return sshTarget(entry)?.href ?? null;
    }
    return rdpHref(entry);
  }

  /** The link must stay within the pattern the installed RDP helper accepts. */
  function rdpHref(entry: RemoteAccess): string | null {
    const address = entry.address.trim();
    const match = HOST_AND_PORT.exec(address);
    if (!match) {
      return null;
    }
    const port = match[2];
    if (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) {
      return null;
    }
    const username = entry.username?.trim() ?? "";
    const userPart = RDP_USERNAME.test(username) ? `${encodeURIComponent(username)}@` : "";
    return `${RDP_SCHEME}://${userPart}${address}`;
  }

  function sshTarget(entry: RemoteAccess): SshTarget | null {
    const match = HOST_AND_PORT.exec(entry.address.trim());
    const username = entry.username?.trim() ?? "";
    if (!match || (username !== "" && !SSH_USERNAME.test(username))) {
      return null;
    }
    const [, host, port] = match;
    if (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) {
      return null;
    }
    const target = username !== "" ? `${username}@${host}` : host;
    return {
      href: `ssh://${target}${port ? `:${port}` : ""}`,
      command: `ssh ${port ? `-p ${port} ` : ""}${target}`,
    };
  }

  function launchLabel(system: SystemSummary, entry: RemoteAccess): string {
    if (entry.type === "rdp") return `Open Remote Desktop to ${system.name} (${entry.value})`;
    if (entry.type === "ssh") return `Open SSH to ${system.name} in ${TERMINAL_NAME} (${entry.value})`;
    return `Connect to ${system.name} with ${entry.label} (${entry.value})`;
  }

  function launchHint(entry: RemoteAccess): string {
    if (entry.type === "rdp") return "Open Remote Desktop Connection";
    if (entry.type === "ssh") return `Connect with SSH in ${TERMINAL_NAME}`;
    return `Open in ${entry.label}`;
  }

  function copyLabel(entry: RemoteAccess): string {
    if (entry.type === "rdp") return "Copy RDP host";
    if (entry.type === "ssh") return sshTarget(entry) ? "Copy SSH command" : "Copy SSH host";
    return `Copy ${entry.label} ID`;
  }

  function copyValue(entry: RemoteAccess): string {
    if (entry.type === "ssh") return sshTarget(entry)?.command ?? entry.value;
    if (entry.type === "rdp") return entry.address.trim();
    const id = entry.address.replace(/\s+/g, "");
    return (entry.type === "anydesk" ? ANYDESK_ID : RUSTDESK_ID).test(id) ? id : entry.address.trim();
  }

  async function copyRemote(button: HTMLButtonElement, entry: RemoteAccess): Promise<void> {
    if (button.classList.contains("is-copied")) {
      return;
    }
    const label = button.getAttribute("aria-label") ?? "";
    const copied = await copyText(copyValue(entry));
    live.textContent = copied
      ? `${copyLabel(entry).replace(/^Copy /, "")} copied.`
      : "Couldn't copy. Select the text and copy it yourself.";
    if (!copied) {
      return;
    }
    button.classList.add("is-copied");
    button.innerHTML = COPIED_ICON;
    button.setAttribute("aria-label", "Copied");
    window.setTimeout(() => {
      button.classList.remove("is-copied");
      button.innerHTML = COPY_ICON;
      button.setAttribute("aria-label", label);
    }, COPIED_RESET_MS);
  }

  function showLaunchToast(system: SystemSummary, entry: RemoteAccess, title: string, message: string, offerSetup: LinkHelper | null = null): void {
    toastTarget = { system, entry };
    toastTag.className = `systems-remote-tag is-${entry.type}`;
    toastTag.textContent = entry.label;
    toastTitle.textContent = title;
    toastMessage.textContent = message;
    toastStatus.textContent = "";
    toastStatus.hidden = true;
    toastPassword.disabled = false;
    setButtonLabel(toastPassword, `Copy ${entry.label} password`);
    toastSetup.hidden = offerSetup === null;
    if (offerSetup !== null) {
      toastSetup.dataset.setup = offerSetup;
      toastSetup.textContent = `Set up one-click ${offerSetup.toUpperCase()}`;
    }
    live.textContent = `${title}. ${message}`;
    bootstrap.Toast.getOrCreateInstance(toast, { delay: LAUNCH_TOAST_MS }).show();
  }

  async function copyToastPassword(): Promise<void> {
    if (!toastTarget || toastPassword.disabled) {
      return;
    }
    const { system, entry } = toastTarget;
    toastPassword.disabled = true;
    setToastStatus("Getting the password…");

    const result = await fetchDetails(system.id);
    if (toastTarget?.system !== system || toastTarget.entry !== entry) {
      return;
    }
    toastPassword.disabled = false;

    if (result.status === 200 && result.payload.system) {
      const password = result.payload.system[PASSWORD_FIELDS[entry.type]];
      if (!password) {
        setToastStatus(`No ${entry.label} password is saved for ${system.name}.`);
      } else if (await copyText(password)) {
        setToastStatus(`${entry.label} password copied. Paste it when you're asked to sign in.`);
      } else {
        setToastStatus("Couldn't copy the password. Open View / Update to see it.");
      }
      return;
    }
    if (result.status === 404) {
      setToastStatus("That system no longer exists. The list has been refreshed.");
      void load();
      return;
    }
    setToastStatus(result.status === -1
      ? "Couldn't get the password. The server took too long to respond. Try again."
      : describeFailure(result.status, result.payload, "Couldn't get the password"));
  }

  function setToastStatus(message: string): void {
    toastStatus.textContent = message;
    toastStatus.hidden = false;
    live.textContent = message;
  }

  async function fetchDetails(systemId: number): Promise<SendResult> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${baseUrl}/${systemId}`, { signal: controller.signal, headers: cmsApi.headers() });
      return { status: response.status, payload: (await readJson(response)) as ApiPayload };
    } catch {
      return { status: timedOut ? -1 : 0, payload: {} };
    } finally {
      window.clearTimeout(timer);
    }
  }

  function openLinkSetup(helper: LinkHelper, trigger: HTMLElement): void {
    focusAfterClose = trigger;
    linkToggles[helper].checked = linksEnabled(helper);
    bootstrap.Modal.getOrCreateInstance(setupModals[helper]).show();
  }

  /** macOS opens ssh:// links in Terminal without a helper; the RDP helper is Windows-only. */
  function linksEnabled(helper: LinkHelper): boolean {
    const stored = readSetting(LINK_SETTING_KEYS[helper]);
    return stored === null ? helper === "ssh" && IS_MAC : stored === "on";
  }

  function readSetting(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeSetting(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Private browsing can block storage; the choice then lasts for this page only.
    }
  }

  async function copyText(text: string): Promise<boolean> {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall back to the selection-based copy below.
      }
    }
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.className = "systems-copy-buffer";
    document.body.append(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    area.remove();
    previousFocus?.focus();
    return copied;
  }

  /** Lets addresses like 192.168.1.38/ppa-bug wrap after "/" or ":" instead of mid-number. */
  function setBreakableText(element: HTMLElement, value: string): void {
    element.replaceChildren();
    for (const part of value.split(/(?<=[/:])/)) {
      if (element.childNodes.length > 0) {
        element.append(document.createElement("wbr"));
      }
      element.append(part);
    }
  }

  function notAvailable(): HTMLElement {
    const element = document.createElement("span");
    element.className = "systems-na";
    element.textContent = "N/A";
    element.setAttribute("aria-label", "Not available");
    return element;
  }

  function showLoadError(status: number, payload: ApiPayload): void {
    loadingState.hidden = true;
    emptyState.hidden = true;
    noMatchState.hidden = true;
    tableWrap.hidden = true;
    pagination.hidden = true;
    loadErrorState.hidden = false;

    if (status === 401) {
      loadErrorText.textContent = payload.message ?? "Your session has ended. Sign in again to manage system credentials.";
      replaceRetryWithSignIn();
    } else if (status === 403) {
      loadErrorText.textContent = "Your account isn't allowed to manage system credentials.";
    } else if (status === -1) {
      loadErrorText.textContent = "The server took too long to respond. Try again.";
    } else if (status === 0) {
      loadErrorText.textContent = "Couldn't connect to the server. Check your connection and try again.";
    } else {
      loadErrorText.textContent = `Something went wrong on the server (Error ${status}). Try again in a moment.`;
    }
    live.textContent = `Couldn't load systems. ${loadErrorText.textContent}`;
  }

  function replaceRetryWithSignIn(): void {
    const retry = document.getElementById("systems-retry");
    if (!retry) {
      return;
    }
    const link = document.createElement("a");
    link.href = signInUrl;
    link.className = retry.className;
    link.textContent = "Go to sign in";
    retry.replaceWith(link);
  }

  function describeNoMatch(): string {
    const parts: string[] = [];
    if (state.search !== "") parts.push(`matching “${state.search}”`);
    if (state.environment !== "all") parts.push(`in ${ENVIRONMENTS[state.environment]}`);
    return parts.length > 0 ? `No systems found ${parts.join(" ")}.` : "Try a different search or filter.";
  }

  function updateFilterButtons(): void {
    for (const button of filterButtons) {
      const active = button.dataset.environment === state.environment;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  function setCreateDisabled(disabled: boolean): void {
    for (const button of createButtons) {
      button.disabled = disabled;
    }
  }

  function openCreate(trigger: HTMLElement): void {
    editing = null;
    focusAfterClose = trigger;
    resetForm();
    formTitle.textContent = "Register system";
    formMeta.hidden = true;
    showFormSection("fields");
    formSubmit.hidden = false;
    formSubmit.disabled = false;
    formSubmit.dataset.busyLabel = "Registering…";
    setButtonLabel(formSubmit, "Register system");
    bootstrap.Modal.getOrCreateInstance(formModal).show();
  }

  function openEdit(system: SystemSummary, trigger: HTMLElement): void {
    editing = system;
    focusAfterClose = trigger;
    resetForm();
    formTitle.textContent = system.name;
    formMeta.hidden = true;
    formSubmit.dataset.busyLabel = "Saving…";
    setButtonLabel(formSubmit, "Save changes");
    bootstrap.Modal.getOrCreateInstance(formModal).show();
    void loadDetails(system);
  }

  async function loadDetails(system: SystemSummary): Promise<void> {
    detailController?.abort();
    const controller = new AbortController();
    detailController = controller;
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    showFormSection("loading");
    formSubmit.hidden = false;
    formSubmit.disabled = true;

    let status: number;
    let payload: ApiPayload;
    try {
      const response = await fetch(`${baseUrl}/${system.id}`, { signal: controller.signal, headers: cmsApi.headers() });
      status = response.status;
      payload = (await readJson(response)) as ApiPayload;
    } catch {
      status = timedOut ? -1 : 0;
      payload = {};
    } finally {
      window.clearTimeout(timer);
    }

    if (controller !== detailController || editing !== system) {
      return;
    }
    detailController = null;

    if (status === 200 && payload.system) {
      fillForm(payload.system);
      showFormSection("fields");
      formSubmit.disabled = false;
      focusFormSection();
      return;
    }

    if (status === 404) {
      closeAndReportMissing(formModal);
      return;
    }

    formLoadErrorText.textContent = describeFailure(status, payload, "Couldn't load this system's credentials");
    showFormSection("error");
    formSubmit.hidden = true;
    formRetry.hidden = status === 401 || status === 403;
    focusFormSection();
  }

  function fillForm(system: SystemDetail): void {
    for (const name of FORM_FIELDS) {
      inputs[name].value = system[name] ?? "";
    }
    setMeta("created", formatDateTime(system.created_at));
    setMeta("updated", formatDateTime(system.updated_at));
    formMeta.hidden = false;
  }

  function resetForm(): void {
    hideAlert(formAlert);
    form.reset();
    for (const name of FORM_FIELDS) {
      inputs[name].value = "";
      setFieldError(name, null);
    }
    for (const toggle of Array.from(formModal.querySelectorAll<HTMLButtonElement>(".password-toggle"))) {
      const input = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
      if (input instanceof HTMLInputElement) {
        setSecretVisible(toggle, input, false);
      }
    }
  }

  function clearSecrets(): void {
    for (const name of [...SECRET_FIELDS, "notes"] as const) {
      inputs[name].value = "";
    }
  }

  function focusFormSection(): void {
    if (!formShown) {
      return;
    }
    if (!formFields.hidden) {
      inputs.name.focus();
    } else if (!formLoadError.hidden) {
      formLoadError.focus();
    }
  }

  function showFormSection(section: "loading" | "error" | "fields"): void {
    formLoading.hidden = section !== "loading";
    formLoadError.hidden = section !== "error";
    formFields.hidden = section !== "fields";
  }

  async function submitForm(): Promise<void> {
    if (busyModal || formFields.hidden) {
      return;
    }
    hideAlert(formAlert);

    const nameError = validateName();
    setFieldError("name", nameError);
    if (nameError !== null) {
      inputs.name.focus();
      return;
    }

    const body = {} as Record<FormField, string>;
    for (const name of FORM_FIELDS) {
      const value = inputs[name].value;
      body[name] = (SECRET_FIELDS as readonly string[]).includes(name) ? value : value.trim();
    }

    const system = editing;
    const result = system
      ? await send(formModal, "PATCH", `${baseUrl}/${system.id}`, body)
      : await send(formModal, "POST", baseUrl, body);

    if (result.status === 200 || result.status === 201) {
      finishAction(formModal, result.payload.message ?? (system ? `Changes saved for ${body.name}.` : `System registered: ${body.name}.`));
      return;
    }

    if (result.status === 422 && result.payload.errors) {
      const invalid = applyFieldErrors(result.payload.errors);
      if (invalid.length > 0) {
        formAlert.textContent = invalid.length === 1
          ? "Fix the highlighted field, then save again."
          : `Fix the ${invalid.length} highlighted fields, then save again.`;
        formAlert.hidden = false;
        inputs[invalid[0]].focus();
        return;
      }
    }

    if (result.status === 404 && system) {
      closeAndReportMissing(formModal);
      return;
    }

    showActionFailure(formModal, formAlert, result, system ? "Couldn't save the changes" : "Couldn't register the system");
  }

  function validateName(): string | null {
    const value = inputs.name.value.trim();
    if (value === "") return "Enter the system name.";
    if (value.length > NAME_MAX) return `System name must be ${NAME_MAX} characters or fewer.`;
    return null;
  }

  function applyFieldErrors(errors: Record<string, string[]>): FormField[] {
    const invalid: FormField[] = [];
    for (const name of FORM_FIELDS) {
      const message = errors[name]?.[0];
      if (message) {
        setFieldError(name, message);
        invalid.push(name);
      }
    }
    return invalid;
  }

  function openRemove(system: SystemSummary, trigger: HTMLElement): void {
    removing = system;
    focusAfterClose = trigger;
    hideAlert(removeAlert);
    const address = system.local_ip ?? system.domain;
    for (const element of Array.from(removeModal.querySelectorAll<HTMLElement>("[data-target]"))) {
      if (element.dataset.target === "name") {
        element.textContent = system.name;
      } else {
        element.textContent = address ?? "No local IP or domain recorded";
        element.classList.toggle("systems-mono", address !== null);
      }
    }
    removeModal.addEventListener("shown.bs.modal", () => removeCancel.focus(), { once: true });
    bootstrap.Modal.getOrCreateInstance(removeModal).show();
  }

  async function submitRemove(): Promise<void> {
    if (!removing || busyModal) {
      return;
    }
    hideAlert(removeAlert);
    const system = removing;
    const result = await send(removeModal, "DELETE", `${baseUrl}/${system.id}`);

    if (result.status === 200) {
      finishAction(removeModal, result.payload.message ?? `System removed: ${system.name}.`);
      return;
    }
    if (result.status === 404) {
      closeAndReportMissing(removeModal);
      return;
    }
    showActionFailure(removeModal, removeAlert, result, "Couldn't remove the system");
  }

  function finishAction(modal: HTMLElement, message: string): void {
    showSuccess(message);
    focusAfterClose = heading;
    bootstrap.Modal.getOrCreateInstance(modal).hide();
    void load();
  }

  function closeAndReportMissing(modal: HTMLElement): void {
    busyModal = null;
    focusAfterClose = errorBox;
    bootstrap.Modal.getOrCreateInstance(modal).hide();
    showError("That system no longer exists. It may have been removed by another administrator. The list has been refreshed.");
    void load();
  }

  function showActionFailure(modal: HTMLElement, alertBox: HTMLElement, result: SendResult, prefix: string): void {
    alertBox.textContent = describeFailure(result.status, result.payload, prefix);
    if (result.status === 401) {
      const link = document.createElement("a");
      link.href = signInUrl;
      link.className = "text-white font-weight-bold text-decoration-underline ms-1";
      link.textContent = "Go to sign in";
      alertBox.append(link);
    }
    alertBox.hidden = false;
    alertBox.focus();
    if (result.status === -1) {
      modal.addEventListener("hidden.bs.modal", () => void load(), { once: true });
    }
  }

  function describeFailure(status: number, payload: ApiPayload, prefix: string): string {
    if (status === 422) {
      const errors = payload.errors ? Object.values(payload.errors).flat() : [];
      return errors.length > 0 ? errors.join(" ") : payload.message ?? `${prefix}. Check the details and try again.`;
    }
    if (status === 401) return `${payload.message ?? "Your session has ended."} Sign in again to continue.`;
    if (status === 403) return `${prefix}. Your account isn't allowed to manage system credentials.`;
    if (status === 429) return `${prefix}. Too many requests. Wait a minute, then try again.`;
    if (status === -1) return `${prefix}. The server took too long to respond, so the change may or may not have been applied. Close this dialog to refresh the list before trying again.`;
    if (status === 0) return `${prefix}. Couldn't connect to the server. Check your connection and try again.`;
    return `${prefix}. Something went wrong on the server (Error ${status}). Try again in a moment.`;
  }

  async function send(modal: HTMLElement, method: string, url: string, body?: unknown): Promise<SendResult> {
    setModalBusy(modal, true);
    const controller = new AbortController();
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method,
        signal: controller.signal,
        headers: cmsApi.headers({ "Content-Type": "application/json" }),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, payload: (await readJson(response)) as ApiPayload };
    } catch {
      return { status: timedOut ? -1 : 0, payload: {} };
    } finally {
      window.clearTimeout(timer);
      setModalBusy(modal, false);
    }
  }

  function setModalBusy(modal: HTMLElement, busy: boolean): void {
    busyModal = busy ? modal : null;
    modal.setAttribute("aria-busy", busy ? "true" : "false");
    for (const control of Array.from(modal.querySelectorAll<HTMLButtonElement | HTMLFieldSetElement>("button, fieldset"))) {
      if (busy) {
        control.dataset.wasDisabled = control.disabled ? "true" : "false";
        control.disabled = true;
      } else if (control.dataset.wasDisabled !== undefined) {
        control.disabled = control.dataset.wasDisabled === "true";
        delete control.dataset.wasDisabled;
      }
    }
    const submit = modal.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!submit) {
      return;
    }
    const spinner = submit.querySelector<HTMLElement>(".spinner-border");
    if (spinner) spinner.hidden = !busy;
    if (busy) {
      submit.dataset.idleLabel = submit.querySelector(".users-button-label")?.textContent ?? "";
      setButtonLabel(submit, submit.dataset.busyLabel ?? "Working…");
    } else if (submit.dataset.idleLabel !== undefined) {
      setButtonLabel(submit, submit.dataset.idleLabel);
    }
  }

  function showSuccess(message: string): void {
    hideFeedback();
    const text = successBox.querySelector(".users-feedback-text");
    if (text) text.textContent = message;
    live.textContent = message;
    successBox.classList.remove("timed-alert");
    void successBox.offsetWidth;
    successBox.classList.add("timed-alert");
    successBox.hidden = false;
    successTimer = window.setTimeout(() => {
      const hadFocus = successBox.contains(document.activeElement);
      successBox.hidden = true;
      successBox.classList.remove("timed-alert");
      if (hadFocus) heading.focus();
    }, TIMED_ALERT_MS);
  }

  function showError(message: string): void {
    hideFeedback();
    const text = errorBox.querySelector(".users-feedback-text");
    if (text) text.textContent = message;
    errorBox.hidden = false;
  }

  function hideFeedback(): void {
    window.clearTimeout(successTimer);
    successBox.hidden = true;
    successBox.classList.remove("timed-alert");
    errorBox.hidden = true;
  }

  function hideAlert(alertBox: HTMLElement): void {
    alertBox.hidden = true;
    alertBox.textContent = "";
  }

  function setFieldError(name: FormField, message: string | null): void {
    const input = inputs[name];
    const feedback = document.getElementById(`system-${name}-error`);
    input.classList.toggle("is-invalid", message !== null);
    if (message !== null) {
      input.setAttribute("aria-invalid", "true");
    } else {
      input.removeAttribute("aria-invalid");
    }
    if (feedback) {
      feedback.textContent = message ?? "";
      feedback.classList.toggle("d-block", message !== null);
    }
  }

  function setSecretVisible(toggle: HTMLButtonElement, input: HTMLInputElement, visible: boolean): void {
    input.type = visible ? "text" : "password";
    toggle.setAttribute("aria-pressed", visible ? "true" : "false");
    const label = toggle.dataset.label ?? "password";
    toggle.setAttribute("aria-label", `${visible ? "Hide" : "Show"} ${label}`);
  }

  function applyEnvironmentBadge(element: HTMLElement, environment: Environment | null): void {
    element.hidden = environment === null;
    if (environment === null) return;
    element.textContent = ENVIRONMENTS[environment];
    element.classList.add(`is-${environment}`);
  }

  function setMeta(key: string, value: string): void {
    const element = formModal.querySelector(`[data-meta="${key}"]`);
    if (element) element.textContent = value;
  }

  function setButtonLabel(button: HTMLButtonElement, label: string): void {
    const element = button.querySelector(".users-button-label");
    if (element) element.textContent = label;
  }

  function setText(root: ParentNode, field: string, value: string): void {
    const element = root.querySelector(`[data-field="${field}"]`);
    if (element) element.textContent = value;
  }

  function formatDateTime(value: string | null): string {
    if (!value) return "—";
    return new Date(value).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function parseFilter(value: string | null): EnvironmentFilter {
    return value === "production" || value === "test" || value === "legacy" ? value : "all";
  }

  function isListResponse(value: unknown): value is ListResponse {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Partial<ListResponse>;
    return Array.isArray(candidate.data) && typeof candidate.meta === "object" && typeof candidate.counts === "object";
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
