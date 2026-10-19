"use strict";
(() => {
    const POLL_MS = 10000;
    const REQUEST_TIMEOUT_MS = 15000;
    const TOAST_MS = 8000;
    const NEW_HIGHLIGHT_MS = 6000;
    const CATEGORY_LABELS = {
        system_status: "Website status",
        system_credentials: "Credentials",
        user_account: "User accounts",
    };
    const api = window.CmsApi;
    const panel = document.getElementById("notifications");
    if (!api || !api.token() || !(panel instanceof HTMLElement)) {
        return;
    }
    const cmsApi = api;
    const signInUrl = "sign-in.html";
    const heading = byId("notifications-title");
    const list = byId("notifications-list");
    const itemTemplate = byId("notification-item");
    const loading = byId("notifications-loading");
    const empty = byId("notifications-empty");
    const errorState = byId("notifications-error");
    const errorText = byId("notifications-error-text");
    const retry = byId("notifications-retry");
    const refreshError = byId("notifications-refresh-error");
    const live = byId("notifications-live");
    const markAll = byId("notifications-mark-all");
    const unreadPill = byId("notifications-unread-pill");
    const bell = byId("notifications-bell");
    const bellBadge = byId("notifications-bell-badge");
    const modal = byId("notification-modal");
    const modalTitle = byId("notification-modal-title");
    const modalCategory = byId("notification-modal-category");
    const modalTime = byId("notification-modal-time");
    const modalMessage = byId("notification-modal-message");
    const modalDetails = byId("notification-modal-details");
    const modalReadStatus = byId("notification-modal-read-status");
    const modalAction = byId("notification-modal-action");
    const toastContainer = byId("notification-toast-container");
    const toast = byId("notification-toast");
    const toastTitle = byId("notification-toast-title");
    const toastMessage = byId("notification-toast-message");
    const toastView = byId("notification-toast-view");
    let items = [];
    let unreadCount = 0;
    let timeZone;
    let knownIds = null;
    const pendingReads = new Set();
    const highlighted = new Set();
    let listController = null;
    let hasRendered = false;
    let stopped = false;
    let loadedAt = 0;
    let lastSuccess = null;
    let listEtag = null;
    let openId = null;
    let toastTarget = null;
    let returnFocusId = null;
    let afterClose = null;
    document.body.append(modal, toastContainer);
    modal.addEventListener("hidden.bs.modal", () => {
        var _a;
        openId = null;
        const action = afterClose;
        afterClose = null;
        if (action) {
            action();
            return;
        }
        const target = (_a = (returnFocusId ? itemButton(returnFocusId) : null)) !== null && _a !== void 0 ? _a : heading;
        returnFocusId = null;
        target.focus();
    });
    retry.addEventListener("click", () => void load());
    markAll.addEventListener("click", () => void markAllAsRead());
    unreadPill.addEventListener("click", focusPanel);
    bell.addEventListener("click", focusPanel);
    toastView.addEventListener("click", () => {
        bootstrap.Toast.getOrCreateInstance(toast).hide();
        const target = toastTarget ? items.find((item) => item.id === (toastTarget === null || toastTarget === void 0 ? void 0 : toastTarget.id)) : undefined;
        if (target) {
            openNotification(target, false);
        }
        else {
            focusPanel();
        }
    });
    modalAction.addEventListener("click", (event) => {
        if (modalAction.dataset.page !== "dashboard") {
            return;
        }
        event.preventDefault();
        afterClose = showSystemsCard;
        bootstrap.Modal.getOrCreateInstance(modal).hide();
    });
    void load();
    window.setInterval(() => {
        if (document.visibilityState === "visible") {
            void load();
        }
    }, POLL_MS);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && Date.now() - loadedAt >= POLL_MS) {
            void load();
        }
    });
    async function load() {
        if (stopped) {
            return;
        }
        listController === null || listController === void 0 ? void 0 : listController.abort();
        const current = new AbortController();
        listController = current;
        if (!hasRendered) {
            show(loading);
        }
        panel === null || panel === void 0 ? void 0 : panel.setAttribute("aria-busy", "true");
        const conditional = hasRendered && listEtag ? { "If-None-Match": listEtag } : undefined;
        const result = await request("/notifications", { cache: "no-store" }, current, conditional);
        if (current !== listController) {
            return;
        }
        panel === null || panel === void 0 ? void 0 : panel.setAttribute("aria-busy", "false");
        loadedAt = Date.now();
        if (result.status === 200 && isNotificationsResponse(result.payload)) {
            listEtag = result.etag;
            applyList(result.payload);
            return;
        }
        if (result.status === 304 && hasRendered) {
            lastSuccess = new Date();
            refreshError.hidden = true;
            render();
            return;
        }
        if (result.status === 401) {
            stopped = true;
        }
        if (hasRendered && lastSuccess && !stopped) {
            refreshError.textContent =
                `Couldn't check for new notifications. ${describeFailure(result.status, result.message)} Showing what was loaded at ${formatClock(lastSuccess)}.`;
            refreshError.hidden = false;
            return;
        }
        errorText.textContent = `Couldn't load notifications. ${describeFailure(result.status, result.message)}`;
        show(errorState);
        if (stopped) {
            replaceWithSignInLink(retry);
        }
    }
    function applyList(response) {
        timeZone = safeTimeZone(response.meta.timezone);
        const serverUnreadPending = response.data.filter((item) => pendingReads.has(item.id) && !item.is_read).length;
        items = response.data.map((item) => (pendingReads.has(item.id) ? { ...item, is_read: true } : item));
        unreadCount = Math.max(0, response.meta.unread_count - serverUnreadPending);
        const arrived = knownIds === null ? [] : items.filter((item) => !item.is_read && !(knownIds === null || knownIds === void 0 ? void 0 : knownIds.has(item.id)));
        knownIds = new Set(items.map((item) => item.id));
        for (const item of arrived) {
            highlighted.add(item.id);
            window.setTimeout(() => {
                var _a;
                highlighted.delete(item.id);
                (_a = itemButton(item.id)) === null || _a === void 0 ? void 0 : _a.classList.remove("is-new");
            }, NEW_HIGHLIGHT_MS);
        }
        hasRendered = true;
        lastSuccess = new Date();
        refreshError.hidden = true;
        render();
        if (arrived.length > 0) {
            if (!list.contains(document.activeElement)) {
                list.scrollTop = 0;
            }
            announceArrivals(arrived);
        }
    }
    function render() {
        var _a;
        const now = new Date();
        const active = document.activeElement;
        const focusedId = active instanceof HTMLElement && list.contains(active) ? active.dataset.id : undefined;
        const scrollTop = list.scrollTop;
        list.replaceChildren(...items.map((item) => buildItem(item, now)));
        show(items.length === 0 ? empty : list);
        list.scrollTop = scrollTop;
        if (focusedId) {
            (_a = itemButton(focusedId)) === null || _a === void 0 ? void 0 : _a.focus({ preventScroll: true });
        }
        const hasUnread = unreadCount > 0;
        markAll.hidden = !hasUnread;
        unreadPill.hidden = !hasUnread;
        unreadPill.textContent = `${unreadCount} unread ${unreadCount === 1 ? "notification" : "notifications"}`;
        bellBadge.hidden = !hasUnread;
        bellBadge.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
        bellBadge.setAttribute("aria-label", `${unreadCount} unread`);
        bell.title = hasUnread ? `${unreadCount} unread notifications` : "No unread notifications";
        if (openId) {
            const open = items.find((item) => item.id === openId);
            if (open) {
                fillReadStatus(open);
            }
        }
    }
    function itemButton(id) {
        var _a;
        return (_a = Array.from(list.querySelectorAll(".notification-item")).find((button) => button.dataset.id === id)) !== null && _a !== void 0 ? _a : null;
    }
    function buildItem(item, now) {
        const fragment = itemTemplate.content.cloneNode(true);
        const li = fragment.querySelector("li");
        const button = field(li, "button");
        const icon = iconFor(item);
        button.dataset.id = item.id;
        button.dataset.tone = toneFor(item);
        button.classList.toggle("is-unread", !item.is_read);
        button.classList.toggle("is-new", highlighted.has(item.id));
        for (const svg of Array.from(button.querySelectorAll("[data-icon]"))) {
            if (svg.dataset.icon !== icon) {
                svg.remove();
            }
        }
        field(li, "title").textContent = item.title;
        field(li, "message").textContent = item.message;
        const time = field(li, "time");
        const created = new Date(item.created_at);
        time.dateTime = item.created_at;
        time.textContent = formatRelative(created, now);
        time.title = formatTime(created);
        field(li, "dot").hidden = item.is_read;
        field(li, "state").textContent = item.is_read ? "Read." : "Unread.";
        button.addEventListener("click", () => openNotification(item, true));
        return li;
    }
    function openNotification(item, fromList) {
        var _a;
        openId = item.id;
        returnFocusId = fromList ? item.id : null;
        delete modalReadStatus.dataset.error;
        const created = new Date(item.created_at);
        modalTitle.textContent = item.title;
        modalCategory.textContent = (_a = CATEGORY_LABELS[item.category]) !== null && _a !== void 0 ? _a : "Notification";
        modalTime.dateTime = item.created_at;
        modalTime.textContent = formatTime(created);
        modalMessage.textContent = item.message;
        const details = [];
        if (item.performed_by)
            details.push(["By", item.performed_by]);
        if (item.changed.length > 0)
            details.push(["Changed", item.changed.join(", ")]);
        modalDetails.replaceChildren(...details.flatMap(([label, value]) => {
            const term = document.createElement("dt");
            term.textContent = label;
            const description = document.createElement("dd");
            description.textContent = value;
            return [term, description];
        }));
        modalDetails.hidden = details.length === 0;
        fillAction(item.link);
        fillReadStatus(item);
        bootstrap.Modal.getOrCreateInstance(modal).show();
        if (!item.is_read) {
            void markAsRead(item.id);
        }
    }
    function fillAction(link) {
        var _a, _b;
        const can = (_a = window.CMS_USER) === null || _a === void 0 ? void 0 : _a.can;
        const target = link === null ? null
            : link.page === "dashboard" ? { label: "View website status", href: "#dashboard-systems" }
                : link.page === "systems" && (can === null || can === void 0 ? void 0 : can.manage_systems) !== false ? { label: "Open in Credentials", href: withSearch("systems.html", link.search) }
                    : link.page === "users" && (can === null || can === void 0 ? void 0 : can.manage_users) !== false ? { label: "Open in Users", href: withSearch("users.html", link.search) }
                        : null;
        modalAction.hidden = target === null;
        modalAction.dataset.page = (_b = link === null || link === void 0 ? void 0 : link.page) !== null && _b !== void 0 ? _b : "";
        if (target) {
            modalAction.textContent = target.label;
            modalAction.href = target.href;
        }
    }
    function fillReadStatus(item) {
        if (modalReadStatus.dataset.error === item.id) {
            return;
        }
        modalReadStatus.textContent = item.is_read ? "Marked as read." : "Unread.";
        modalReadStatus.classList.remove("is-error");
    }
    async function markAsRead(id) {
        var _a;
        const item = items.find((candidate) => candidate.id === id);
        if (!item || item.is_read || pendingReads.has(id)) {
            return;
        }
        pendingReads.add(id);
        delete modalReadStatus.dataset.error;
        item.is_read = true;
        unreadCount = Math.max(0, unreadCount - 1);
        render();
        const result = await request(`/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });
        pendingReads.delete(id);
        const latest = items.find((candidate) => candidate.id === id);
        if (result.status === 200 && result.payload && typeof ((_a = result.payload.meta) === null || _a === void 0 ? void 0 : _a.unread_count) === "number") {
            unreadCount = result.payload.meta.unread_count;
            if (latest)
                latest.read_at = result.payload.notification.read_at;
            render();
            return;
        }
        if (result.status === 404) {
            items = items.filter((candidate) => candidate.id !== id);
            render();
            return;
        }
        if (latest && latest.is_read) {
            latest.is_read = false;
            unreadCount += 1;
        }
        if (openId === id) {
            modalReadStatus.dataset.error = id;
            modalReadStatus.textContent = `Couldn't mark this as read, so it stays unread. ${describeFailure(result.status, result.message)}`;
            modalReadStatus.classList.add("is-error");
        }
        render();
    }
    async function markAllAsRead() {
        markAll.disabled = true;
        const result = await request("/notifications/read-all", { method: "POST" });
        markAll.disabled = false;
        if (result.status === 200) {
            for (const item of items) {
                item.is_read = true;
            }
            unreadCount = 0;
            render();
            live.textContent = "All notifications marked as read.";
            heading.focus();
            return;
        }
        refreshError.textContent = `Couldn't mark notifications as read. ${describeFailure(result.status, result.message)}`;
        refreshError.hidden = false;
    }
    function announceArrivals(arrived) {
        const newest = arrived[0];
        toastTarget = arrived.length === 1 ? newest : null;
        toastTitle.textContent = arrived.length === 1 ? "New notification" : `${arrived.length} new notifications`;
        toastMessage.textContent = arrived.length === 1 ? newest.title : `Latest: ${newest.title}`;
        toastView.textContent = arrived.length === 1 ? "View" : "Show all";
        bootstrap.Toast.getOrCreateInstance(toast, { delay: TOAST_MS }).show();
        live.textContent = arrived.length === 1
            ? `New notification: ${newest.title}.`
            : `${arrived.length} new notifications. Latest: ${newest.title}.`;
    }
    function focusPanel() {
        panel === null || panel === void 0 ? void 0 : panel.scrollIntoView({ block: "center" });
        heading.focus({ preventScroll: true });
    }
    function showSystemsCard() {
        const card = document.getElementById("dashboard-systems");
        if (!card) {
            heading.focus();
            return;
        }
        card.setAttribute("tabindex", "-1");
        card.scrollIntoView({ block: "start" });
        card.focus({ preventScroll: true });
    }
    function show(visible) {
        for (const element of [loading, empty, errorState, list]) {
            element.hidden = element !== visible;
        }
    }
    async function request(path, init, controller = new AbortController(), extraHeaders) {
        let timedOut = false;
        const timer = window.setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(cmsApi.url(path), { ...init, signal: controller.signal, headers: cmsApi.headers(extraHeaders) });
            const payload = await readJson(response);
            const message = typeof payload.message === "string" ? payload.message : null;
            return { status: response.status, payload: payload, message, etag: response.headers.get("ETag") };
        }
        catch {
            return { status: timedOut ? -1 : 0, payload: null, message: null, etag: null };
        }
        finally {
            window.clearTimeout(timer);
        }
    }
    function iconFor(item) {
        if (item.category === "system_status")
            return item.event === "recovered" ? "recovered" : "down";
        if (item.category === "system_credentials")
            return "credentials";
        return "account";
    }
    function toneFor(item) {
        if (item.category === "system_status")
            return item.event === "recovered" ? "success" : "danger";
        if (item.category === "system_credentials")
            return "primary";
        return "info";
    }
    function withSearch(page, search) {
        return search ? `${page}?search=${encodeURIComponent(search.slice(0, 100))}` : page;
    }
    function describeFailure(status, message) {
        if (status === 401)
            return `${message !== null && message !== void 0 ? message : "Your session has ended."} Sign in again to continue.`;
        if (status === 429)
            return "Too many requests. It will try again shortly.";
        if (status === -1)
            return "The server took too long to respond.";
        if (status === 0)
            return "Couldn't connect to the server. Check your connection.";
        return `Something went wrong on the server (Error ${status}).`;
    }
    function replaceWithSignInLink(button) {
        const link = document.createElement("a");
        link.href = signInUrl;
        link.className = button.className;
        link.textContent = "Go to sign in";
        button.replaceWith(link);
    }
    function safeTimeZone(zone) {
        try {
            new Intl.DateTimeFormat(undefined, { timeZone: zone });
            return zone;
        }
        catch {
            return undefined;
        }
    }
    function formatTime(date) {
        return date.toLocaleString(undefined, { timeZone, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    }
    function formatClock(date) {
        return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    }
    function formatRelative(date, now) {
        const minutes = Math.floor((now.getTime() - date.getTime()) / 60000);
        if (minutes < 1)
            return "Just now";
        if (minutes < 60)
            return `${minutes} min ago`;
        const day = (value) => value.toLocaleDateString("en-CA", { timeZone });
        return day(date) === day(now)
            ? date.toLocaleTimeString(undefined, { timeZone, hour: "numeric", minute: "2-digit" })
            : date.toLocaleString(undefined, { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    }
    function isNotificationsResponse(value) {
        if (typeof value !== "object" || value === null)
            return false;
        const candidate = value;
        return Array.isArray(candidate.data) && typeof candidate.meta === "object" && candidate.meta !== null
            && typeof candidate.meta.unread_count === "number";
    }
    function field(root, name) {
        const element = root.querySelector(`[data-field="${name}"]`);
        if (!element) {
            throw new Error(`Missing [data-field="${name}"]`);
        }
        return element;
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
