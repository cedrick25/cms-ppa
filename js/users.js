"use strict";
(() => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const REQUEST_TIMEOUT_MS = 20000;
    const TIMED_ALERT_MS = 3000;
    const SEARCH_DELAY_MS = 300;
    const USERNAME_PATTERN = /^[a-z0-9._-]+$/;
    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const STATUS_FILTERS = ["all", "active", "disabled"];
    const NAME_PARTS = ["first_name", "middle_name", "last_name", "suffix"];
    const EDIT_FIELDS = [...NAME_PARTS, "email", "username", "role"];
    const ROLES = { administrator: "Administrator", user: "User" };
    const PASSWORD_FIELDS = ["password", "password_confirmation"];
    const FULL_NAME_MAX = 100;
    const FULL_NAME_TOO_LONG = "The full name (first, middle, and last name plus suffix) must be 100 characters or fewer in total.";
    const appElement = document.getElementById("users-app");
    if (!(appElement instanceof HTMLElement) || typeof bootstrap === "undefined") {
        return;
    }
    const app = appElement;
    if (!window.CmsApi || !window.CmsApi.token()) {
        return;
    }
    const listUrl = window.CmsApi.url("/users");
    const baseUrl = window.CmsApi.url("/users");
    const signInUrl = (_c = app.dataset.signInUrl) !== null && _c !== void 0 ? _c : "sign-in.html";
    const heading = byId("users-heading");
    const searchForm = byId("users-search-form");
    const searchInput = byId("users-search");
    const filterButtons = Array.from(app.querySelectorAll("[data-status]"));
    const successBox = byId("users-success");
    const errorBox = byId("users-error");
    const live = byId("users-live");
    const loadingState = byId("users-loading");
    const emptyState = byId("users-empty");
    const noMatchState = byId("users-no-match");
    const noMatchText = byId("users-no-match-text");
    const loadErrorState = byId("users-load-error");
    const loadErrorText = byId("users-load-error-text");
    const tableWrap = byId("users-table-wrap");
    const rowsBody = byId("users-rows");
    const rowTemplate = byId("users-row-template");
    const pagination = byId("users-pagination");
    const rangeText = byId("users-range");
    const prevButton = byId("users-prev");
    const nextButton = byId("users-next");
    const editModal = byId("user-edit-modal");
    const editForm = byId("user-edit-form");
    const editAlert = byId("user-edit-alert");
    const editInputs = {};
    for (const name of EDIT_FIELDS) {
        editInputs[name] = byId(`edit-${name}`);
    }
    const nameSplitNote = byId("edit-name-split-note");
    const roleHint = byId("edit-role-hint");
    const passwordModal = byId("user-password-modal");
    const passwordForm = byId("user-password-form");
    const passwordAlert = byId("user-password-alert");
    const passwordInputs = {
        password: byId("reset-password"),
        password_confirmation: byId("reset-password_confirmation"),
    };
    const statusModal = byId("user-status-modal");
    const statusForm = byId("user-status-form");
    const statusAlert = byId("user-status-alert");
    const statusTitle = byId("user-status-title");
    const statusEffect = byId("user-status-effect");
    const statusSubmit = byId("user-status-submit");
    const removeModal = byId("user-remove-modal");
    const removeForm = byId("user-remove-form");
    const removeAlert = byId("user-remove-alert");
    const removeInput = byId("remove-confirm");
    const removeSubmit = byId("user-remove-submit");
    const query = new URLSearchParams(window.location.search);
    const state = {
        search: ((_f = query.get("search")) !== null && _f !== void 0 ? _f : "").slice(0, 100),
        status: parseStatus(query.get("status")),
        page: Math.max(1, Number.parseInt((_g = query.get("page")) !== null && _g !== void 0 ? _g : "1", 10) || 1),
    };
    const records = new Map();
    let listController = null;
    let hasRendered = false;
    let searchTimer = 0;
    let activeUser = null;
    let busyModal = null;
    let focusAfterClose = null;
    for (const modal of [editModal, passwordModal, statusModal, removeModal]) {
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
            const status = parseStatus((_a = button.dataset.status) !== null && _a !== void 0 ? _a : null);
            if (status === state.status) {
                return;
            }
            state.status = status;
            state.page = 1;
            updateFilterButtons();
            void load();
        });
    }
    byId("users-clear").addEventListener("click", () => {
        searchInput.value = "";
        state.search = "";
        state.status = "all";
        state.page = 1;
        updateFilterButtons();
        void load();
        searchInput.focus();
    });
    byId("users-retry").addEventListener("click", () => void load());
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
        (_h = box.querySelector(".users-feedback-close")) === null || _h === void 0 ? void 0 : _h.addEventListener("click", () => {
            box.hidden = true;
            heading.focus();
        });
    }
    rowsBody.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }
        const button = target.closest("button[data-action]");
        const row = button === null || button === void 0 ? void 0 : button.closest("tr[data-user-id]");
        const record = row ? records.get(Number(row.dataset.userId)) : undefined;
        if (!button || !record) {
            return;
        }
        switch (button.dataset.action) {
            case "edit":
                openEdit(record, button);
                break;
            case "password":
                if (record.is_current_user) {
                    const updateAccount = window.CmsUpdateAccount;
                    if (updateAccount)
                        void updateAccount.open(button);
                }
                else {
                    openPassword(record, button);
                }
                break;
            case "status":
                openStatus(record, button);
                break;
            case "remove":
                openRemove(record, button);
                break;
        }
    });
    for (const name of EDIT_FIELDS) {
        editInputs[name].addEventListener("input", () => {
            if (editInputs[name].classList.contains("is-invalid")) {
                setFieldError(editInputs[name], `edit-${name}-error`, validateEditField(name));
            }
        });
    }
    editForm.addEventListener("submit", (event) => {
        event.preventDefault();
        void submitEdit();
    });
    for (const name of PASSWORD_FIELDS) {
        passwordInputs[name].addEventListener("input", () => {
            if (passwordInputs[name].classList.contains("is-invalid")) {
                setFieldError(passwordInputs[name], `reset-${name}-error`, validatePasswordField(name));
            }
        });
    }
    passwordForm.addEventListener("submit", (event) => {
        event.preventDefault();
        void submitPassword();
    });
    statusForm.addEventListener("submit", (event) => {
        event.preventDefault();
        void submitStatus();
    });
    removeInput.addEventListener("input", () => {
        setFieldError(removeInput, "remove-confirm-error", null);
        removeSubmit.disabled = !confirmationMatches();
    });
    removeForm.addEventListener("submit", (event) => {
        event.preventDefault();
        void submitRemove();
    });
    document.addEventListener("cms:account-updated", () => void load());
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
        if (state.status !== "all")
            params.set("status", state.status);
        if (state.page > 1)
            params.set("page", String(state.page));
        const queryString = params.toString();
        window.history.replaceState(null, "", queryString === "" ? window.location.pathname : `?${queryString}`);
        showLoading();
        try {
            const response = await fetch(queryString === "" ? listUrl : `${listUrl}?${queryString}`, {
                signal: controller.signal,
                headers: window.CmsApi.headers(),
            });
            const payload = await readJson(response);
            if (controller !== listController) {
                return;
            }
            if (!response.ok || !isListResponse(payload)) {
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
        catch (_a) {
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
            }
        }
    }
    function showLoading() {
        app.setAttribute("aria-busy", "true");
        loadErrorState.hidden = true;
        if (hasRendered && !tableWrap.hidden) {
            tableWrap.classList.add("is-loading");
            live.textContent = "Loading users…";
            return;
        }
        emptyState.hidden = true;
        noMatchState.hidden = true;
        tableWrap.hidden = true;
        pagination.hidden = true;
        loadingState.hidden = false;
    }
    function render(response) {
        var _a, _b;
        hasRendered = true;
        loadingState.hidden = true;
        loadErrorState.hidden = true;
        for (const filter of STATUS_FILTERS) {
            const count = app.querySelector(`[data-count="${filter}"]`);
            if (count) {
                count.textContent = String(response.counts[filter]);
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
            live.textContent = "No users registered yet.";
            return;
        }
        if (response.data.length === 0) {
            noMatchText.textContent = describeNoMatch();
            live.textContent = "No users match the current search or filter.";
            return;
        }
        for (const user of response.data) {
            records.set(user.id, user);
            rowsBody.append(buildRow(user));
        }
        rangeText.textContent = `Showing ${(_a = meta.from) !== null && _a !== void 0 ? _a : 0}–${(_b = meta.to) !== null && _b !== void 0 ? _b : 0} of ${meta.total} ${meta.total === 1 ? "user" : "users"}`;
        prevButton.disabled = meta.current_page <= 1;
        nextButton.disabled = meta.current_page >= meta.last_page;
        live.textContent = `${meta.total} ${meta.total === 1 ? "user" : "users"} found.`;
    }
    function buildRow(user) {
        const fragment = rowTemplate.content.cloneNode(true);
        const row = fragment.querySelector("tr");
        row.dataset.userId = String(user.id);
        row.classList.toggle("is-disabled", user.status === "disabled");
        setText(row, "initial", initialOf(user.name));
        setText(row, "name", user.name);
        setText(row, "username", user.username);
        setText(row, "email", user.email);
        const role = row.querySelector('[data-field="role"]');
        if (role) {
            role.textContent = roleLabel(user.role);
            role.classList.toggle("is-administrator", user.role === "administrator");
        }
        const status = row.querySelector('[data-field="status"]');
        if (status) {
            applyStatusBadge(status, user.status);
        }
        const created = row.querySelector('[data-field="created"]');
        if (created) {
            created.textContent = formatDate(user.created_at);
            if (user.created_at) {
                created.dateTime = user.created_at;
            }
        }
        const you = row.querySelector('[data-field="you"]');
        const selfNote = row.querySelector('[data-field="self-note"]');
        const editButton = row.querySelector('[data-action="edit"]');
        const passwordButton = row.querySelector('[data-action="password"]');
        if (passwordButton) {
            if (user.is_current_user) {
                passwordButton.textContent = "Update account";
                passwordButton.setAttribute("aria-label", "Update your own account details or password");
            }
            else if (user.can && user.can.reset_password) {
                passwordButton.setAttribute("aria-label", `Reset password for ${user.name}`);
            }
            else {
                passwordButton.remove();
            }
        }
        const statusButton = row.querySelector('[data-action="status"]');
        const removeButton = row.querySelector('[data-action="remove"]');
        editButton === null || editButton === void 0 ? void 0 : editButton.setAttribute("aria-label", `View or update ${user.name}`);
        if (user.is_current_user) {
            if (you)
                you.hidden = false;
            if (selfNote)
                selfNote.hidden = false;
            statusButton === null || statusButton === void 0 ? void 0 : statusButton.remove();
            removeButton === null || removeButton === void 0 ? void 0 : removeButton.remove();
        }
        else {
            if (statusButton) {
                const disabling = user.status === "active";
                statusButton.textContent = disabling ? "Disable" : "Enable";
                statusButton.classList.toggle("btn-outline-warning", disabling);
                statusButton.classList.toggle("btn-outline-success", !disabling);
                statusButton.setAttribute("aria-label", `${disabling ? "Disable" : "Enable"} account for ${user.name}`);
            }
            removeButton === null || removeButton === void 0 ? void 0 : removeButton.setAttribute("aria-label", `Remove account for ${user.name}`);
        }
        return row;
    }
    function showLoadError(status, payload) {
        var _a;
        successBox.hidden = true;
        loadingState.hidden = true;
        emptyState.hidden = true;
        noMatchState.hidden = true;
        tableWrap.hidden = true;
        pagination.hidden = true;
        loadErrorState.hidden = false;
        if (status === 401) {
            loadErrorText.textContent = (_a = payload.message) !== null && _a !== void 0 ? _a : "Your session has ended. Sign in again to manage users.";
            replaceRetryWithSignIn();
        }
        else if (status === 403) {
            loadErrorText.textContent = "Your account isn't allowed to manage users.";
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
        live.textContent = `Couldn't load users. ${loadErrorText.textContent}`;
    }
    function replaceRetryWithSignIn() {
        const retry = document.getElementById("users-retry");
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
        if (state.status !== "all")
            parts.push(`with status ${state.status === "active" ? "Active" : "Disabled"}`);
        return parts.length > 0 ? `No accounts found ${parts.join(" ")}.` : "Try a different search or filter.";
    }
    function updateFilterButtons() {
        for (const button of filterButtons) {
            const active = button.dataset.status === state.status;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", active ? "true" : "false");
        }
    }
    function openEdit(user, trigger) {
        activeUser = user;
        focusAfterClose = trigger;
        hideAlert(editAlert);
        byId("user-edit-title").textContent = `${user.name}`;
        const legacyName = !user.last_name;
        const parts = legacyName ? guessNameParts(user.name) : user;
        for (const name of EDIT_FIELDS) {
            const value = NAME_PARTS.includes(name) ? parts[name] : user[name];
            editInputs[name].value = value !== null && value !== void 0 ? value : "";
            setFieldError(editInputs[name], `edit-${name}-error`, null);
        }
        nameSplitNote.hidden = !legacyName;
        setEditMeta("legacy-name", user.name);
        roleHint.textContent = user.is_current_user
            ? "If you change your own role to User, you lose access to user management as soon as you save."
            : "Administrators can register and manage accounts. Their passwords can only be changed by themselves.";
        const statusBadge = editModal.querySelector('[data-edit="status"]');
        if (statusBadge)
            applyStatusBadge(statusBadge, user.status);
        setEditMeta("created", formatDateTime(user.created_at));
        setEditMeta("updated", formatDateTime(user.updated_at));
        editModal.addEventListener("shown.bs.modal", () => editInputs.first_name.focus(), { once: true });
        bootstrap.Modal.getOrCreateInstance(editModal).show();
    }
    async function submitEdit() {
        var _a;
        if (!activeUser || busyModal) {
            return;
        }
        hideAlert(editAlert);
        const invalid = [];
        for (const name of EDIT_FIELDS) {
            const message = validateEditField(name);
            setFieldError(editInputs[name], `edit-${name}-error`, message);
            if (message !== null)
                invalid.push(name);
        }
        if (invalid.length > 0) {
            editInputs[invalid[0]].focus();
            return;
        }
        if (composeName().length > FULL_NAME_MAX) {
            editAlert.textContent = FULL_NAME_TOO_LONG;
            editAlert.hidden = false;
            editInputs.first_name.focus();
            return;
        }
        const user = activeUser;
        const body = {};
        for (const name of EDIT_FIELDS) {
            body[name] = editInputs[name].value.trim();
        }
        const result = await send(editModal, "PATCH", `${baseUrl}/${user.id}`, body);
        if (result.status === 200 && user.is_current_user && body.role !== "administrator") {
            window.location.assign("dashboard.html");
            return;
        }
        if (result.status === 200) {
            finishAction(editModal, (_a = result.payload.message) !== null && _a !== void 0 ? _a : `Changes saved for ${user.name}.`);
            return;
        }
        if (result.status === 422 && result.payload.errors) {
            const fieldErrors = applyFieldErrors(result.payload.errors);
            if (fieldErrors.length > 0) {
                editInputs[fieldErrors[0]].focus();
                return;
            }
        }
        handleActionFailure(editModal, editAlert, result, "Couldn't save the changes");
    }
    function openPassword(user, trigger) {
        activeUser = user;
        focusAfterClose = trigger;
        hideAlert(passwordAlert);
        fillTarget(passwordModal, user);
        for (const name of PASSWORD_FIELDS) {
            passwordInputs[name].value = "";
            setFieldError(passwordInputs[name], `reset-${name}-error`, null);
        }
        passwordModal.addEventListener("shown.bs.modal", () => passwordInputs.password.focus(), { once: true });
        bootstrap.Modal.getOrCreateInstance(passwordModal).show();
    }
    async function submitPassword() {
        var _a, _b, _c;
        if (!activeUser || busyModal) {
            return;
        }
        hideAlert(passwordAlert);
        const invalid = [];
        for (const name of PASSWORD_FIELDS) {
            const message = validatePasswordField(name);
            setFieldError(passwordInputs[name], `reset-${name}-error`, message);
            if (message !== null)
                invalid.push(name);
        }
        if (invalid.length > 0) {
            passwordInputs[invalid[0]].focus();
            return;
        }
        const user = activeUser;
        const result = await send(passwordModal, "PUT", `${baseUrl}/${user.id}/password`, {
            password: passwordInputs.password.value,
            password_confirmation: passwordInputs.password_confirmation.value,
        });
        for (const name of PASSWORD_FIELDS) {
            passwordInputs[name].value = "";
        }
        if (result.status === 200) {
            finishAction(passwordModal, (_a = result.payload.message) !== null && _a !== void 0 ? _a : `New password set for ${user.name}.`);
            return;
        }
        if (result.status === 422 && result.payload.errors) {
            let focused = false;
            for (const name of PASSWORD_FIELDS) {
                const message = (_b = result.payload.errors[name]) === null || _b === void 0 ? void 0 : _b[0];
                if (message) {
                    setFieldError(passwordInputs[name], `reset-${name}-error`, message);
                    if (!focused) {
                        passwordInputs[name].focus();
                        focused = true;
                    }
                }
            }
            if (focused)
                return;
        }
        if (result.status === 403) {
            passwordAlert.textContent = (_c = result.payload.message) !== null && _c !== void 0 ? _c : "You can't set a password for this account.";
            passwordAlert.hidden = false;
            passwordAlert.focus();
            return;
        }
        handleActionFailure(passwordModal, passwordAlert, result, "Couldn't set the new password");
    }
    function validatePasswordField(name) {
        const value = passwordInputs[name].value;
        if (name === "password") {
            if (value === "")
                return "Enter a password.";
            if (value.length > 255)
                return "Password must be 255 characters or fewer.";
            return null;
        }
        if (value === "")
            return "Re-enter the password to confirm it.";
        if (value !== passwordInputs.password.value)
            return "Passwords don't match.";
        return null;
    }
    function roleLabel(role) {
        var _a;
        return (_a = ROLES[role]) !== null && _a !== void 0 ? _a : role;
    }
    function openStatus(user, trigger) {
        activeUser = user;
        focusAfterClose = trigger;
        hideAlert(statusAlert);
        fillTarget(statusModal, user);
        const disabling = user.status === "active";
        statusTitle.textContent = disabling ? "Disable account?" : "Enable account?";
        statusEffect.textContent = disabling
            ? "A disabled user is signed out right away and can no longer sign in. Their account details are kept, and you can enable the account again at any time."
            : "The user will be able to sign in again with their existing password.";
        statusSubmit.classList.toggle("bg-gradient-warning", disabling);
        statusSubmit.classList.toggle("bg-gradient-success", !disabling);
        statusSubmit.dataset.busyLabel = disabling ? "Disabling…" : "Enabling…";
        setButtonLabel(statusSubmit, disabling ? "Disable account" : "Enable account");
        statusModal.addEventListener("shown.bs.modal", () => statusSubmit.focus(), { once: true });
        bootstrap.Modal.getOrCreateInstance(statusModal).show();
    }
    async function submitStatus() {
        var _a;
        if (!activeUser || busyModal) {
            return;
        }
        hideAlert(statusAlert);
        const user = activeUser;
        const action = user.status === "active" ? "disable" : "enable";
        const result = await send(statusModal, "POST", `${baseUrl}/${user.id}/${action}`);
        if (result.status === 200) {
            finishAction(statusModal, (_a = result.payload.message) !== null && _a !== void 0 ? _a : "Account updated.");
            return;
        }
        handleActionFailure(statusModal, statusAlert, result, action === "disable" ? "Couldn't disable the account" : "Couldn't enable the account");
    }
    function openRemove(user, trigger) {
        activeUser = user;
        focusAfterClose = trigger;
        hideAlert(removeAlert);
        fillTarget(removeModal, user);
        removeInput.value = "";
        setFieldError(removeInput, "remove-confirm-error", null);
        removeSubmit.disabled = true;
        removeModal.addEventListener("shown.bs.modal", () => removeInput.focus(), { once: true });
        bootstrap.Modal.getOrCreateInstance(removeModal).show();
    }
    async function submitRemove() {
        var _a, _b;
        if (!activeUser || busyModal) {
            return;
        }
        hideAlert(removeAlert);
        if (!confirmationMatches()) {
            setFieldError(removeInput, "remove-confirm-error", "Type the username exactly as shown to confirm.");
            removeInput.focus();
            return;
        }
        const user = activeUser;
        const result = await send(removeModal, "DELETE", `${baseUrl}/${user.id}`, {
            confirm_username: removeInput.value.trim(),
        });
        if (result.status === 200) {
            finishAction(removeModal, (_a = result.payload.message) !== null && _a !== void 0 ? _a : `Account removed: ${user.name}.`);
            return;
        }
        if (result.status === 422 && ((_b = result.payload.errors) === null || _b === void 0 ? void 0 : _b.confirm_username)) {
            setFieldError(removeInput, "remove-confirm-error", result.payload.errors.confirm_username[0]);
            removeInput.focus();
            return;
        }
        handleActionFailure(removeModal, removeAlert, result, "Couldn't remove the account");
        removeSubmit.disabled = !confirmationMatches();
    }
    function confirmationMatches() {
        return activeUser !== null && removeInput.value.trim().toLowerCase() === activeUser.username;
    }
    function finishAction(modal, message) {
        hideFeedback();
        const text = successBox.querySelector(".users-feedback-text");
        if (text)
            text.textContent = message;
        successBox.hidden = false;
        focusAfterClose = successBox;
        activeUser = null;
        bootstrap.Modal.getOrCreateInstance(modal).hide();
        void load();
    }
    function handleActionFailure(modal, alertBox, result, prefix) {
        var _a, _b;
        const { status, payload } = result;
        if (status === 404) {
            bootstrap.Modal.getOrCreateInstance(modal).hide();
            showError("That account no longer exists. It may have been removed by another administrator. The list has been refreshed.");
            focusAfterClose = errorBox;
            void load();
            return;
        }
        let message;
        if (status === 422) {
            const errors = payload.errors ? Object.values(payload.errors).flat() : [];
            message = errors.length > 0 ? errors.join(" ") : (_a = payload.message) !== null && _a !== void 0 ? _a : `${prefix}. Check the details and try again.`;
        }
        else if (status === 401) {
            message = `${(_b = payload.message) !== null && _b !== void 0 ? _b : "Your session has ended."} Sign in again to continue.`;
        }
        else if (status === 403) {
            message = `${prefix}. Your account isn't allowed to manage users.`;
        }
        else if (status === 419) {
            message = `${prefix}. This page expired for security reasons. Refresh the page and try again.`;
        }
        else if (status === 429) {
            message = `${prefix}. Too many requests. Wait a minute, then try again.`;
        }
        else if (status === -1) {
            message = `${prefix}. The server took too long to respond, so the change may or may not have been applied. Close this dialog to refresh the list before trying again.`;
        }
        else if (status === 0) {
            message = `${prefix}. Couldn't connect to the server. Check your connection and try again.`;
        }
        else {
            message = `${prefix}. Something went wrong on the server (Error ${status}). Try again in a moment.`;
        }
        alertBox.textContent = message;
        if (status === 401) {
            const link = document.createElement("a");
            link.href = signInUrl;
            link.className = "text-white font-weight-bold text-decoration-underline ms-1";
            link.textContent = "Go to sign in";
            alertBox.append(link);
        }
        alertBox.hidden = false;
        alertBox.focus();
        if (status === -1) {
            modal.addEventListener("hidden.bs.modal", () => void load(), { once: true });
        }
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
                headers: window.CmsApi.headers({ "Content-Type": "application/json" }),
                body: body ? JSON.stringify(body) : undefined,
            });
            return { status: response.status, payload: (await readJson(response)) };
        }
        catch (_a) {
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
        for (const control of Array.from(modal.querySelectorAll("button, input, fieldset"))) {
            if (busy) {
                control.dataset.wasDisabled = control.disabled ? "true" : "false";
                control.disabled = true;
            }
            else {
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
    function applyFieldErrors(errors) {
        var _a;
        const fields = [];
        for (const name of EDIT_FIELDS) {
            const message = (_a = errors[name]) === null || _a === void 0 ? void 0 : _a[0];
            if (message) {
                setFieldError(editInputs[name], `edit-${name}-error`, message);
                fields.push(name);
            }
        }
        return fields;
    }
    function validateEditField(name) {
        const value = editInputs[name].value.trim();
        switch (name) {
            case "first_name":
                if (value === "")
                    return "Enter the user's first name.";
                if (value.length > 50)
                    return "First name must be 50 characters or fewer.";
                return null;
            case "middle_name":
                if (value.length > 50)
                    return "Middle name must be 50 characters or fewer.";
                return null;
            case "last_name":
                if (value === "")
                    return "Enter the user's last name.";
                if (value.length > 50)
                    return "Last name must be 50 characters or fewer.";
                return null;
            case "suffix":
                if (value.length > 10)
                    return "Suffix must be 10 characters or fewer.";
                return null;
            case "email":
                if (value === "")
                    return "Enter the user's email address.";
                if (value.length > 255)
                    return "Email address must be 255 characters or fewer.";
                if (!EMAIL_PATTERN.test(value))
                    return "Enter a valid email address, like name@example.com.";
                return null;
            case "role":
                return value in ROLES ? null : "Choose Administrator or User.";
            case "username":
                if (value === "")
                    return "Choose a username.";
                if (value.length < 3)
                    return "Username must be at least 3 characters.";
                if (value.length > 50)
                    return "Username must be 50 characters or fewer.";
                if (!USERNAME_PATTERN.test(value.toLowerCase()))
                    return "Use only letters, numbers, dots, underscores, and hyphens. No spaces.";
                return null;
        }
    }
    function composeName() {
        return NAME_PARTS
            .map((name) => editInputs[name].value.trim().replace(/\s+/g, " "))
            .filter((part) => part !== "")
            .join(" ");
    }
    function guessNameParts(fullName) {
        const words = fullName.trim().split(/\s+/).filter((word) => word !== "");
        const lastName = words.length > 1 ? words.pop() : "";
        return { first_name: words.join(" "), middle_name: "", last_name: lastName, suffix: "" };
    }
    function setFieldError(input, feedbackId, message) {
        const feedback = document.getElementById(feedbackId);
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
    function fillTarget(modal, user) {
        for (const element of Array.from(modal.querySelectorAll("[data-target]"))) {
            const key = element.dataset.target;
            element.textContent = user[key];
        }
    }
    function setEditMeta(key, value) {
        const element = editModal.querySelector(`[data-edit="${key}"]`);
        if (element)
            element.textContent = value;
    }
    function applyStatusBadge(element, status) {
        element.textContent = status === "active" ? "Active" : "Disabled";
        element.classList.toggle("is-active", status === "active");
        element.classList.toggle("is-disabled", status === "disabled");
    }
    function showError(message) {
        hideFeedback();
        const text = errorBox.querySelector(".users-feedback-text");
        if (text)
            text.textContent = message;
        errorBox.hidden = false;
    }
    function hideFeedback() {
        successBox.hidden = true;
        errorBox.hidden = true;
    }
    function hideAlert(alertBox) {
        alertBox.hidden = true;
        alertBox.textContent = "";
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
    function initialOf(name) {
        var _a, _b;
        return (_b = (_a = Array.from(name.trim())[0]) === null || _a === void 0 ? void 0 : _a.toUpperCase()) !== null && _b !== void 0 ? _b : "?";
    }
    function formatDate(value) {
        if (!value)
            return "—";
        return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    }
    function formatDateTime(value) {
        if (!value)
            return "—";
        return new Date(value).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    }
    function parseStatus(value) {
        return value === "active" || value === "disabled" ? value : "all";
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
        catch (_a) {
            return {};
        }
    }
})();
