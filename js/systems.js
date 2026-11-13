"use strict";
(() => {
    var _a, _b, _c, _d;
    const REQUEST_TIMEOUT_MS = 20000;
    const TIMED_ALERT_MS = 3000;
    const SEARCH_DELAY_MS = 300;
    const COPIED_RESET_MS = 1500;
    const NAME_MAX = 100;
    const LINK_SETTING_KEYS = { ssh: "cms-ppa-ssh-links", rdp: "cms-ppa-rdp-links" };
    const RDP_SCHEME = "cms-ppa-rdp";
    const ANYDESK_ID = /^(?:\d{6,12}|[A-Za-z0-9._-]+@[A-Za-z0-9._-]+)$/;
    const RUSTDESK_ID = /^[A-Za-z0-9_-]{6,32}$/;
    const HOST_AND_PORT = /^([A-Za-z0-9][A-Za-z0-9.-]{0,252})(?::(\d{1,5}))?$/;
    const SSH_USERNAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
    const RDP_USERNAME = /^[^\u0000-\u001f\u007f]{1,100}$/;
    const IS_MAC = /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints === 0;
    const TERMINAL_NAME = IS_MAC ? "Terminal" : "PowerShell";
    const COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V6a2 2 0 0 1 2-2h9"></path></svg>';
    const COPIED_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>';
    const ENVIRONMENTS = { production: "Production", test: "Test", legacy: "Legacy" };
    const FIELD_LABELS = { local_ip: "local IP", mysql_host: "MySQL address", domain: "domain", vm_host: "VM host" };
    const FILTERS = ["all", "production", "test", "legacy"];
    const SECRET_FIELDS = [
        "anydesk_password", "rustdesk_password", "rdp_password", "ssh_password",
        "local_password", "mysql_password", "domain_password", "vm_password",
    ];
    const FORM_FIELDS = [
        "name", "environment", "description",
        "anydesk_id", "anydesk_password", "rustdesk_id", "rustdesk_password",
        "rdp_host", "rdp_username", "rdp_password", "ssh_host", "ssh_username", "ssh_password",
        "local_ip", "local_username", "local_password", "mysql_host", "mysql_username", "mysql_password",
        "domain", "domain_username", "domain_password", "vm_host", "vm_username", "vm_password",
        "notes",
    ];
    const PASSWORD_FIELDS = {
        anydesk: "anydesk_password",
        rustdesk: "rustdesk_password",
        rdp: "rdp_password",
        ssh: "ssh_password",
    };
    const appElement = document.getElementById("systems-app");
    const api = window.CmsApi;
    if (!(appElement instanceof HTMLElement) || typeof bootstrap === "undefined" || !api || !api.token()) {
        return;
    }
    const app = appElement;
    const cmsApi = api;
    const baseUrl = cmsApi.url("/systems");
    const signInUrl = (_a = app.dataset.signInUrl) !== null && _a !== void 0 ? _a : "sign-in.html";
    const heading = byId("systems-heading");
    const createButtons = Array.from(document.querySelectorAll("[data-action='create']"));
    const searchForm = byId("systems-search-form");
    const searchInput = byId("systems-search");
    const filterButtons = Array.from(app.querySelectorAll("[data-environment]"));
    const successBox = byId("systems-success");
    const errorBox = byId("systems-error");
    const live = byId("systems-live");
    const loadingState = byId("systems-loading");
    const emptyState = byId("systems-empty");
    const noMatchState = byId("systems-no-match");
    const noMatchText = byId("systems-no-match-text");
    const loadErrorState = byId("systems-load-error");
    const loadErrorText = byId("systems-load-error-text");
    const tableWrap = byId("systems-table-wrap");
    const rowsBody = byId("systems-rows");
    const rowTemplate = byId("systems-row-template");
    const pagination = byId("systems-pagination");
    const rangeText = byId("systems-range");
    const prevButton = byId("systems-prev");
    const nextButton = byId("systems-next");
    const viewModal = byId("system-view-modal");
    const viewTitle = byId("system-view-title");
    const viewBody = byId("system-view-body");
    const viewUpdate = byId("system-view-update");
    const remoteModal = byId("system-remote-modal");
    const remoteTitle = byId("system-remote-title");
    const remoteBody = byId("system-remote-body");
    const formModal = byId("system-form-modal");
    const form = byId("system-form");
    const formTitle = byId("system-form-title");
    const formAlert = byId("system-form-alert");
    const formFields = byId("system-form-fields");
    const formMeta = byId("system-form-meta");
    const formLoading = byId("system-form-loading");
    const formLoadError = byId("system-form-load-error");
    const formLoadErrorText = byId("system-form-load-error-text");
    const formRetry = byId("system-form-retry");
    const formSubmit = byId("system-form-submit");
    const inputs = {};
    for (const name of FORM_FIELDS) {
        inputs[name] = byId(`system-${name}`);
    }
    const removeModal = byId("system-remove-modal");
    const removeForm = byId("system-remove-form");
    const removeAlert = byId("system-remove-alert");
    const removeCancel = byId("system-remove-cancel");
    const setupModals = {
        ssh: byId("systems-ssh-setup-modal"),
        rdp: byId("systems-rdp-setup-modal"),
    };
    const linkToggles = {
        ssh: byId("systems-ssh-links-toggle"),
        rdp: byId("systems-rdp-links-toggle"),
    };
    const query = new URLSearchParams(window.location.search);
    const state = {
        search: ((_b = query.get("search")) !== null && _b !== void 0 ? _b : "").slice(0, 100),
        environment: parseFilter(query.get("environment")),
        page: Math.max(1, Number.parseInt((_c = query.get("page")) !== null && _c !== void 0 ? _c : "1", 10) || 1),
    };
    const records = new Map();
    const opened = new Map();
    let listController = null;
    let detailController = null;
    let hasRendered = false;
    let searchTimer = 0;
    let successTimer = 0;
    let editing = null;
    let removing = null;
    let busyModal = null;
    let focusAfterClose = null;
    let formShown = false;
    let viewSystem = null;
    let viewTrigger = null;
    let openUpdateAfterClose = false;
    const detailRequests = new Map();
    document.body.append(viewModal);
    viewModal.addEventListener("hidden.bs.modal", () => {
        if (openUpdateAfterClose && viewSystem && viewTrigger) {
            const detail = opened.get(viewSystem.id);
            const system = viewSystem;
            const trigger = viewTrigger;
            openUpdateAfterClose = false;
            if (detail) {
                presentUpdate(system, detail, trigger);
                return;
            }
        }
        const target = focusAfterClose && focusAfterClose.isConnected ? focusAfterClose : heading;
        focusAfterClose = null;
        target.focus();
    });
    viewUpdate.addEventListener("click", () => {
        if (!viewSystem || !opened.has(viewSystem.id)) {
            return;
        }
        openUpdateAfterClose = true;
        bootstrap.Modal.getOrCreateInstance(viewModal).hide();
    });
    for (const modal of [formModal, removeModal, remoteModal, setupModals.ssh, setupModals.rdp]) {
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
        detailController === null || detailController === void 0 ? void 0 : detailController.abort();
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
            var _a;
            const environment = parseFilter((_a = button.dataset.environment) !== null && _a !== void 0 ? _a : null);
            if (environment === state.environment) {
                return;
            }
            state.environment = environment;
            state.page = 1;
            updateFilterButtons();
            void load();
        });
    }
    byId("systems-clear").addEventListener("click", () => {
        searchInput.value = "";
        state.search = "";
        state.environment = "all";
        state.page = 1;
        updateFilterButtons();
        void load();
        searchInput.focus();
    });
    byId("systems-retry").addEventListener("click", () => void load());
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
        (_d = box.querySelector(".users-feedback-close")) === null || _d === void 0 ? void 0 : _d.addEventListener("click", () => {
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
        const row = target.closest("tr[data-system-id]");
        const record = row ? records.get(Number(row.dataset.systemId)) : undefined;
        if (!row || !record) {
            return;
        }
        const copyControl = target.closest("[data-remote-action='copy']");
        if (copyControl) {
            handleRemoteAction(copyControl, event);
            return;
        }
        const action = target.closest("button[data-row-action]");
        if ((action === null || action === void 0 ? void 0 : action.dataset.rowAction) === "remove") {
            openRemove(record, action);
            return;
        }
        if ((action === null || action === void 0 ? void 0 : action.dataset.rowAction) === "edit") {
            void openView(record, action);
            return;
        }
        if (target.closest(".systems-remote-cell, [data-row-action='remote']")) {
            event.preventDefault();
            void openRemotePopup(record, action !== null && action !== void 0 ? action : row);
            return;
        }
        if (target.closest("td[data-label='Actions']")) {
            return;
        }
        void revealRow(record);
    });
    for (const toggle of Array.from(formModal.querySelectorAll(".password-toggle"))) {
        toggle.addEventListener("click", () => {
            var _a;
            const input = document.getElementById((_a = toggle.getAttribute("aria-controls")) !== null && _a !== void 0 ? _a : "");
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
            void reopenDetails(editing);
        }
    });
    removeForm.addEventListener("submit", (event) => {
        event.preventDefault();
        void submitRemove();
    });
    for (const button of Array.from(document.querySelectorAll("[data-action='link-setup']"))) {
        button.addEventListener("click", () => {
            openLinkSetup(button.dataset.setup === "rdp" ? "rdp" : "ssh", button);
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
    void load();
    function applySearch() {
        const value = searchInput.value.trim();
        if (value === state.search) {
            return;
        }
        state.search = value;
        state.page = 1;
        void load();
    }
    async function load() {
        listController === null || listController === void 0 ? void 0 : listController.abort();
        const controller = new AbortController();
        listController = controller;
        let timedOut = false;
        const timer = window.setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, REQUEST_TIMEOUT_MS);
        const params = new URLSearchParams();
        if (state.search !== "")
            params.set("search", state.search);
        if (state.environment !== "all")
            params.set("environment", state.environment);
        if (state.page > 1)
            params.set("page", String(state.page));
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
                showLoadError(response.status, payload);
                return;
            }
            if (payload.data.length === 0 && state.page > 1 && state.page > payload.meta.last_page) {
                state.page = Math.max(1, payload.meta.last_page);
                void load();
                return;
            }
            render(payload);
        }
        catch {
            if (controller !== listController) {
                return;
            }
            showLoadError(timedOut ? -1 : 0, {});
        }
        finally {
            window.clearTimeout(timer);
            if (controller === listController) {
                app.removeAttribute("aria-busy");
                tableWrap.classList.remove("is-loading");
                setCreateDisabled(false);
            }
        }
    }
    function showLoading() {
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
    function render(response) {
        var _a, _b, _c;
        opened.clear();
        hasRendered = true;
        loadingState.hidden = true;
        loadErrorState.hidden = true;
        for (const filter of FILTERS) {
            const count = app.querySelector(`[data-count="${filter}"]`);
            if (count) {
                count.textContent = String((_a = response.counts[filter]) !== null && _a !== void 0 ? _a : 0);
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
        rangeText.textContent = `Showing ${(_b = meta.from) !== null && _b !== void 0 ? _b : 0}–${(_c = meta.to) !== null && _c !== void 0 ? _c : 0} of ${meta.total} ${noun}`;
        prevButton.disabled = meta.current_page <= 1;
        nextButton.disabled = meta.current_page >= meta.last_page;
        live.textContent = `${meta.total} ${noun} found.`;
    }
    function buildRow(system) {
        var _a, _b, _c, _d;
        const fragment = rowTemplate.content.cloneNode(true);
        const row = fragment.querySelector("tr");
        row.dataset.systemId = String(system.id);
        setText(row, "name", system.name);
        const description = row.querySelector('[data-field="description"]');
        if (description) {
            description.textContent = (_a = system.description) !== null && _a !== void 0 ? _a : "";
            description.hidden = !system.description;
        }
        const environment = row.querySelector('[data-field="environment"]');
        if (environment) {
            applyEnvironmentBadge(environment, system.environment);
        }
        const remote = row.querySelector('[data-field="remote"]');
        if (remote) {
            if (system.remote_access.length === 0) {
                remote.replaceWith(notAvailable());
            }
            else if (system.details_hidden) {
                remote.append(buildConcealedRemote(system));
            }
            else {
                system.remote_access.forEach((entry, index) => remote.append(buildRemoteItem(system, entry, index)));
            }
        }
        for (const field of ["local_ip", "mysql_host", "domain", "vm_host"]) {
            const cell = row.querySelector(`[data-field="${field}"]`);
            const value = system[field];
            if (!cell)
                continue;
            if (system.details_hidden && value) {
                (_b = cell.closest("td")) === null || _b === void 0 ? void 0 : _b.setAttribute("title", `Show ${FIELD_LABELS[field]} for ${system.name}`);
                cell.replaceWith(concealedMark());
            }
            else if (value) {
                setBreakableText(cell, value);
                cell.title = value;
            }
            else {
                cell.replaceWith(notAvailable());
            }
        }
        (_c = row.querySelector('[data-row-action="edit"]')) === null || _c === void 0 ? void 0 : _c.setAttribute("aria-label", `View ${system.name}`);
        (_d = row.querySelector('[data-row-action="remove"]')) === null || _d === void 0 ? void 0 : _d.setAttribute("aria-label", `Remove ${system.name}`);
        return row;
    }
    function buildConcealedRemote(system) {
        const item = document.createElement("li");
        item.className = "systems-remote-item";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "systems-hidden-value";
        button.dataset.rowAction = "remote";
        button.setAttribute("aria-label", `Show remote access for ${system.name}`);
        for (const entry of system.remote_access) {
            const tag = document.createElement("span");
            tag.className = `systems-remote-tag is-${entry.type}`;
            tag.textContent = entry.label;
            button.append(tag);
        }
        const dots = document.createElement("span");
        dots.className = "systems-mono";
        dots.setAttribute("aria-hidden", "true");
        dots.textContent = "••••••";
        button.append(dots);
        item.append(button);
        return item;
    }
    function concealedMark() {
        const mark = document.createElement("span");
        mark.className = "systems-hidden-value";
        mark.textContent = "••••••";
        return mark;
    }
    function buildRemoteItem(system, entry, index) {
        const item = document.createElement("li");
        item.className = "systems-remote-item";
        item.dataset.remoteIndex = String(index);
        const control = document.createElement("button");
        control.type = "button";
        control.className = "systems-remote-launch";
        control.dataset.rowAction = "remote";
        control.setAttribute("aria-label", `Show remote access for ${system.name}`);
        const tag = document.createElement("span");
        tag.className = `systems-remote-tag is-${entry.type}`;
        tag.textContent = entry.label;
        const value = document.createElement("span");
        value.className = "systems-mono";
        value.textContent = entry.value;
        value.title = entry.value;
        control.append(tag, value);
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
    async function recordCredentialAccess(systemId, movement, type) {
        try {
            const response = await fetch(cmsApi.url(`/systems/${systemId}/credential-access`), {
                method: "POST",
                headers: cmsApi.headers({ "Content-Type": "application/json" }),
                body: JSON.stringify(type ? { movement, type } : { movement }),
                keepalive: true,
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    async function recordRemoteDeskOpen(system, entry) {
        try {
            const response = await fetch(cmsApi.url(`/systems/${system.id}/remote-desks`), {
                method: "POST",
                headers: cmsApi.headers({ "Content-Type": "application/json" }),
                body: JSON.stringify({ type: entry.type }),
                keepalive: true,
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    function handleRemoteAction(control, event) {
        var _a;
        const row = control.closest("tr[data-system-id]");
        const system = row ? records.get(Number(row.dataset.systemId)) : undefined;
        const index = Number((_a = control.closest("[data-remote-index]")) === null || _a === void 0 ? void 0 : _a.dataset.remoteIndex);
        const entry = system === null || system === void 0 ? void 0 : system.remote_access[index];
        if (!system || !entry) {
            return;
        }
        if (control.dataset.remoteAction === "copy") {
            void copyRemote(control, entry);
            return;
        }
        if (!launchHref(entry)) {
            return;
        }
        event.preventDefault();
        void openConfirmedRemoteDesk(system, entry);
    }
    async function openConfirmedRemoteDesk(system, entry) {
        const href = launchHref(entry);
        const followLink = entry.type === "anydesk" || entry.type === "rustdesk"
            || (entry.type === "rdp" && linksEnabled("rdp"))
            || (entry.type === "ssh" && linksEnabled("ssh"));
        if (followLink && href) {
            launchExternal(href);
            live.textContent = `Opening ${entry.label} for ${system.name}.`;
        }
        const recorded = await recordRemoteDeskOpen(system, entry);
        if (followLink && href) {
            if (!recorded) {
                live.textContent = `Opening ${entry.label} for ${system.name}. The open wasn't recorded.`;
            }
            return;
        }
        if (!recorded) {
            live.textContent = "The remote desk wasn't opened. Try again.";
            return;
        }
        live.textContent = entry.type === "ssh"
            ? `Set up one-click SSH to open ${TERMINAL_NAME}, or run ssh from the host shown here.`
            : entry.type === "rdp"
                ? "Set up one-click RDP to open Remote Desktop, or enter the host shown here."
                : `If ${entry.label} doesn't open, check that it's installed on this computer.`;
    }
    function launchExternal(href) {
        const link = document.createElement("a");
        link.href = href;
        link.style.position = "fixed";
        link.style.left = "0";
        link.style.top = "0";
        link.style.width = "1px";
        link.style.height = "1px";
        link.style.opacity = "0";
        document.body.append(link);
        link.click();
        window.setTimeout(() => link.remove(), 1000);
    }
    function launchHref(entry) {
        var _a, _b;
        if (entry.type === "anydesk" || entry.type === "rustdesk") {
            const id = entry.address.replace(/\s+/g, "");
            if (entry.type === "anydesk") {
                return ANYDESK_ID.test(id) ? `anydesk:${id}` : null;
            }
            return RUSTDESK_ID.test(id) ? `rustdesk://connection/new/${id}` : null;
        }
        if (entry.type === "ssh") {
            return (_b = (_a = sshTarget(entry)) === null || _a === void 0 ? void 0 : _a.href) !== null && _b !== void 0 ? _b : null;
        }
        return rdpHref(entry);
    }
    function rdpHref(entry) {
        var _a, _b;
        const address = entry.address.trim();
        const match = HOST_AND_PORT.exec(address);
        if (!match) {
            return null;
        }
        const port = match[2];
        if (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) {
            return null;
        }
        const username = (_b = (_a = entry.username) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : "";
        const userPart = RDP_USERNAME.test(username) ? `${encodeURIComponent(username)}@` : "";
        return `${RDP_SCHEME}://${userPart}${address}`;
    }
    function sshTarget(entry) {
        var _a, _b;
        const match = HOST_AND_PORT.exec(entry.address.trim());
        const username = (_b = (_a = entry.username) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : "";
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
    function launchLabel(system, entry) {
        if (entry.type === "rdp")
            return `Open Remote Desktop to ${system.name} (${entry.value})`;
        if (entry.type === "ssh")
            return `Open SSH to ${system.name} in ${TERMINAL_NAME} (${entry.value})`;
        return `Connect to ${system.name} with ${entry.label} (${entry.value})`;
    }
    function launchHint(entry) {
        if (entry.type === "rdp")
            return "Open Remote Desktop Connection";
        if (entry.type === "ssh")
            return `Connect with SSH in ${TERMINAL_NAME}`;
        return `Open in ${entry.label}`;
    }
    function copyLabel(entry) {
        if (entry.type === "rdp")
            return "Copy RDP host";
        if (entry.type === "ssh")
            return sshTarget(entry) ? "Copy SSH command" : "Copy SSH host";
        return `Copy ${entry.label} ID`;
    }
    function copyValue(entry) {
        var _a, _b;
        if (entry.type === "ssh")
            return (_b = (_a = sshTarget(entry)) === null || _a === void 0 ? void 0 : _a.command) !== null && _b !== void 0 ? _b : entry.value;
        if (entry.type === "rdp")
            return entry.address.trim();
        const id = entry.address.replace(/\s+/g, "");
        return (entry.type === "anydesk" ? ANYDESK_ID : RUSTDESK_ID).test(id) ? id : entry.address.trim();
    }
    async function copySecret(button, secret, label, beforeCopy) {
        var _a;
        if (button.classList.contains("is-copied")) {
            return;
        }
        if (beforeCopy && !await beforeCopy()) {
            live.textContent = "The password wasn't copied. Try again.";
            return;
        }
        const previous = (_a = button.getAttribute("aria-label")) !== null && _a !== void 0 ? _a : "";
        const copied = await copyText(secret);
        live.textContent = copied ? `${label} copied.` : "Couldn't copy. Select the text and copy it yourself.";
        if (!copied) {
            return;
        }
        button.classList.add("is-copied");
        button.innerHTML = COPIED_ICON;
        button.setAttribute("aria-label", "Copied");
        window.setTimeout(() => {
            button.classList.remove("is-copied");
            button.innerHTML = COPY_ICON;
            button.setAttribute("aria-label", previous);
        }, COPIED_RESET_MS);
    }
    async function copyRemote(button, entry) {
        var _a;
        if (button.classList.contains("is-copied")) {
            return;
        }
        const label = (_a = button.getAttribute("aria-label")) !== null && _a !== void 0 ? _a : "";
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
    async function requestGrant(system, action) {
        const auth = window.CmsRemoteDeskAuth;
        if (!auth) {
            showError("Confirmation didn't load. Reload the page and try again.");
            return null;
        }
        return auth.confirm({ systemId: system.id, systemName: system.name, action });
    }
    async function ensureDetail(system, action) {
        const cached = opened.get(system.id);
        if (cached) {
            return cached;
        }
        const pending = detailRequests.get(system.id);
        if (pending) {
            return pending;
        }
        const request = loadUnlocked(system, action);
        detailRequests.set(system.id, request);
        try {
            return await request;
        }
        finally {
            detailRequests.delete(system.id);
        }
    }
    async function loadUnlocked(system, action) {
        const grant = await requestGrant(system, action);
        if (!grant) {
            return null;
        }
        const result = await fetchDetails(system.id, grant);
        if (result.status === 200 && result.payload.system) {
            opened.set(system.id, result.payload.system);
            return result.payload.system;
        }
        if (result.status === 404) {
            showError("That system no longer exists.");
            void load();
            return null;
        }
        showError(describeFailure(result.status, result.payload, "Couldn't show these details"));
        return null;
    }
    async function revealRow(system) {
        var _a;
        if (!system.details_hidden) {
            return;
        }
        const detail = await ensureDetail(system, "details");
        if (!detail) {
            return;
        }
        if (!await recordCredentialAccess(system.id, "revealed")) {
            showError("The row wasn't revealed. Try again.");
            return;
        }
        const current = (_a = records.get(system.id)) !== null && _a !== void 0 ? _a : system;
        const next = summaryFromDetail(current, detail);
        records.set(system.id, next);
        replaceRow(next);
        live.textContent = `Details shown for ${system.name}.`;
    }
    async function openRemotePopup(system, trigger) {
        focusAfterClose = trigger instanceof HTMLElement ? trigger : null;
        const detail = await ensureDetail(system, "details");
        if (!detail) {
            return;
        }
        if (!await recordCredentialAccess(system.id, "remote_viewed")) {
            showError("The remote desk credentials weren't opened. Try again.");
            return;
        }
        remoteTitle.textContent = system.name;
        renderRemoteBody(system, detail);
        bootstrap.Modal.getOrCreateInstance(remoteModal).show();
    }
    function renderRemoteBody(system, detail) {
        remoteBody.replaceChildren();
        const entries = summaryFromDetail(system, detail).remote_access;
        if (entries.length === 0) {
            const empty = document.createElement("p");
            empty.className = "text-sm text-secondary mb-0";
            empty.textContent = "No remote access is registered for this system.";
            remoteBody.append(empty);
            return;
        }
        for (const entry of entries) {
            const passwordField = PASSWORD_FIELDS[entry.type];
            const facts = [{ label: entry.type === "anydesk" || entry.type === "rustdesk" ? "ID" : "Host", value: entry.address }];
            if (entry.username) {
                facts.push({ label: "Username", value: entry.username });
            }
            const password = detail[passwordField];
            facts.push({
                label: "Password",
                value: password || "Not saved",
                secret: Boolean(password),
                copy: password,
                beforeCopy: () => recordCredentialAccess(system.id, "password_copied", entry.type),
            });
            const group = factGroup(entry.label, facts);
            const section = group !== null && group !== void 0 ? group : document.createElement("section");
            if (!group) {
                section.className = "systems-view-group";
            }
            const href = launchHref(entry);
            const followLink = href !== null && (entry.type === "anydesk" || entry.type === "rustdesk"
                || (entry.type === "rdp" && linksEnabled("rdp"))
                || (entry.type === "ssh" && linksEnabled("ssh")));
            if (href) {
                const connect = document.createElement(followLink ? "a" : "button");
                connect.className = "btn btn-sm bg-gradient-dark mb-0 systems-remote-connect";
                connect.textContent = `Connect with ${entry.label}`;
                connect.setAttribute("aria-label", launchLabel(system, entry));
                connect.title = launchHint(entry);
                if (followLink) {
                    connect.href = href;
                }
                else {
                    connect.type = "button";
                }
                connect.addEventListener("click", (event) => {
                    if (!followLink) {
                        event.preventDefault();
                        void openConfirmedRemoteDesk(system, entry);
                        return;
                    }
                    void recordRemoteDeskOpen(system, entry);
                });
                section.append(connect);
            }
            remoteBody.append(section);
        }
    }
    async function openView(system, trigger) {
        var _a;
        focusAfterClose = trigger;
        viewTrigger = trigger;
        const detail = await ensureDetail(system, "update");
        if (!detail) {
            return;
        }
        if (!await recordCredentialAccess(system.id, "viewed")) {
            showError("The credential details weren't opened. Try again.");
            return;
        }
        viewSystem = (_a = records.get(system.id)) !== null && _a !== void 0 ? _a : system;
        viewTitle.textContent = system.name;
        renderCredentialSummary(detail);
        bootstrap.Modal.getOrCreateInstance(viewModal).show();
    }
    function renderCredentialSummary(detail) {
        const environment = detail.environment;
        const environmentLabel = environment === "production" || environment === "test" || environment === "legacy"
            ? ENVIRONMENTS[environment]
            : null;
        viewBody.replaceChildren();
        const groups = [
            { title: "System", facts: [
                    { label: "Environment", value: environmentLabel },
                    { label: "Description", value: detail.description },
                ] },
            { title: "AnyDesk", facts: [
                    { label: "ID", value: detail.anydesk_id },
                    { label: "Password", value: detail.anydesk_password, secret: true },
                ] },
            { title: "RustDesk", facts: [
                    { label: "ID", value: detail.rustdesk_id },
                    { label: "Password", value: detail.rustdesk_password, secret: true },
                ] },
            { title: "RDP", facts: [
                    { label: "Host", value: detail.rdp_host },
                    { label: "Username", value: detail.rdp_username },
                    { label: "Password", value: detail.rdp_password, secret: true },
                ] },
            { title: "SSH", facts: [
                    { label: "Host", value: detail.ssh_host },
                    { label: "Username", value: detail.ssh_username },
                    { label: "Password", value: detail.ssh_password, secret: true },
                ] },
            { title: "Local IP", facts: [
                    { label: "Address", value: detail.local_ip },
                    { label: "Username", value: detail.local_username },
                    { label: "Password", value: detail.local_password, secret: true },
                ] },
            { title: "MySQL", facts: [
                    { label: "Address", value: detail.mysql_host },
                    { label: "Username", value: detail.mysql_username },
                    { label: "Password", value: detail.mysql_password, secret: true },
                ] },
            { title: "Domain", facts: [
                    { label: "Name", value: detail.domain },
                    { label: "Username", value: detail.domain_username },
                    { label: "Password", value: detail.domain_password, secret: true },
                ] },
            { title: "VM", facts: [
                    { label: "Host", value: detail.vm_host },
                    { label: "Username", value: detail.vm_username },
                    { label: "Password", value: detail.vm_password, secret: true },
                ] },
            { title: "Notes", facts: [{ label: "Notes", value: detail.notes }] },
        ];
        let shown = 0;
        for (const group of groups) {
            const section = factGroup(group.title, group.facts);
            if (!section)
                continue;
            shown += 1;
            viewBody.append(section);
        }
        if (shown === 0) {
            const empty = document.createElement("p");
            empty.className = "text-sm text-secondary mb-0";
            empty.textContent = "No credentials are saved for this system yet.";
            viewBody.append(empty);
        }
    }
    function factGroup(title, facts) {
        var _a, _b, _c;
        const filled = facts.filter((fact) => fact.value);
        if (filled.length === 0) {
            return null;
        }
        const section = document.createElement("section");
        section.className = "systems-view-group";
        const heading = document.createElement("h6");
        heading.className = "systems-section-title";
        heading.textContent = title;
        const list = document.createElement("dl");
        list.className = "systems-facts";
        for (const fact of filled) {
            const row = document.createElement("div");
            const term = document.createElement("dt");
            term.textContent = fact.label;
            const value = document.createElement("dd");
            if (fact.label === "Environment") {
                const key = Object.keys(ENVIRONMENTS).find((name) => ENVIRONMENTS[name] === fact.value);
                const badge = document.createElement("span");
                badge.className = key ? `systems-env is-${key}` : "systems-env";
                badge.textContent = (_a = fact.value) !== null && _a !== void 0 ? _a : "";
                value.append(badge);
                row.append(term, value);
                list.append(row);
                continue;
            }
            if (fact.secret || fact.label !== "Description" && fact.label !== "Notes") {
                value.className = "systems-mono";
            }
            if (fact.copy) {
                const line = document.createElement("span");
                line.className = "systems-secret-line";
                const text = document.createElement("span");
                text.textContent = (_b = fact.value) !== null && _b !== void 0 ? _b : "";
                const copy = document.createElement("button");
                copy.type = "button";
                copy.className = "systems-remote-copy";
                copy.innerHTML = COPY_ICON;
                copy.setAttribute("aria-label", `Copy ${title} password`);
                copy.title = "Copy password";
                const secret = fact.copy;
                copy.addEventListener("click", () => void copySecret(copy, secret, `${title} password`, fact.beforeCopy));
                line.append(text, copy);
                value.append(line);
            }
            else {
                value.textContent = (_c = fact.value) !== null && _c !== void 0 ? _c : "";
            }
            row.append(term, value);
            list.append(row);
        }
        section.append(heading, list);
        return section;
    }
    function summaryFromDetail(system, detail) {
        const remote = [];
        addRemote(remote, "anydesk", "AnyDesk", detail.anydesk_id, detail.anydesk_id, null);
        addRemote(remote, "rustdesk", "RustDesk", detail.rustdesk_id, detail.rustdesk_id, null);
        addRemote(remote, "rdp", "RDP", detail.rdp_host, detail.rdp_host, detail.rdp_username);
        const sshValue = detail.ssh_host && detail.ssh_username ? `${detail.ssh_username}@${detail.ssh_host}` : detail.ssh_host;
        addRemote(remote, "ssh", "SSH", sshValue, detail.ssh_host, detail.ssh_username);
        const environment = detail.environment;
        return {
            ...system,
            description: detail.description,
            environment: environment === "production" || environment === "test" || environment === "legacy" ? environment : null,
            remote_access: remote,
            local_ip: detail.local_ip,
            mysql_host: detail.mysql_host,
            domain: detail.domain,
            vm_host: detail.vm_host,
            details_hidden: false,
            created_at: detail.created_at,
            updated_at: detail.updated_at,
        };
    }
    function addRemote(remote, type, label, value, address, username) {
        if (!address) {
            return;
        }
        remote.push({ type, label, value: value !== null && value !== void 0 ? value : address, address, username });
    }
    function replaceRow(system) {
        const existing = rowsBody.querySelector(`tr[data-system-id="${CSS.escape(String(system.id))}"]`);
        if (!existing) {
            return null;
        }
        const next = buildRow(system);
        existing.replaceWith(next);
        return next;
    }
    async function fetchDetails(systemId, grant) {
        const controller = new AbortController();
        let timedOut = false;
        const timer = window.setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(`${baseUrl}/${systemId}`, {
                signal: controller.signal,
                headers: cmsApi.headers({ "X-Credential-Grant": grant }),
            });
            return { status: response.status, payload: (await readJson(response)) };
        }
        catch {
            return { status: timedOut ? -1 : 0, payload: {} };
        }
        finally {
            window.clearTimeout(timer);
        }
    }
    function openLinkSetup(helper, trigger) {
        focusAfterClose = trigger;
        linkToggles[helper].checked = linksEnabled(helper);
        bootstrap.Modal.getOrCreateInstance(setupModals[helper]).show();
    }
    function linksEnabled(helper) {
        const stored = readSetting(LINK_SETTING_KEYS[helper]);
        return stored === null ? true : stored === "on";
    }
    function readSetting(key) {
        try {
            return window.localStorage.getItem(key);
        }
        catch {
            return null;
        }
    }
    function writeSetting(key, value) {
        try {
            window.localStorage.setItem(key, value);
        }
        catch {
        }
    }
    async function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            }
            catch {
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
        }
        catch {
            copied = false;
        }
        area.remove();
        previousFocus === null || previousFocus === void 0 ? void 0 : previousFocus.focus();
        return copied;
    }
    function setBreakableText(element, value) {
        element.replaceChildren();
        for (const part of value.split(/(?<=[/:])/)) {
            if (element.childNodes.length > 0) {
                element.append(document.createElement("wbr"));
            }
            element.append(part);
        }
    }
    function notAvailable() {
        const element = document.createElement("span");
        element.className = "systems-na";
        element.textContent = "N/A";
        element.setAttribute("aria-label", "Not available");
        return element;
    }
    function showLoadError(status, payload) {
        var _a;
        loadingState.hidden = true;
        emptyState.hidden = true;
        noMatchState.hidden = true;
        tableWrap.hidden = true;
        pagination.hidden = true;
        loadErrorState.hidden = false;
        if (status === 401) {
            loadErrorText.textContent = (_a = payload.message) !== null && _a !== void 0 ? _a : "Your session has ended. Sign in again to manage system credentials.";
            replaceRetryWithSignIn();
        }
        else if (status === 403) {
            loadErrorText.textContent = "Your account isn't allowed to manage system credentials.";
        }
        else if (status === -1) {
            loadErrorText.textContent = "The server took too long to respond. Try again.";
        }
        else if (status === 0) {
            loadErrorText.textContent = "Couldn't connect to the server. Check your connection and try again.";
        }
        else {
            loadErrorText.textContent = `Something went wrong on the server (Error ${status}). Try again in a moment.`;
        }
        live.textContent = `Couldn't load systems. ${loadErrorText.textContent}`;
    }
    function replaceRetryWithSignIn() {
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
    function describeNoMatch() {
        const parts = [];
        if (state.search !== "")
            parts.push(`matching “${state.search}”`);
        if (state.environment !== "all")
            parts.push(`in ${ENVIRONMENTS[state.environment]}`);
        return parts.length > 0 ? `No systems found ${parts.join(" ")}.` : "Try a different search or filter.";
    }
    function updateFilterButtons() {
        for (const button of filterButtons) {
            const active = button.dataset.environment === state.environment;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", active ? "true" : "false");
        }
    }
    function setCreateDisabled(disabled) {
        for (const button of createButtons) {
            button.disabled = disabled;
        }
    }
    function openCreate(trigger) {
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
    function presentUpdate(system, detail, trigger) {
        editing = system;
        focusAfterClose = trigger;
        resetForm();
        formTitle.textContent = system.name;
        fillForm(detail);
        showFormSection("fields");
        formSubmit.hidden = false;
        formSubmit.disabled = false;
        formSubmit.dataset.busyLabel = "Saving…";
        setButtonLabel(formSubmit, "Save changes");
        bootstrap.Modal.getOrCreateInstance(formModal).show();
    }
    async function reopenDetails(system) {
        const grant = await requestGrant(system, "update");
        if (!grant || editing !== system) {
            return;
        }
        void loadDetails(system, grant);
    }
    async function loadDetails(system, grant) {
        detailController === null || detailController === void 0 ? void 0 : detailController.abort();
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
        let status;
        let payload;
        try {
            const response = await fetch(`${baseUrl}/${system.id}`, {
                signal: controller.signal,
                headers: cmsApi.headers({ "X-Credential-Grant": grant }),
            });
            status = response.status;
            payload = (await readJson(response));
        }
        catch {
            status = timedOut ? -1 : 0;
            payload = {};
        }
        finally {
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
    function fillForm(system) {
        var _a;
        for (const name of FORM_FIELDS) {
            inputs[name].value = (_a = system[name]) !== null && _a !== void 0 ? _a : "";
        }
        setMeta("created", formatDateTime(system.created_at));
        setMeta("updated", formatDateTime(system.updated_at));
        formMeta.hidden = false;
    }
    function resetForm() {
        var _a;
        hideAlert(formAlert);
        form.reset();
        for (const name of FORM_FIELDS) {
            inputs[name].value = "";
            setFieldError(name, null);
        }
        for (const toggle of Array.from(formModal.querySelectorAll(".password-toggle"))) {
            const input = document.getElementById((_a = toggle.getAttribute("aria-controls")) !== null && _a !== void 0 ? _a : "");
            if (input instanceof HTMLInputElement) {
                setSecretVisible(toggle, input, false);
            }
        }
    }
    function clearSecrets() {
        for (const name of [...SECRET_FIELDS, "notes"]) {
            inputs[name].value = "";
        }
    }
    function focusFormSection() {
        if (!formShown) {
            return;
        }
        if (!formFields.hidden) {
            inputs.name.focus();
        }
        else if (!formLoadError.hidden) {
            formLoadError.focus();
        }
    }
    function showFormSection(section) {
        formLoading.hidden = section !== "loading";
        formLoadError.hidden = section !== "error";
        formFields.hidden = section !== "fields";
    }
    async function submitForm() {
        var _a;
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
        const body = {};
        for (const name of FORM_FIELDS) {
            const value = inputs[name].value;
            body[name] = SECRET_FIELDS.includes(name) ? value : value.trim();
        }
        const system = editing;
        const result = system
            ? await send(formModal, "PATCH", `${baseUrl}/${system.id}`, body)
            : await send(formModal, "POST", baseUrl, body);
        if (result.status === 200 || result.status === 201) {
            finishAction(formModal, (_a = result.payload.message) !== null && _a !== void 0 ? _a : (system ? `Changes saved for ${body.name}.` : `System registered: ${body.name}.`));
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
    function validateName() {
        const value = inputs.name.value.trim();
        if (value === "")
            return "Enter the system name.";
        if (value.length > NAME_MAX)
            return `System name must be ${NAME_MAX} characters or fewer.`;
        return null;
    }
    function applyFieldErrors(errors) {
        var _a;
        const invalid = [];
        for (const name of FORM_FIELDS) {
            const message = (_a = errors[name]) === null || _a === void 0 ? void 0 : _a[0];
            if (message) {
                setFieldError(name, message);
                invalid.push(name);
            }
        }
        return invalid;
    }
    function openRemove(system, trigger) {
        var _a;
        removing = system;
        focusAfterClose = trigger;
        hideAlert(removeAlert);
        const address = system.details_hidden ? null : ((_a = system.local_ip) !== null && _a !== void 0 ? _a : system.domain);
        for (const element of Array.from(removeModal.querySelectorAll("[data-target]"))) {
            if (element.dataset.target === "name") {
                element.textContent = system.name;
            }
            else {
                element.textContent = system.details_hidden ? "Address hidden" : address !== null && address !== void 0 ? address : "No local IP or domain recorded";
                element.classList.toggle("systems-mono", address !== null);
            }
        }
        removeModal.addEventListener("shown.bs.modal", () => removeCancel.focus(), { once: true });
        bootstrap.Modal.getOrCreateInstance(removeModal).show();
    }
    async function submitRemove() {
        var _a;
        if (!removing || busyModal) {
            return;
        }
        hideAlert(removeAlert);
        const system = removing;
        const result = await send(removeModal, "DELETE", `${baseUrl}/${system.id}`);
        if (result.status === 200) {
            finishAction(removeModal, (_a = result.payload.message) !== null && _a !== void 0 ? _a : `System removed: ${system.name}.`);
            return;
        }
        if (result.status === 404) {
            closeAndReportMissing(removeModal);
            return;
        }
        showActionFailure(removeModal, removeAlert, result, "Couldn't remove the system");
    }
    function finishAction(modal, message) {
        showSuccess(message);
        focusAfterClose = heading;
        bootstrap.Modal.getOrCreateInstance(modal).hide();
        void load();
    }
    function closeAndReportMissing(modal) {
        busyModal = null;
        focusAfterClose = errorBox;
        bootstrap.Modal.getOrCreateInstance(modal).hide();
        showError("That system no longer exists. It may have been removed by another administrator. The list has been refreshed.");
        void load();
    }
    function showActionFailure(modal, alertBox, result, prefix) {
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
    function describeFailure(status, payload, prefix) {
        var _a, _b;
        if (status === 422) {
            const errors = payload.errors ? Object.values(payload.errors).flat() : [];
            return errors.length > 0 ? errors.join(" ") : (_a = payload.message) !== null && _a !== void 0 ? _a : `${prefix}. Check the details and try again.`;
        }
        if (status === 401)
            return `${(_b = payload.message) !== null && _b !== void 0 ? _b : "Your session has ended."} Sign in again to continue.`;
        if (status === 403)
            return `${prefix}. Your account isn't allowed to manage system credentials.`;
        if (status === 429)
            return `${prefix}. Too many requests. Wait a minute, then try again.`;
        if (status === -1)
            return `${prefix}. The server took too long to respond, so the change may or may not have been applied. Close this dialog to refresh the list before trying again.`;
        if (status === 0)
            return `${prefix}. Couldn't connect to the server. Check your connection and try again.`;
        return `${prefix}. Something went wrong on the server (Error ${status}). Try again in a moment.`;
    }
    async function send(modal, method, url, body) {
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
            return { status: response.status, payload: (await readJson(response)) };
        }
        catch {
            return { status: timedOut ? -1 : 0, payload: {} };
        }
        finally {
            window.clearTimeout(timer);
            setModalBusy(modal, false);
        }
    }
    function setModalBusy(modal, busy) {
        var _a, _b, _c;
        busyModal = busy ? modal : null;
        modal.setAttribute("aria-busy", busy ? "true" : "false");
        for (const control of Array.from(modal.querySelectorAll("button, fieldset"))) {
            if (busy) {
                control.dataset.wasDisabled = control.disabled ? "true" : "false";
                control.disabled = true;
            }
            else if (control.dataset.wasDisabled !== undefined) {
                control.disabled = control.dataset.wasDisabled === "true";
                delete control.dataset.wasDisabled;
            }
        }
        const submit = modal.querySelector('button[type="submit"]');
        if (!submit) {
            return;
        }
        const spinner = submit.querySelector(".spinner-border");
        if (spinner)
            spinner.hidden = !busy;
        if (busy) {
            submit.dataset.idleLabel = (_b = (_a = submit.querySelector(".users-button-label")) === null || _a === void 0 ? void 0 : _a.textContent) !== null && _b !== void 0 ? _b : "";
            setButtonLabel(submit, (_c = submit.dataset.busyLabel) !== null && _c !== void 0 ? _c : "Working…");
        }
        else if (submit.dataset.idleLabel !== undefined) {
            setButtonLabel(submit, submit.dataset.idleLabel);
        }
    }
    function showSuccess(message) {
        hideFeedback();
        const text = successBox.querySelector(".users-feedback-text");
        if (text)
            text.textContent = message;
        live.textContent = message;
        successBox.classList.remove("timed-alert");
        void successBox.offsetWidth;
        successBox.classList.add("timed-alert");
        successBox.hidden = false;
        successTimer = window.setTimeout(() => {
            const hadFocus = successBox.contains(document.activeElement);
            successBox.hidden = true;
            successBox.classList.remove("timed-alert");
            if (hadFocus)
                heading.focus();
        }, TIMED_ALERT_MS);
    }
    function showError(message) {
        hideFeedback();
        const text = errorBox.querySelector(".users-feedback-text");
        if (text)
            text.textContent = message;
        errorBox.hidden = false;
    }
    function hideFeedback() {
        window.clearTimeout(successTimer);
        successBox.hidden = true;
        successBox.classList.remove("timed-alert");
        errorBox.hidden = true;
    }
    function hideAlert(alertBox) {
        alertBox.hidden = true;
        alertBox.textContent = "";
    }
    function setFieldError(name, message) {
        const input = inputs[name];
        const feedback = document.getElementById(`system-${name}-error`);
        input.classList.toggle("is-invalid", message !== null);
        if (message !== null) {
            input.setAttribute("aria-invalid", "true");
        }
        else {
            input.removeAttribute("aria-invalid");
        }
        if (feedback) {
            feedback.textContent = message !== null && message !== void 0 ? message : "";
            feedback.classList.toggle("d-block", message !== null);
        }
    }
    function setSecretVisible(toggle, input, visible) {
        var _a;
        input.type = visible ? "text" : "password";
        toggle.setAttribute("aria-pressed", visible ? "true" : "false");
        const label = (_a = toggle.dataset.label) !== null && _a !== void 0 ? _a : "password";
        toggle.setAttribute("aria-label", `${visible ? "Hide" : "Show"} ${label}`);
    }
    function applyEnvironmentBadge(element, environment) {
        element.hidden = environment === null;
        if (environment === null)
            return;
        element.textContent = ENVIRONMENTS[environment];
        element.classList.add(`is-${environment}`);
    }
    function setMeta(key, value) {
        const element = formModal.querySelector(`[data-meta="${key}"]`);
        if (element)
            element.textContent = value;
    }
    function setButtonLabel(button, label) {
        const element = button.querySelector(".users-button-label");
        if (element)
            element.textContent = label;
    }
    function setText(root, field, value) {
        const element = root.querySelector(`[data-field="${field}"]`);
        if (element)
            element.textContent = value;
    }
    function formatDateTime(value) {
        if (!value)
            return "—";
        return new Date(value).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    }
    function parseFilter(value) {
        return value === "production" || value === "test" || value === "legacy" ? value : "all";
    }
    function isListResponse(value) {
        if (typeof value !== "object" || value === null)
            return false;
        const candidate = value;
        return Array.isArray(candidate.data) && typeof candidate.meta === "object" && typeof candidate.counts === "object";
    }
    function byId(id) {
        const element = document.getElementById(id);
        if (!element) {
            throw new Error(`Missing #${id}`);
        }
        return element;
    }
    async function readJson(response) {
        const text = await response.text();
        if (text === "")
            return {};
        try {
            return JSON.parse(text);
        }
        catch {
            return {};
        }
    }
})();
