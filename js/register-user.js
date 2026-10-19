"use strict";
(() => {
    var _a;
    const FIELDS = ["first_name", "middle_name", "last_name", "suffix", "email", "username", "role", "password", "password_confirmation"];
    const ROLES = { administrator: "Administrator", user: "User" };
    const NAME_PARTS = ["first_name", "middle_name", "last_name", "suffix"];
    const FULL_NAME_MAX = 100;
    const FULL_NAME_TOO_LONG = "The full name (first, middle, and last name plus suffix) must be 100 characters or fewer in total.";
    const REQUEST_TIMEOUT_MS = 20000;
    const USERNAME_PATTERN = /^[a-z0-9._-]+$/;
    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const formElement = document.getElementById("register-user-form");
    const fieldsetElement = document.getElementById("register-fields");
    const submitElement = document.getElementById("register-submit");
    const alertElement = document.getElementById("register-alert");
    const successElement = document.getElementById("register-success");
    if (!(formElement instanceof HTMLFormElement) ||
        !(fieldsetElement instanceof HTMLFieldSetElement) ||
        !(submitElement instanceof HTMLButtonElement) ||
        !(alertElement instanceof HTMLElement) ||
        !(successElement instanceof HTMLElement)) {
        return;
    }
    if (!window.CmsApi || !window.CmsApi.token()) {
        return;
    }
    const form = formElement;
    const fieldset = fieldsetElement;
    const submit = submitElement;
    const alertBox = alertElement;
    const success = successElement;
    const submitLabel = submit.querySelector(".register-submit-label");
    const spinner = submit.querySelector(".spinner-border");
    const matchHint = document.getElementById("password_confirmation-match");
    const toggles = Array.from(document.querySelectorAll("[data-password-toggle]"));
    const inputs = {};
    for (const name of FIELDS) {
        const element = form.elements.namedItem(name);
        if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLSelectElement)) {
            return;
        }
        inputs[name] = element;
    }
    const touched = new Set();
    let submitting = false;
    for (const name of FIELDS) {
        if (inputs[name].classList.contains("is-invalid")) {
            touched.add(name);
        }
        inputs[name].addEventListener("blur", () => {
            if (submitting) {
                return;
            }
            if (inputs[name].value !== "" || touched.has(name)) {
                touched.add(name);
                showFieldError(name, validateField(name));
            }
            if (name === "password_confirmation") {
                updateMatchHint();
            }
        });
        inputs[name].addEventListener("input", () => {
            if (touched.has(name)) {
                showFieldError(name, validateField(name));
            }
            if (name === "password") {
                if (touched.has("password_confirmation")) {
                    showFieldError("password_confirmation", validateField("password_confirmation"));
                }
            }
            if (name === "password" || name === "password_confirmation") {
                updateMatchHint();
            }
        });
    }
    for (const toggle of toggles) {
        const target = document.getElementById((_a = toggle.dataset.passwordToggle) !== null && _a !== void 0 ? _a : "");
        if (!(target instanceof HTMLInputElement)) {
            continue;
        }
        toggle.hidden = false;
        toggle.addEventListener("click", () => {
            setPasswordVisible(toggle, target, target.type === "password");
        });
    }
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (submitting) {
            return;
        }
        hideAlert();
        const invalid = validateAll();
        if (invalid.length > 0) {
            showAlert(invalid.length === 1
                ? "Fix the highlighted field and try again."
                : `Fix the ${invalid.length} highlighted fields and try again.`);
            inputs[invalid[0]].focus();
            return;
        }
        if (fullName().length > FULL_NAME_MAX) {
            showAlert(FULL_NAME_TOO_LONG);
            inputs.first_name.focus();
            return;
        }
        void send();
    });
    const again = document.getElementById("register-again");
    again === null || again === void 0 ? void 0 : again.addEventListener("click", (event) => {
        event.preventDefault();
        resetForm();
        success.hidden = true;
        form.hidden = false;
        inputs.first_name.focus();
    });
    async function send() {
        const body = new FormData(form);
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        setSubmitting(true);
        let response;
        let payload;
        try {
            response = await fetch(window.CmsApi.url("/users"), {
                method: "POST",
                body,
                signal: controller.signal,
                headers: window.CmsApi.headers(),
            });
            payload = await readPayload(response);
        }
        catch (_c) {
            setSubmitting(false);
            showRequestError(controller.signal.aborted
                ? "The server took too long to respond, so the account may or may not have been created. Try again. If the username is then reported as already in use, the first attempt worked."
                : "Couldn't connect to the server. Check your network connection, then try again. Your entries are still here.");
            return;
        }
        finally {
            window.clearTimeout(timer);
        }
        if (response.status === 201 && payload.user) {
            setSubmitting(false);
            showSuccess(payload.user);
            return;
        }
        setSubmitting(false);
        handleFailure(response.status, payload);
    }
    function handleFailure(status, payload) {
        var _a, _b;
        if (status === 422 && payload.errors) {
            const invalid = [];
            const other = [];
            for (const [key, messages] of Object.entries(payload.errors)) {
                const message = (_a = messages[0]) !== null && _a !== void 0 ? _a : "This value is invalid.";
                if (isField(key)) {
                    touched.add(key);
                    showFieldError(key, message);
                    invalid.push(key);
                }
                else {
                    other.push(message);
                }
            }
            const ordered = FIELDS.filter((name) => invalid.includes(name));
            showAlert(other.length > 0 ? other.join(" ") : "The account wasn't created. Check the highlighted fields and try again.");
            if (ordered.length > 0) {
                inputs[ordered[0]].focus();
            }
            else {
                alertBox.focus();
            }
            return;
        }
        const signInUrl = (_b = form.dataset.signInUrl) !== null && _b !== void 0 ? _b : "/sign-in";
        switch (status) {
            case 401:
                showRequestError("Your session has ended, so the account wasn't created. Sign in again, then register the user.", { href: signInUrl, label: "Go to sign in" });
                return;
            case 403:
                showRequestError("Your account isn't allowed to register users. The account wasn't created.");
                return;
            case 419:
                showRequestError("This page expired for security reasons, so the account wasn't created. Refresh the page and try again.", { href: window.location.href, label: "Refresh page" });
                return;
            case 429:
                showRequestError("Too many registration attempts. Wait a minute, then try again.");
                return;
        }
        const reference = status > 0 ? ` (Error ${status})` : "";
        showRequestError(`Something went wrong on the server and the account couldn't be confirmed as created${reference}. Try again in a moment. If the username is then reported as already in use, the first attempt worked.`);
    }
    function validateAll() {
        const invalid = [];
        for (const name of FIELDS) {
            touched.add(name);
            const message = validateField(name);
            showFieldError(name, message);
            if (message !== null) {
                invalid.push(name);
            }
        }
        updateMatchHint();
        return invalid;
    }
    function validateField(name) {
        const raw = inputs[name].value;
        const value = name === "password" || name === "password_confirmation" ? raw : raw.trim();
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
            case "password":
                if (value === "")
                    return "Enter a password.";
                if (value.length > 255)
                    return "Password must be 255 characters or fewer.";
                return null;
            case "password_confirmation":
                if (value === "")
                    return "Re-enter the password to confirm it.";
                if (value !== inputs.password.value)
                    return "Passwords don't match.";
                return null;
        }
    }
    function fullName() {
        return NAME_PARTS
            .map((name) => inputs[name].value.trim().replace(/\s+/g, " "))
            .filter((part) => part !== "")
            .join(" ");
    }
    function updateMatchHint() {
        if (!matchHint) {
            return;
        }
        const confirmation = inputs.password_confirmation.value;
        matchHint.hidden = !(confirmation !== "" && confirmation === inputs.password.value && touched.has("password_confirmation"));
    }
    function showFieldError(name, message) {
        const input = inputs[name];
        const feedback = document.getElementById(`${name}-error`);
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
    function showAlert(message, link) {
        alertBox.textContent = message;
        if (link) {
            const anchor = document.createElement("a");
            anchor.href = link.href;
            anchor.className = "text-white font-weight-bold text-decoration-underline ms-1";
            anchor.textContent = link.label;
            alertBox.append(anchor);
        }
        alertBox.hidden = false;
    }
    function showRequestError(message, link) {
        showAlert(message, link);
        alertBox.focus();
    }
    function hideAlert() {
        alertBox.hidden = true;
        alertBox.textContent = "";
    }
    function setSubmitting(value) {
        submitting = value;
        fieldset.disabled = value;
        submit.disabled = value;
        submit.setAttribute("aria-busy", value ? "true" : "false");
        form.setAttribute("aria-busy", value ? "true" : "false");
        if (spinner instanceof HTMLElement) {
            spinner.hidden = !value;
        }
        if (submitLabel) {
            submitLabel.textContent = value ? "Creating account…" : "Create account";
        }
    }
    function setPasswordVisible(toggle, input, visible) {
        input.type = visible ? "text" : "password";
        toggle.setAttribute("aria-pressed", visible ? "true" : "false");
        toggle.title = visible ? "Hide password" : "Show password";
    }
    function showSuccess(user) {
        for (const key of ["name", "email", "username", "role"]) {
            const target = success.querySelector(`[data-registered="${key}"]`);
            if (target) {
                target.textContent = key === "role" && user.role in ROLES ? ROLES[user.role] : user[key];
            }
        }
        resetForm();
        form.hidden = true;
        success.hidden = false;
        success.focus();
    }
    function resetForm() {
        var _a;
        form.reset();
        hideAlert();
        touched.clear();
        for (const name of FIELDS) {
            if (name !== "role") {
                inputs[name].value = "";
            }
            showFieldError(name, null);
        }
        for (const toggle of toggles) {
            const target = document.getElementById((_a = toggle.dataset.passwordToggle) !== null && _a !== void 0 ? _a : "");
            if (target instanceof HTMLInputElement) {
                setPasswordVisible(toggle, target, false);
            }
        }
        updateMatchHint();
    }
    function isField(key) {
        return FIELDS.includes(key);
    }
    async function readPayload(response) {
        const text = await response.text();
        if (text === "") {
            return {};
        }
        try {
            const parsed = JSON.parse(text);
            return typeof parsed === "object" && parsed !== null ? parsed : {};
        }
        catch (_a) {
            return {};
        }
    }
})();
