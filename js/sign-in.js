"use strict";
if (window.CmsApi && window.CmsApi.token()) {
    window.location.replace("dashboard.html");
}
const signInForm = document.getElementById("sign-in-form");
if (signInForm instanceof HTMLFormElement) {
    const form = signInForm;
    const error = document.getElementById("auth-error");
    const submit = document.getElementById("sign-in-submit");
    const label = submit === null || submit === void 0 ? void 0 : submit.querySelector(".auth-submit-label");
    const username = form.elements.namedItem("username");
    const password = form.elements.namedItem("password");
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        void submitForm();
    });
    form.addEventListener("input", () => {
        clearError();
        if (username instanceof HTMLInputElement) {
            username.classList.remove("is-invalid");
            username.removeAttribute("aria-invalid");
        }
        if (password instanceof HTMLInputElement) {
            password.classList.remove("is-invalid");
            password.removeAttribute("aria-invalid");
        }
    });
    async function submitForm() {
        var _a, _b;
        if (!(username instanceof HTMLInputElement) || !(password instanceof HTMLInputElement) || !(submit instanceof HTMLButtonElement)) {
            return;
        }
        const usernameValue = username.value.trim().toLowerCase();
        const passwordValue = password.value;
        const validationError = validate(usernameValue, passwordValue);
        if (validationError) {
            if (validationError.toLowerCase().includes("username")) {
                markInvalid(username);
            }
            if (validationError.toLowerCase().includes("password")) {
                markInvalid(password);
            }
            showError(validationError);
            return;
        }
        setLoading(true);
        clearError();
        try {
            const response = await fetch(window.CmsApi.url("/sign-in"), {
                method: "POST",
                body: JSON.stringify({ username: usernameValue, password: passwordValue }),
                headers: window.CmsApi.headers({ "Content-Type": "application/json" }),
            });
            const payload = await readPayload(response);
            if (response.ok && typeof payload.token === "string") {
                window.CmsApi.setToken(payload.token);
                window.location.assign("dashboard.html");
                return;
            }
            showError(messageFrom(response.status, payload));
            setLoading(false);
        }
        catch (_c) {
            showError("Unable to sign in right now. Try again.");
            setLoading(false);
        }
    }
    function validate(usernameValue, passwordValue) {
        const messages = [];
        if (usernameValue === "") {
            messages.push("Username is required.");
        }
        else if (usernameValue.length < 3) {
            messages.push("Username must be at least 3 characters.");
        }
        else if (usernameValue.length > 50) {
            messages.push("Username must be 50 characters or fewer.");
        }
        else if (!/^[a-z0-9._-]+$/.test(usernameValue)) {
            messages.push("Username may only contain letters, numbers, dots, underscores, and hyphens.");
        }
        if (passwordValue === "") {
            messages.push("Password is required.");
        }
        else if (passwordValue.length > 255) {
            messages.push("Password must be 255 characters or fewer.");
        }
        return messages.length > 0 ? messages.join(" ") : null;
    }
    function messageFrom(status, payload) {
        if (typeof payload.message === "string" && payload.message !== "") {
            return payload.message;
        }
        const fieldErrors = payload.errors ? Object.values(payload.errors).flat() : [];
        if (fieldErrors.length > 0) {
            return fieldErrors.join(" ");
        }
        if (status === 419) {
            return "The sign-in form expired. Refresh the page and try again.";
        }
        if (status === 429) {
            return "Too many sign-in attempts. Try again shortly.";
        }
        return "Unable to sign in right now. Try again.";
    }
    function showError(message) {
        if (!(error instanceof HTMLElement)) {
            return;
        }
        error.textContent = message;
        error.classList.add("is-visible");
    }
    function clearError() {
        if (!(error instanceof HTMLElement)) {
            return;
        }
        error.textContent = "";
        error.classList.remove("is-visible");
    }
    function markInvalid(input) {
        input.classList.add("is-invalid");
        input.setAttribute("aria-invalid", "true");
    }
    function setLoading(loading) {
        if (!(submit instanceof HTMLButtonElement)) {
            return;
        }
        submit.disabled = loading;
        submit.setAttribute("aria-busy", loading ? "true" : "false");
        if (label) {
            label.textContent = loading ? "Signing in..." : "Sign in";
        }
    }
}
async function readPayload(response) {
    const text = await response.text();
    if (text === "") {
        return {};
    }
    try {
        return JSON.parse(text);
    }
    catch (_a) {
        return {};
    }
}
