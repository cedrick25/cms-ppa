"use strict";
(() => {
    const NAME_PARTS = ["first_name", "middle_name", "last_name", "suffix"];
    const DETAIL_FIELDS = [...NAME_PARTS, "email", "username"];
    const PASSWORD_FIELDS = ["password", "password_confirmation"];
    const FIELDS = [...DETAIL_FIELDS, ...PASSWORD_FIELDS, "current_password"];
    const USERNAME_PATTERN = /^[a-z0-9._-]+$/;
    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const FULL_NAME_MAX = 100;
    const FULL_NAME_TOO_LONG = "The full name (first, middle, and last name plus suffix) must be 100 characters or fewer in total.";
    const REQUEST_TIMEOUT_MS = 20000;
    const TIMED_ALERT_MS = 3000;
    if (!window.CmsApi || !window.CmsApi.token() || typeof bootstrap === "undefined") {
        return;
    }
    const modal = document.createElement("div");
    modal.className = "modal fade";
    modal.id = "account-update-modal";
    modal.tabIndex = -1;
    modal.setAttribute("aria-labelledby", "account-update-title");
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <form class="modal-content users-modal" id="account-update-form" novalidate>
        <div class="modal-header">
          <h5 class="modal-title" id="account-update-title">Update your account</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="alert alert-danger text-white text-sm" id="account-update-alert" role="alert" tabindex="-1" hidden></div>
          <div class="alert alert-success text-white text-sm" id="account-update-success" role="status" tabindex="-1" hidden></div>
          <fieldset id="account-update-fields">
            <legend class="visually-hidden">Account details</legend>
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label" for="account-first_name">First name <span class="required-mark" aria-hidden="true">*</span></label>
                <input type="text" id="account-first_name" name="first_name" class="form-control" maxlength="50" autocomplete="given-name" required aria-required="true" aria-describedby="account-first_name-error">
                <div class="invalid-feedback" id="account-first_name-error"></div>
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label" for="account-middle_name">Middle name</label>
                <input type="text" id="account-middle_name" name="middle_name" class="form-control" maxlength="50" autocomplete="additional-name" aria-describedby="account-middle_name-error">
                <div class="invalid-feedback" id="account-middle_name-error"></div>
              </div>
              <div class="col-md-8 mb-3">
                <label class="form-label" for="account-last_name">Last name <span class="required-mark" aria-hidden="true">*</span></label>
                <input type="text" id="account-last_name" name="last_name" class="form-control" maxlength="50" autocomplete="family-name" required aria-required="true" aria-describedby="account-last_name-error">
                <div class="invalid-feedback" id="account-last_name-error"></div>
              </div>
              <div class="col-md-4 mb-3">
                <label class="form-label" for="account-suffix">Suffix</label>
                <input type="text" id="account-suffix" name="suffix" class="form-control" maxlength="10" autocomplete="honorific-suffix" aria-describedby="account-suffix-hint account-suffix-error">
                <div class="invalid-feedback" id="account-suffix-error"></div>
                <div class="form-text" id="account-suffix-hint">For example Jr., Sr., or III.</div>
              </div>
            </div>
            <div class="alert alert-warning text-white text-sm" id="account-name-split-note" hidden>
              Your name hasn't been split into first and last name yet. The fields above are a best guess. Check them, and add a last name, before saving.
            </div>
            <div class="mb-3">
              <label class="form-label" for="account-email">Email address <span class="required-mark" aria-hidden="true">*</span></label>
              <input type="email" id="account-email" name="email" class="form-control" maxlength="255" autocomplete="email" autocapitalize="none" spellcheck="false" inputmode="email" required aria-required="true" aria-describedby="account-email-error">
              <div class="invalid-feedback" id="account-email-error"></div>
            </div>
            <div class="mb-3">
              <label class="form-label" for="account-username">Username <span class="required-mark" aria-hidden="true">*</span></label>
              <input type="text" id="account-username" name="username" class="form-control" maxlength="50" autocomplete="username" autocapitalize="none" spellcheck="false" required aria-required="true" aria-describedby="account-username-hint account-username-error">
              <div class="invalid-feedback" id="account-username-error"></div>
              <div class="form-text" id="account-username-hint">You sign in with this. Letters, numbers, dots, underscores, or hyphens.</div>
            </div>
            <h6 class="text-sm mt-4 mb-1">Change password</h6>
            <p class="text-xs text-secondary mb-2">Leave these blank to keep your current password. If you set a new one, any other devices signed in to your account are signed out.</p>
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label" for="account-password">New password</label>
                <input type="password" id="account-password" name="password" class="form-control" maxlength="255" autocomplete="new-password" aria-describedby="account-password-error">
                <div class="invalid-feedback" id="account-password-error"></div>
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label" for="account-password_confirmation">Confirm new password</label>
                <input type="password" id="account-password_confirmation" name="password_confirmation" class="form-control" maxlength="255" autocomplete="new-password" aria-describedby="account-password_confirmation-error">
                <div class="invalid-feedback" id="account-password_confirmation-error"></div>
              </div>
            </div>
            <hr class="horizontal dark my-3">
            <div class="mb-0">
              <label class="form-label" for="account-current_password">Current password <span class="required-mark" aria-hidden="true">*</span></label>
              <input type="password" id="account-current_password" name="current_password" class="form-control" maxlength="255" autocomplete="current-password" required aria-required="true" aria-describedby="account-current_password-hint account-current_password-error">
              <div class="invalid-feedback" id="account-current_password-error"></div>
              <div class="form-text" id="account-current_password-hint">Required to save any change to your account.</div>
            </div>
          </fieldset>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary mb-0" data-bs-dismiss="modal">Cancel</button>
          <button type="submit" class="btn bg-gradient-primary mb-0" id="account-update-submit">
            <span class="spinner-border spinner-border-sm me-2" aria-hidden="true" hidden></span>
            <span class="account-update-label">Save changes</span>
          </button>
        </div>
      </form>
    </div>`;
    document.body.append(modal);
    const form = modal.querySelector("form");
    const fieldset = modal.querySelector("fieldset");
    const alertBox = modal.querySelector("#account-update-alert");
    const successBox = modal.querySelector("#account-update-success");
    const nameSplitNote = modal.querySelector("#account-name-split-note");
    const submit = modal.querySelector("#account-update-submit");
    const submitLabel = submit.querySelector(".account-update-label");
    const spinner = submit.querySelector(".spinner-border");
    const inputs = {};
    for (const name of FIELDS) {
        inputs[name] = modal.querySelector(`#account-${name}`);
        inputs[name].addEventListener("input", () => {
            if (inputs[name].classList.contains("is-invalid")) {
                setFieldError(name, validate(name));
            }
        });
    }
    let busy = false;
    let focusAfterClose = null;
    let successTimer = 0;
    modal.addEventListener("hide.bs.modal", (event) => {
        if (busy) {
            event.preventDefault();
        }
    });
    modal.addEventListener("hidden.bs.modal", () => {
        reset();
        if (focusAfterClose && focusAfterClose.isConnected) {
            focusAfterClose.focus();
        }
        focusAfterClose = null;
    });
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        void send();
    });
    const opener = document.getElementById("account-update-open");
    opener === null || opener === void 0 ? void 0 : opener.addEventListener("click", () => void open(opener));
    window.CmsUpdateAccount = { open };
    async function open(trigger) {
        focusAfterClose = trigger !== null && trigger !== void 0 ? trigger : null;
        reset();
        const user = await currentUser();
        if (user) {
            fill(user);
        }
        else {
            showAlert("Couldn't load your account details. Close this window and try again.");
        }
        modal.addEventListener("shown.bs.modal", () => inputs.first_name.focus(), { once: true });
        bootstrap.Modal.getOrCreateInstance(modal).show();
    }
    async function currentUser() {
        if (window.CMS_USER && window.CMS_USER.username) {
            return window.CMS_USER;
        }
        try {
            const response = await fetch(window.CmsApi.url("/user"), { headers: window.CmsApi.headers() });
            return response.ok ? await readJson(response) : null;
        }
        catch (_a) {
            return null;
        }
    }
    function fill(user) {
        var _a;
        const legacyName = !user.last_name;
        const parts = legacyName ? guessNameParts((_a = user.name) !== null && _a !== void 0 ? _a : "") : user;
        for (const name of DETAIL_FIELDS) {
            const value = NAME_PARTS.includes(name) ? parts[name] : user[name];
            inputs[name].value = value !== null && value !== void 0 ? value : "";
        }
        nameSplitNote.hidden = !legacyName;
    }
    async function send() {
        if (busy) {
            return;
        }
        hide(alertBox);
        hide(successBox);
        const invalid = [];
        for (const name of FIELDS) {
            const message = validate(name);
            setFieldError(name, message);
            if (message !== null)
                invalid.push(name);
        }
        if (invalid.length > 0) {
            inputs[invalid[0]].focus();
            return;
        }
        if (composeName().length > FULL_NAME_MAX) {
            showAlert(FULL_NAME_TOO_LONG);
            inputs.first_name.focus();
            return;
        }
        const body = { current_password: inputs.current_password.value };
        for (const name of DETAIL_FIELDS) {
            body[name] = inputs[name].value.trim();
        }
        if (inputs.password.value !== "") {
            body.password = inputs.password.value;
            body.password_confirmation = inputs.password_confirmation.value;
        }
        const controller = new AbortController();
        let timedOut = false;
        const timer = window.setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, REQUEST_TIMEOUT_MS);
        setBusy(true);
        let status;
        let payload;
        try {
            const response = await fetch(window.CmsApi.url("/user"), {
                method: "PATCH",
                signal: controller.signal,
                headers: window.CmsApi.headers({ "Content-Type": "application/json" }),
                body: JSON.stringify(body),
            });
            status = response.status;
            payload = await readJson(response);
        }
        catch (_a) {
            status = timedOut ? -1 : 0;
            payload = {};
        }
        finally {
            window.clearTimeout(timer);
            setBusy(false);
        }
        handle(status, payload);
    }
    function handle(status, payload) {
        var _a, _b;
        if (status === 200) {
            for (const name of [...PASSWORD_FIELDS, "current_password"]) {
                inputs[name].value = "";
            }
            if (payload.user) {
                applyUser(payload.user);
                fill(payload.user);
            }
            successBox.textContent = (_a = payload.message) !== null && _a !== void 0 ? _a : "Your account has been updated.";
            successBox.classList.add("timed-alert");
            successBox.hidden = false;
            successBox.focus();
            successTimer = window.setTimeout(() => {
                bootstrap.Modal.getOrCreateInstance(modal).hide();
            }, TIMED_ALERT_MS);
            return;
        }
        if (status === 422 && payload.errors) {
            const invalid = [];
            const other = [];
            for (const [key, messages] of Object.entries(payload.errors)) {
                const message = (_b = messages[0]) !== null && _b !== void 0 ? _b : "This value is invalid.";
                if (FIELDS.includes(key)) {
                    setFieldError(key, message);
                    invalid.push(key);
                }
                else {
                    other.push(message);
                }
            }
            if (other.length > 0) {
                showAlert(other.join(" "));
            }
            const first = FIELDS.find((name) => invalid.includes(name));
            if (first) {
                inputs[first].focus();
            }
            return;
        }
        switch (status) {
            case 401:
                showAlert("Your session has ended, so your account wasn't updated. Sign in again, then try again.");
                return;
            case 429:
                showAlert("Too many attempts. Wait a minute, then try again.");
                return;
            case -1:
                showAlert("The server took too long to respond, so your changes may or may not have been saved. Reload the page to check before trying again.");
                return;
            case 0:
                showAlert("Couldn't connect to the server. Check your connection and try again.");
                return;
        }
        showAlert(`Something went wrong on the server (Error ${status}). Your account wasn't updated. Try again in a moment.`);
    }
    function applyUser(user) {
        window.CMS_USER = user;
        const name = document.getElementById("welcome-name");
        const initial = document.getElementById("welcome-initial");
        if (name) {
            name.textContent = user.name;
        }
        if (initial) {
            initial.textContent = user.name.trim().charAt(0).toUpperCase();
        }
        document.dispatchEvent(new CustomEvent("cms:account-updated", { detail: user }));
    }
    function validate(name) {
        const raw = inputs[name].value;
        const value = raw.trim();
        switch (name) {
            case "first_name":
                if (value === "")
                    return "Enter your first name.";
                if (value.length > 50)
                    return "First name must be 50 characters or fewer.";
                return null;
            case "middle_name":
                return value.length > 50 ? "Middle name must be 50 characters or fewer." : null;
            case "last_name":
                if (value === "")
                    return "Enter your last name.";
                if (value.length > 50)
                    return "Last name must be 50 characters or fewer.";
                return null;
            case "suffix":
                return value.length > 10 ? "Suffix must be 10 characters or fewer." : null;
            case "email":
                if (value === "")
                    return "Enter your email address.";
                if (value.length > 255)
                    return "Email address must be 255 characters or fewer.";
                if (!EMAIL_PATTERN.test(value))
                    return "Enter a valid email address, like name@example.com.";
                return null;
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
            case "password":
                if (raw === "")
                    return null;
                if (raw.length > 255)
                    return "Password must be 255 characters or fewer.";
                if (raw === inputs.current_password.value)
                    return "Choose a new password that is different from your current one.";
                return null;
            case "password_confirmation":
                if (inputs.password.value === "")
                    return null;
                if (raw === "")
                    return "Re-enter the new password to confirm it.";
                if (raw !== inputs.password.value)
                    return "Passwords don't match.";
                return null;
            case "current_password":
                return raw === "" ? "Enter your current password to save these changes." : null;
        }
        return null;
    }
    function composeName() {
        return NAME_PARTS
            .map((name) => inputs[name].value.trim().replace(/\s+/g, " "))
            .filter((part) => part !== "")
            .join(" ");
    }
    function guessNameParts(fullName) {
        const words = fullName.trim().split(/\s+/).filter((word) => word !== "");
        const lastName = words.length > 1 ? words.pop() : "";
        return { first_name: words.join(" "), middle_name: "", last_name: lastName, suffix: "" };
    }
    function setFieldError(name, message) {
        const input = inputs[name];
        const feedback = modal.querySelector(`#account-${name}-error`);
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
    function setBusy(value) {
        busy = value;
        fieldset.disabled = value;
        submit.disabled = value;
        modal.setAttribute("aria-busy", value ? "true" : "false");
        spinner.hidden = !value;
        submitLabel.textContent = value ? "Saving…" : "Save changes";
    }
    function showAlert(message) {
        alertBox.textContent = message;
        alertBox.hidden = false;
        alertBox.focus();
    }
    function hide(box) {
        box.hidden = true;
        box.textContent = "";
    }
    function reset() {
        window.clearTimeout(successTimer);
        successBox.classList.remove("timed-alert");
        form.reset();
        nameSplitNote.hidden = true;
        hide(alertBox);
        hide(successBox);
        for (const name of FIELDS) {
            setFieldError(name, null);
        }
    }
    async function readJson(response) {
        const text = await response.text();
        if (text === "")
            return {};
        try {
            const parsed = JSON.parse(text);
            return typeof parsed === "object" && parsed !== null ? parsed : {};
        }
        catch (_a) {
            return {};
        }
    }
})();
