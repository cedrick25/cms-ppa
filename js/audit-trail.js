"use strict";
(() => {
    var _a, _b, _c, _d;
    const SOURCES = ["all", "uams", "cmis", "ppis"];
    const REQUEST_TIMEOUT_MS = 20000;
    const REFRESH_TIMEOUT_MS = 35000;
    const SEARCH_DELAY_MS = 300;
    const SOURCE_CLASS = {
        uams: "bg-gradient-primary",
        cmis: "bg-gradient-info",
        ppis: "bg-gradient-success",
    };
    const appElement = document.getElementById("audit-app");
    if (!(appElement instanceof HTMLElement) || !window.CmsApi || !window.CmsApi.token()) {
        return;
    }
    const app = appElement;
    const cmsApi = window.CmsApi;
    const signInUrl = (_a = app.dataset.signInUrl) !== null && _a !== void 0 ? _a : "sign-in.html";
    const heading = byId("audit-heading");
    const searchForm = byId("audit-search-form");
    const searchInput = byId("audit-search");
    const fromInput = byId("audit-from");
    const toInput = byId("audit-to");
    const filterButtons = Array.from(app.querySelectorAll("[data-source]"));
    const successBox = byId("audit-success");
    const warningBox = byId("audit-warning");
    const sourceStatus = byId("audit-source-status");
    const live = byId("audit-live");
    const loadingState = byId("audit-loading");
    const emptyState = byId("audit-empty");
    const noMatchState = byId("audit-no-match");
    const noMatchText = byId("audit-no-match-text");
    const loadErrorState = byId("audit-load-error");
    const loadErrorText = byId("audit-load-error-text");
    const tableWrap = byId("audit-table-wrap");
    const rowsBody = byId("audit-rows");
    const pagination = byId("audit-pagination");
    const rangeText = byId("audit-range");
    const prevButton = byId("audit-prev");
    const nextButton = byId("audit-next");
    const refreshButton = byId("audit-refresh");
    const refreshSpinner = byId("audit-refresh-spinner");
    const retryButton = byId("audit-retry");
    const query = new URLSearchParams(window.location.search);
    const state = {
        search: ((_b = query.get("search")) !== null && _b !== void 0 ? _b : "").slice(0, 100),
        source: parseSource(query.get("source")),
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
            const source = parseSource((_a = button.dataset.source) !== null && _a !== void 0 ? _a : null);
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
    byId("audit-clear").addEventListener("click", () => {
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
        (_d = box.querySelector(".users-feedback-close")) === null || _d === void 0 ? void 0 : _d.addEventListener("click", () => {
            box.hidden = true;
            heading.focus();
        });
    }
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
        await request(listUrl(), false);
    }
    async function refresh() {
        if (refreshing) {
            return;
        }
        refreshing = true;
        refreshButton.disabled = true;
        refreshSpinner.hidden = false;
        try {
            await request(refreshUrl(), true);
        }
        finally {
            refreshing = false;
            refreshButton.disabled = false;
            refreshSpinner.hidden = true;
        }
    }
    async function request(url, isRefresh) {
        listController === null || listController === void 0 ? void 0 : listController.abort();
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
        }
        catch {
            if (controller !== listController) {
                return;
            }
            if (isRefresh && hasRendered) {
                showRefreshProblem(timedOut ? -1 : 0, {});
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
        return withQuery(cmsApi.url("/audit-trail"));
    }
    function refreshUrl() {
        return withQuery(cmsApi.url("/audit-trail/refresh"));
    }
    function withQuery(url) {
        const queryString = currentQuery();
        return queryString === "" ? url : `${url}?${queryString}`;
    }
    function currentQuery() {
        const params = new URLSearchParams();
        if (state.search !== "")
            params.set("search", state.search);
        if (state.source !== "all")
            params.set("source", state.source);
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
            live.textContent = "Loading audit records…";
            return;
        }
        emptyState.hidden = true;
        noMatchState.hidden = true;
        tableWrap.hidden = true;
        pagination.hidden = true;
        loadingState.hidden = false;
    }
    function render(response, isRefresh) {
        var _a, _b, _c;
        hasRendered = true;
        loadingState.hidden = true;
        loadErrorState.hidden = true;
        for (const filter of SOURCES) {
            const count = app.querySelector(`[data-count="${filter}"]`);
            if (count) {
                count.textContent = String((_a = response.counts[filter]) !== null && _a !== void 0 ? _a : 0);
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
        rangeText.textContent = `Showing ${(_b = meta.from) !== null && _b !== void 0 ? _b : 0}–${(_c = meta.to) !== null && _c !== void 0 ? _c : 0} of ${meta.total} ${meta.total === 1 ? "record" : "records"}`;
        prevButton.disabled = meta.current_page <= 1;
        nextButton.disabled = meta.current_page >= meta.last_page;
        live.textContent = `${meta.total} ${meta.total === 1 ? "record" : "records"} found.`;
    }
    function renderSources(response) {
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
    function buildRow(record, timeZone) {
        var _a, _b, _c, _d, _e;
        const row = document.createElement("tr");
        row.append(cell("When", formatWhen(record.occurred_at, timeZone)), badgeCell(record), cell("Name", (_a = record.actor_name) !== null && _a !== void 0 ? _a : "Unknown user"), cell("Level", (_b = record.user_level) !== null && _b !== void 0 ? _b : "—"), cell("Field office", (_c = record.field_office) !== null && _c !== void 0 ? _c : "—"), cell("Module", (_d = record.module) !== null && _d !== void 0 ? _d : "—"), cell("Action", (_e = record.action) !== null && _e !== void 0 ? _e : "—", true));
        return row;
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
        td.dataset.label = "System";
        const badge = document.createElement("span");
        badge.className = `badge ${(_a = SOURCE_CLASS[record.source]) !== null && _a !== void 0 ? _a : "bg-gradient-secondary"}`;
        badge.textContent = record.source_label;
        td.append(badge);
        return td;
    }
    function showRefreshProblem(status, payload) {
        app.removeAttribute("aria-busy");
        loadingState.hidden = true;
        successBox.hidden = true;
        text(warningBox, ".users-feedback-text", refreshProblem(status, payload));
        warningBox.hidden = false;
        live.textContent = textContent(warningBox);
    }
    function refreshProblem(status, payload) {
        const message = messageOf(payload);
        if (status === 401)
            return message !== null && message !== void 0 ? message : "Your session has ended. Sign in again to refresh the systems audit trail.";
        if (status === 403)
            return "Your account isn't allowed to refresh the systems audit trail.";
        if (status === 422)
            return message !== null && message !== void 0 ? message : "Those filters aren't valid.";
        if (status === -1)
            return "The refresh took too long. Showing the records already loaded.";
        return message !== null && message !== void 0 ? message : "Couldn't refresh the systems audit trail. Showing the records already loaded.";
    }
    function textContent(root) {
        var _a, _b;
        return (_b = (_a = root.querySelector(".users-feedback-text")) === null || _a === void 0 ? void 0 : _a.textContent) !== null && _b !== void 0 ? _b : "";
    }
    function showLoadError(status, payload) {
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
            loadErrorText.textContent = message !== null && message !== void 0 ? message : "Your session has ended. Sign in again to view the systems audit trail.";
            retryButton.hidden = true;
            const link = document.createElement("a");
            link.className = "btn btn-outline-secondary btn-sm mb-0";
            link.href = signInUrl;
            link.textContent = "Sign in";
            retryButton.replaceWith(link);
        }
        else if (status === 403) {
            loadErrorText.textContent = "Your account isn't allowed to view the systems audit trail.";
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
        if (state.source !== "all")
            parts.push(`in ${state.source.toUpperCase()}`);
        if (state.from !== "" || state.to !== "")
            parts.push("in that date range");
        return parts.length > 0 ? `No records found ${parts.join(" ")}.` : "Try a different search or filter.";
    }
    function updateFilterButtons() {
        var _a;
        for (const button of filterButtons) {
            const selected = parseSource((_a = button.dataset.source) !== null && _a !== void 0 ? _a : null) === state.source;
            button.classList.toggle("is-active", selected);
            button.setAttribute("aria-pressed", selected ? "true" : "false");
        }
    }
    function parseSource(value) {
        return SOURCES.includes(value) ? value : "all";
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
    function text(root, selector, value) {
        const element = root.querySelector(selector);
        if (element) {
            element.textContent = value;
        }
    }
    function isAuditList(value) {
        if (typeof value !== "object" || value === null) {
            return false;
        }
        const candidate = value;
        return Array.isArray(candidate.data)
            && typeof candidate.meta === "object"
            && candidate.meta !== null
            && typeof candidate.counts === "object"
            && candidate.counts !== null
            && Array.isArray(candidate.sources);
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
