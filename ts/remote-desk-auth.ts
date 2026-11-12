(() => {
  interface AuthStatus {
    pin_set?: boolean;
  }

  interface AuthorizeResponse {
    grant?: string;
    message?: string;
    errors?: Record<string, string[]>;
  }

  const modalEl = document.getElementById("remote-desk-auth-modal");
  const formEl = document.getElementById("remote-desk-auth-form");
  const titleEl = document.getElementById("remote-desk-auth-title");
  const targetEl = document.getElementById("remote-desk-auth-target");
  const alertEl = document.getElementById("remote-desk-auth-alert");
  const pinEl = document.getElementById("remote-desk-auth-pin");
  const pinConfirmWrapEl = document.getElementById("remote-desk-auth-pin-confirm-wrap");
  const pinConfirmEl = document.getElementById("remote-desk-auth-pin-confirm");
  const passwordEl = document.getElementById("remote-desk-auth-password");
  const submitEl = document.getElementById("remote-desk-auth-submit");
  const apiClient = window.CmsApi;

  if (!(modalEl instanceof HTMLElement) || !(formEl instanceof HTMLFormElement) || !apiClient || typeof bootstrap === "undefined") {
    return;
  }
  if (!(titleEl instanceof HTMLElement) || !(targetEl instanceof HTMLElement) || !(alertEl instanceof HTMLElement)) {
    return;
  }
  if (!(pinEl instanceof HTMLInputElement) || !(pinConfirmWrapEl instanceof HTMLElement) || !(pinConfirmEl instanceof HTMLInputElement)) {
    return;
  }
  if (!(passwordEl instanceof HTMLInputElement) || !(submitEl instanceof HTMLButtonElement)) {
    return;
  }
  const pinActionsEl = document.getElementById("remote-desk-auth-pin-actions");
  const updatePinEl = document.getElementById("remote-desk-auth-update");
  const resetPinEl = document.getElementById("remote-desk-auth-reset");
  const pinChangeEl = document.getElementById("remote-desk-auth-pin-change");
  const backEl = document.getElementById("remote-desk-auth-back");
  const currentWrapEl = document.getElementById("remote-desk-auth-current-wrap");
  const currentPinEl = document.getElementById("remote-desk-auth-current-pin");
  const resetPasswordWrapEl = document.getElementById("remote-desk-auth-reset-password-wrap");
  const resetPasswordEl = document.getElementById("remote-desk-auth-reset-password");
  const newPinEl = document.getElementById("remote-desk-auth-new-pin");
  const newPinConfirmEl = document.getElementById("remote-desk-auth-new-pin-confirm");
  if (!(pinActionsEl instanceof HTMLElement) || !(updatePinEl instanceof HTMLButtonElement) || !(resetPinEl instanceof HTMLButtonElement)) {
    return;
  }
  if (!(pinChangeEl instanceof HTMLElement) || !(backEl instanceof HTMLButtonElement) || !(currentWrapEl instanceof HTMLElement)) {
    return;
  }
  if (!(currentPinEl instanceof HTMLInputElement) || !(resetPasswordWrapEl instanceof HTMLElement) || !(resetPasswordEl instanceof HTMLInputElement)) {
    return;
  }
  if (!(newPinEl instanceof HTMLInputElement) || !(newPinConfirmEl instanceof HTMLInputElement)) {
    return;
  }

  const modal: HTMLElement = modalEl;
  const form: HTMLFormElement = formEl;
  const title: HTMLElement = titleEl;
  const target: HTMLElement = targetEl;
  const alertBox: HTMLElement = alertEl;
  const messageEl = document.getElementById("remote-desk-auth-fallback-message");
  const pinFieldsEl = document.getElementById("remote-desk-auth-pin-fields");
  const passwordWrapEl = document.getElementById("remote-desk-auth-password-wrap");
  const methodInputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[name='remote-desk-auth-method']"));
  if (!(messageEl instanceof HTMLElement) || !(pinFieldsEl instanceof HTMLElement) || !(passwordWrapEl instanceof HTMLElement)) {
    return;
  }
  if (methodInputs.length === 0) {
    return;
  }
  const message: HTMLElement = messageEl;
  const pinFields: HTMLElement = pinFieldsEl;
  const passwordWrap: HTMLElement = passwordWrapEl;

  const pinInput: HTMLInputElement = pinEl;
  const pinConfirmWrap: HTMLElement = pinConfirmWrapEl;
  const pinConfirm: HTMLInputElement = pinConfirmEl;
  const passwordInput: HTMLInputElement = passwordEl;
  const submitButton: HTMLButtonElement = submitEl;
  const api: CmsApiClient = apiClient;

  const pinActions: HTMLElement = pinActionsEl;
  const updatePinButton: HTMLButtonElement = updatePinEl;
  const resetPinButton: HTMLButtonElement = resetPinEl;
  const pinChange: HTMLElement = pinChangeEl;
  const backButton: HTMLButtonElement = backEl;
  const currentWrap: HTMLElement = currentWrapEl;
  const currentPin: HTMLInputElement = currentPinEl;
  const resetPasswordWrap: HTMLElement = resetPasswordWrapEl;
  const resetPassword: HTMLInputElement = resetPasswordEl;
  const newPin: HTMLInputElement = newPinEl;
  const newPinConfirm: HTMLInputElement = newPinConfirmEl;

  const dialog = bootstrap.Modal.getOrCreateInstance(modal);
  type PinMode = "confirm" | "update" | "reset";
  let pinSet = false;
  let mode: PinMode = "confirm";
  let pending: { resolve: (grant: string | null) => void; systemId: number; systemName: string; action: "details" | "update" | "password" } | null = null;

  modal.addEventListener("hidden.bs.modal", () => {
    clearSecrets();
    mode = "confirm";
    if (pending) {
      pending.resolve(null);
      pending = null;
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submit();
  });
  for (const input of methodInputs) {
    input.addEventListener("change", showChosenMethod);
  }
  updatePinButton.addEventListener("click", () => showPinChange("update"));
  resetPinButton.addEventListener("click", () => showPinChange("reset"));
  backButton.addEventListener("click", () => {
    clearSecrets();
    hideAlert();
    showConfirm();
  });

  window.CmsRemoteDeskAuth = {
    confirm(request) {
      if (pending) {
        pending.resolve(null);
      }
      return new Promise((resolve) => {
        pending = { resolve, ...request };
        clearSecrets();
        hideAlert();
        mode = "confirm";
        title.textContent = "Confirm it's you";
        target.textContent = request.systemName;
        message.textContent = promptFor(request.action);
        submitButton.textContent = "Continue";
        submitButton.disabled = true;
        const pinChoice = methodInputs.find((input) => input.value === "pin");
        if (pinChoice) {
          pinChoice.checked = true;
        }
        showChosenMethod();
        dialog.show();
        void prepare();
      });
    },
  };

  function promptFor(action: "details" | "update" | "password"): string {
    if (action === "update") {
      return "Enter your PIN or account password to view or update this system.";
    }
    if (action === "password") {
      return "Enter your PIN or account password to copy this password.";
    }
    return "Enter your PIN or account password to show this system's details.";
  }

  async function prepare(): Promise<void> {
    const status = await request<AuthStatus>("GET", "/remote-desk-auth");
    pinSet = status?.payload.pin_set === true;
    pinConfirmWrap.hidden = pinSet;
    submitButton.disabled = false;
    showChosenMethod();
  }

  function showPinChange(next: "update" | "reset"): void {
    mode = next;
    clearSecrets();
    hideAlert();
    title.textContent = next === "update" ? "Update PIN" : "Reset PIN";
    message.textContent = next === "update"
      ? "Enter your current PIN, then choose a new one."
      : "Enter your account password, then choose a new PIN.";
    submitButton.textContent = next === "update" ? "Save PIN" : "Reset PIN";
    showChosenMethod();
    if (next === "update") {
      currentPin.focus();
    } else {
      resetPassword.focus();
    }
  }

  function showConfirm(): void {
    mode = "confirm";
    title.textContent = "Confirm it's you";
    message.textContent = pending ? promptFor(pending.action) : "Enter your PIN or account password to show this system's details.";
    submitButton.textContent = "Continue";
    showChosenMethod();
    if (chosenMethod() === "pin") {
      pinInput.focus();
    } else {
      passwordInput.focus();
    }
  }

  async function submit(): Promise<void> {
    if (!pending) {
      return;
    }
    hideAlert();
    submitButton.disabled = true;
    if (mode !== "confirm") {
      await savePin();
      return;
    }
    const body: Record<string, unknown> = { system_id: pending.systemId };
    const method = chosenMethod();
    if (method === "pin") {
      const pin = pinInput.value.replace(/\D/g, "");
      if (!/^\d{4,8}$/.test(pin)) {
        showAlert("Enter a PIN of 4 to 8 digits.");
        submitButton.disabled = false;
        pinInput.focus();
        return;
      }
      if (!pinSet && pin !== pinConfirm.value.replace(/\D/g, "")) {
        showAlert("Those PINs don't match.");
        submitButton.disabled = false;
        return;
      }
      body.method = "pin";
      body.pin = pin;
      if (!pinSet) {
        body.pin_confirmation = pinConfirm.value.replace(/\D/g, "");
      }
    } else {
      if (passwordInput.value === "") {
        showAlert("Enter your account password.");
        submitButton.disabled = false;
        passwordInput.focus();
        return;
      }
      body.method = "password";
      body.password = passwordInput.value;
    }

    submitButton.textContent = "Checking…";
    const result = await request<AuthorizeResponse>("POST", "/credential-confirm", body);
    submitButton.textContent = "Continue";
    submitButton.disabled = false;
    if (!result) {
      showAlert("Couldn't reach the server. Check your connection and try again.");
      return;
    }
    if (result.status === 200 && result.payload.grant) {
      const grant = result.payload.grant;
      const waiting = pending;
      pending = null;
      dialog.hide();
      waiting.resolve(grant);
      return;
    }
    showAlert(result.payload.message ?? "Those details couldn't be confirmed.");
  }

  async function savePin(): Promise<void> {
    const body: Record<string, unknown> = { action: mode };
    if (mode === "update") {
      const current = digits(currentPin.value);
      if (!/^\d{4,8}$/.test(current)) {
        showAlert("Enter your current PIN.");
        submitButton.disabled = false;
        currentPin.focus();
        return;
      }
      body.pin = current;
    } else if (resetPassword.value === "") {
      showAlert("Enter your account password.");
      submitButton.disabled = false;
      resetPassword.focus();
      return;
    } else {
      body.password = resetPassword.value;
    }
    const fresh = digits(newPin.value);
    const again = digits(newPinConfirm.value);
    if (!/^\d{4,8}$/.test(fresh)) {
      showAlert("Enter a PIN of 4 to 8 digits.");
      submitButton.disabled = false;
      newPin.focus();
      return;
    }
    if (fresh !== again) {
      showAlert("Those PINs don't match.");
      submitButton.disabled = false;
      newPinConfirm.focus();
      return;
    }
    body.new_pin = fresh;
    body.new_pin_confirmation = again;
    const waitingLabel = submitButton.textContent;
    submitButton.textContent = "Saving…";
    const result = await request<AuthorizeResponse>("POST", "/remote-desk-auth/pin", body);
    submitButton.textContent = waitingLabel;
    submitButton.disabled = false;
    if (!result) {
      showAlert("Couldn't reach the server. Check your connection and try again.");
      return;
    }
    if (result.status === 200) {
      pinSet = true;
      clearSecrets();
      showConfirm();
      showAlert(result.payload.message ?? "Your PIN has been saved.");
      return;
    }
    showAlert(result.payload.message ?? "That PIN couldn't be saved.");
  }

  function digits(value: string): string {
    return value.replace(/\D/g, "");
  }

  function clearSecrets(): void {
    passwordInput.value = "";
    pinInput.value = "";
    pinConfirm.value = "";
    currentPin.value = "";
    resetPassword.value = "";
    newPin.value = "";
    newPinConfirm.value = "";
  }

  function chosenMethod(): "pin" | "password" {
    const selected = methodInputs.find((input) => input.checked);
    return selected?.value === "password" ? "password" : "pin";
  }

  function showChosenMethod(): void {
    const changing = mode !== "confirm";
    const pin = !changing && chosenMethod() === "pin";
    const methods = document.getElementById("remote-desk-auth-methods");
    if (methods) {
      methods.hidden = changing;
    }
    pinFields.hidden = changing || !pin;
    passwordWrap.hidden = changing || pin;
    pinActions.hidden = changing || !pinSet || !pin;
    pinChange.hidden = !changing;
    currentWrap.hidden = mode !== "update";
    resetPasswordWrap.hidden = mode !== "reset";
    if (changing) {
      return;
    }
    if (pin) {
      pinInput.focus();
    } else {
      passwordInput.focus();
    }
  }

  async function request<T extends object>(method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<{ status: number; payload: T } | null> {
    try {
      const response = await fetch(api.url(path), {
        method,
        headers: api.headers(body ? { "Content-Type": "application/json" } : undefined),
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = (await response.json().catch(() => ({}))) as T;
      return { status: response.status, payload };
    } catch {
      return null;
    }
  }

  function showAlert(message: string): void {
    alertBox.textContent = message;
    alertBox.hidden = false;
  }

  function hideAlert(): void {
    alertBox.hidden = true;
    alertBox.textContent = "";
  }
})();
