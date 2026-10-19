"use strict";
(() => {
    var _a, _b, _c, _d;
    const MODULES = ["all", "session", "credentials", "users"];
    const REQUEST_TIMEOUT_MS = 20000;
    const SEARCH_DELAY_MS = 300;
    const MODULE_CLASS = {
        session: "bg-gradient-info",
        credentials: "bg-gradient-primary",
        users: "bg-gradient-success",
    };
    const appElement = document.getElementById("cms-audit-app");
    if (!(appElement instanceof HTMLElement) || !window.CmsApi || !window.CmsApi.token()) {
        return;
    }
    const app = appElement;
    const cmsApi = window.CmsApi;
    const signInUrl = (_a = app.dataset.signInUrl) !== null && _a !== void 0 ? _a : "sign-in.html";
    const heading = byId("cms-audit-heading");
    const searchForm = byId("cms-audit-search-form");
    const searchInput = byId("cms-audit-search");
    const fromInput = byId("cms-audit-from");
    const toInput = byId("cms-audit-to");
    const filterButtons = Array.from(app.querySelectorAll("[data-module]"));
    const warningBox = byId("cms-audit-warning");
    const live = byId("cms-audit-live");
    const loadingState = byId("cms-audit-loading");
    const emptyState = byId("cms-audit-empty");
    const noMatchState = byId("cms-audit-no-match");
    const noMatchText = byId("cms-audit-no-match-text");
    const loadErrorState = byId("cms-audit-load-error");
    const loadErrorText = byId("cms-audit-load-error-text");
    const tableWrap = byId("cms-audit-table-wrap");
    const rowsBody = byId("cms-audit-rows");
    const pagination = byId("cms-audit-pagination");
    const rangeText = byId("cms-audit-range");
    const prevButton = byId("cms-audit-prev");
    const nextButton = byId("cms-audit-next");
    const refreshButton = byId("cms-audit-refresh");
    const refreshSpinner = byId("cms-audit-refresh-spinner");
    const retryButton = byId("cms-audit-retry");
    const query = new URLSearchParams(window.location.search);
    const state = {
        search: ((_b = query.get("search")) !== null && _b !== void 0 ? _b : "").slice(0, 100),
        module: parseModule(query.get("module")),
        from: parseDate(query.get("from")),
        to: parseDate(query.get("to")),
        page: Math.max(1, Number.parseInt((_c = query.get("page")) !== null && _c !== void 0 ? _c : "1", 10) || 1),
    };
    let listController = null;
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
            var _a;
            const moduleName = parseModule((_a = button.dataset.module) !== null && _a !== void 0 ? _a : null);
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
    byId("cms-audit-clear").addEventListener("click", () => {
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
    (_d = warningBox.querySelector(".users-feedback-close")) === null || _d === void 0 ? void 0 : _d.addEventListener("click", () => {
        warningBox.hidden = true;
        heading.focus();
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
    function applyDates() {
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
    async function load() {
        await request(false);
    }
    async function refresh() {
        if (refreshing) {
            return;
        }
        refreshing = true;
        refreshButton.disabled = true;
        refreshSpinner.hidden = false;
        try {
            await request(true);
        }
        finally {
            refreshing = false;
            refreshButton.disabled = false;
            refreshSpinner.hidden = true;
        }
    }
    async function request(isRefresh) {
        listController === null || listController === void 0 ? void 0 : listController.abort();
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
        }
        catch {
            if (controller !== listController) {
                return;
            }
            if (isRefresh && hasRendered) {
                showWarning(timedOut ? "The refresh took too long. Showing the records already loaded." : "Couldn't refresh the CMS audit trail. Showing the records already loaded.");
                return;
            }
            showLoadError(timedOut ? -1 : 0, {});
        }
        finally {
            window.clearTimeout(timer);
            if (controller === listController) {
                app.removeAttribute("aria-busy");
                tableWrap.classList.remove("is-loading");
            }
        }
    }
    function listUrl() {
        const queryString = currentQuery();
        const url = cmsApi.url("/cms-audit-trail");
        return queryString === "" ? url : `${url}?${queryString}`;
    }
    function currentQuery() {
        const params = new URLSearchParams();
        if (state.search !== "")
            params.set("search", state.search);
        if (state.module !== "all")
            params.set("module", state.module);
        if (state.from !== "")
            params.set("from", state.from);
        if (state.to !== "")
            params.set("to", state.to);
        if (state.page > 1)
            params.set("page", String(state.page));
        return params.toString();
    }
    function rememberQuery() {
        const queryString = currentQuery();
        window.history.replaceState(null, "", queryString === "" ? window.location.pathname : `?${queryString}`);
    }
    function showLoading() {
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
    function render(response) {
        var _a, _b, _c;
        hasRendered = true;
        warningBox.hidden = true;
        loadingState.hidden = true;
        loadErrorState.hidden = true;
        for (const filter of MODULES) {
            const count = app.querySelector(`[data-count="${filter}"]`);
            if (count) {
                count.textContent = String((_a = response.counts[filter]) !== null && _a !== void 0 ? _a : 0);
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
        rangeText.textContent = `Showing ${(_b = meta.from) !== null && _b !== void 0 ? _b : 0}–${(_c = meta.to) !== null && _c !== void 0 ? _c : 0} of ${meta.total} ${meta.total === 1 ? "record" : "records"}`;
        prevButton.disabled = meta.current_page <= 1;
        nextButton.disabled = meta.current_page >= meta.last_page;
        live.textContent = `${meta.total} ${meta.total === 1 ? "record" : "records"} found.`;
    }
    function buildRow(record, timeZone) {
        const row = document.createElement("tr");
        row.append(cell("When", formatWhen(record.occurred_at, timeZone)), cell("User", person(record)), badgeCell(record), cell("Action", record.action_label), cell("Detail", detail(record), true));
        return row;
    }
    function person(record) {
        var _a;
        const name = (_a = record.actor_name) !== null && _a !== void 0 ? _a : "Unknown user";
        return record.actor_username ? `${name} (${record.actor_username})` : name;
    }
    function detail(record) {
        var _a;
        const summary = (_a = record.summary) !== null && _a !== void 0 ? _a : "—";
        if (record.changed.length === 0) {
            return summary;
        }
        return `${summary} Changed: ${record.changed.join(", ")}.`;
    }
    function cell(label, value, action = false) {
        const td = document.createElement("td");
        td.dataset.label = label;
        if (action) {
            td.className = "audit-action";
        }
        td.textContent = value;
        return td;
    }
    function badgeCell(record) {
        var _a;
        const td = document.createElement("td");
        td.dataset.label = "Module";
        const badge = document.createElement("span");
        badge.className = `badge ${(_a = MODULE_CLASS[record.module]) !== null && _a !== void 0 ? _a : "bg-gradient-secondary"}`;
        badge.textContent = record.module_label;
        td.append(badge);
        return td;
    }
    function showWarning(message) {
        app.removeAttribute("aria-busy");
        loadingState.hidden = true;
        const textNode = warningBox.querySelector(".users-feedback-text");
        if (textNode) {
            textNode.textContent = message;
        }
        warningBox.hidden = false;
        live.textContent = message;
    }
    function refreshProblem(status, payload) {
        const message = messageOf(payload);
        if (status === 401)
            return message !== null && message !== void 0 ? message : "Your session has ended. Sign in again to refresh the CMS audit trail.";
        if (status === 403)
            return "Your account isn't allowed to refresh the CMS audit trail.";
        if (status === 422)
            return message !== null && message !== void 0 ? message : "Those filters aren't valid.";
        return message !== null && message !== void 0 ? message : "Couldn't refresh the CMS audit trail. Showing the records already loaded.";
    }
    function showLoadError(status, payload) {
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
            loadErrorText.textContent = message !== null && message !== void 0 ? message : "Your session has ended. Sign in again to view the CMS audit trail.";
            retryButton.hidden = true;
            const link = document.createElement("a");
            link.className = "btn btn-outline-secondary btn-sm mb-0";
            link.href = signInUrl;
            link.textContent = "Sign in";
            retryButton.replaceWith(link);
        }
        else if (status === 403) {
            loadErrorText.textContent = "Your account isn't allowed to view the CMS audit trail.";
            retryButton.hidden = true;
        }
        else if (status === 422) {
            loadErrorText.textContent = message !== null && message !== void 0 ? message : "Those filters aren't valid.";
        }
        else if (status === -1) {
            loadErrorText.textContent = "The request took too long. Try again.";
        }
        else {
            loadErrorText.textContent = message !== null && message !== void 0 ? message : "Check your connection and try again.";
        }
        live.textContent = loadErrorText.textContent;
    }
    function describeNoMatch() {
        const parts = [];
        if (state.search !== "")
            parts.push(`matching “${state.search}”`);
        if (state.module !== "all")
            parts.push(`in ${moduleLabel(state.module)}`);
        if (state.from !== "" || state.to !== "")
            parts.push("in that date range");
        return parts.length > 0 ? `No records found ${parts.join(" ")}.` : "Try a different search or filter.";
    }
    function moduleLabel(moduleName) {
        if (moduleName === "session")
            return "Sign-in";
        if (moduleName === "credentials")
            return "Credentials";
        if (moduleName === "users")
            return "Users";
        return "All";
    }
    function updateFilterButtons() {
        var _a;
        for (const button of filterButtons) {
            const selected = parseModule((_a = button.dataset.module) !== null && _a !== void 0 ? _a : null) === state.module;
            button.classList.toggle("is-active", selected);
            button.setAttribute("aria-pressed", selected ? "true" : "false");
        }
    }
    function parseModule(value) {
        return MODULES.includes(value) ? value : "all";
    }
    function parseDate(value) {
        return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
    }
    function formatWhen(value, timeZone) {
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
    function safeTimeZone(timeZone) {
        try {
            new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
            return timeZone;
        }
        catch {
            return undefined;
        }
    }
    function messageOf(payload) {
        if (typeof payload !== "object" || payload === null || !("message" in payload)) {
            return null;
        }
        const message = payload.message;
        return typeof message === "string" && message !== "" ? message : null;
    }
    function isCmsAuditList(value) {
        if (typeof value !== "object" || value === null) {
            return false;
        }
        const candidate = value;
        return Array.isArray(candidate.data)
            && typeof candidate.meta === "object"
            && candidate.meta !== null
            && typeof candidate.counts === "object"
            && candidate.counts !== null;
    }
    function byId(id) {
        const element = document.getElementById(id);
        if (!element) {
            throw new Error(`Missing #${id}`);
        }
        return element;
    }
    async function readJson(response) {
        const textBody = await response.text();
        if (textBody === "") {
            return {};
        }
        try {
            return JSON.parse(textBody);
        }
        catch {
            return {};
        }
    }
})();
