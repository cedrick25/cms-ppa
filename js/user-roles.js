"use strict";
(() => {
  const REQUEST_TIMEOUT_MS = 20000;
  const SEARCH_DELAY_MS = 300;
  const app = document.getElementById("roles-app");
  if (!(app instanceof HTMLElement) || typeof bootstrap === "undefined" || !window.CmsApi || !window.CmsApi.token()) {
    return;
  }
  const signInUrl = app.dataset.signInUrl || "sign-in.html";
  const heading = byId("roles-heading");
  const searchForm = byId("roles-search-form");
  const searchInput = byId("roles-search");
  const successBox = byId("roles-success");
  const successText = byId("roles-success-text");
  const errorBox = byId("roles-error");
  const errorText = byId("roles-error-text");
  const live = byId("roles-live");
  const loadingState = byId("roles-loading");
  const emptyState = byId("roles-empty");
  const noMatchState = byId("roles-no-match");
  const noMatchText = byId("roles-no-match-text");
  const loadErrorState = byId("roles-load-error");
  const loadErrorText = byId("roles-load-error-text");
  const tableWrap = byId("roles-table-wrap");
  const rowsBody = byId("roles-rows");
  const rowTemplate = byId("roles-row-template");
  const pagination = byId("roles-pagination");
  const rangeText = byId("roles-range");
  const prevButton = byId("roles-prev");
  const nextButton = byId("roles-next");
  const createButton = byId("roles-create");
  const formModalElement = byId("role-form-modal");
  const form = byId("role-form");
  const formTitle = byId("role-form-title");
  const formAlert = byId("role-form-alert");
  const nameInput = byId("role-name");
  const descriptionInput = byId("role-description");
  const viewModalElement = byId("role-view-modal");
  const viewTitle = byId("role-view-title");
  const viewBody = byId("role-view-body");
  const deleteModalElement = byId("role-delete-modal");
  const deleteForm = byId("role-delete-form");
  const deleteAlert = byId("role-delete-alert");
  const deleteText = byId("role-delete-text");
  const assignModalElement = byId("role-assign-modal");
  const assignForm = byId("role-assign-form");
  const assignAlert = byId("role-assign-alert");
  const assignIntro = byId("role-assign-intro");
  const assignList = byId("role-assign-list");
  const formModal = new bootstrap.Modal(formModalElement);
  const viewModal = new bootstrap.Modal(viewModalElement);
  const deleteModal = new bootstrap.Modal(deleteModalElement);
  const assignModal = new bootstrap.Modal(assignModalElement);
  const records = new Map();
  const state = { search: "", page: 1 };
  let listController = null;
  let searchTimer = 0;
  let activeRole = null;
  let formMode = "create";
  let busyModal = null;
  let catalog = null;

  for (const modal of [formModalElement, viewModalElement, deleteModalElement, assignModalElement]) {
    document.body.append(modal);
  }

  createButton.addEventListener("click", () => openForm("create"));
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.search = searchInput.value.trim().slice(0, 100);
    state.page = 1;
    void load();
  });
  searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      state.search = searchInput.value.trim().slice(0, 100);
      state.page = 1;
      void load();
    }, SEARCH_DELAY_MS);
  });
  byId("roles-clear").addEventListener("click", () => {
    searchInput.value = "";
    state.search = "";
    state.page = 1;
    void load();
  });
  byId("roles-retry").addEventListener("click", () => void load());
  prevButton.addEventListener("click", () => {
    state.page = Math.max(1, state.page - 1);
    void load();
  });
  nextButton.addEventListener("click", () => {
    state.page += 1;
    void load();
  });
  rowsBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const role = records.get(button.closest("tr").dataset.id);
    if (!role) return;
    if (button.dataset.action === "view") void openView(role);
    if (button.dataset.action === "update") openForm("update", role);
    if (button.dataset.action === "delete") openDelete(role);
    if (button.dataset.action === "assign") void openAssign(role);
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveRole();
  });
  deleteForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void removeRole();
  });
  assignForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void savePermissions();
  });
  assignList.addEventListener("change", refreshPermissionSummary);
  for (const box of [successBox, errorBox]) {
    box.querySelector(".users-feedback-close").addEventListener("click", () => {
      box.hidden = true;
    });
  }

  document.addEventListener("cms:user", () => {
    if (window.CMS_BLOCKED) return;
    void load();
  });
  if (window.CMS_USER && !window.CMS_BLOCKED) void load();

  async function load() {
    if (listController) listController.abort();
    listController = new AbortController();
    show(loadingState);
    const params = new URLSearchParams();
    if (state.search) params.set("search", state.search);
    if (state.page > 1) params.set("page", String(state.page));
    const query = params.toString();
    const result = await request("GET", window.CmsApi.url("/user-roles" + (query ? "?" + query : "")), null, listController);
    if (result.status === 0 && result.aborted) return;
    if (result.status !== 200 || !result.payload || !Array.isArray(result.payload.data)) {
      loadErrorText.textContent = failureMessage(result, "Couldn't load user roles");
      show(loadErrorState);
      live.textContent = loadErrorText.textContent;
      return;
    }
    const meta = result.payload.meta || {};
    records.clear();
    rowsBody.replaceChildren();
    for (const role of result.payload.data) {
      records.set(String(role.id), role);
      rowsBody.append(renderRow(role));
    }
    if (window.CmsPermissions) window.CmsPermissions.apply(rowsBody);
    const total = Number(meta.total || 0);
    if (total === 0 && state.search === "") {
      show(emptyState);
    } else if (result.payload.data.length === 0) {
      noMatchText.textContent = state.search ? `No roles found matching “${state.search}”.` : "Try a different search.";
      show(noMatchState);
    } else {
      show(tableWrap);
    }
    const lastPage = Number(meta.last_page || 1);
    state.page = Math.min(state.page, lastPage);
    pagination.hidden = lastPage <= 1;
    prevButton.disabled = Number(meta.current_page || 1) <= 1;
    nextButton.disabled = Number(meta.current_page || 1) >= lastPage;
    rangeText.textContent = total === 0 ? "" : `Showing ${meta.from}–${meta.to} of ${total}`;
    live.textContent = total === 1 ? "1 role." : `${total} roles.`;
  }

  function renderRow(role) {
    const row = rowTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.id = String(role.id);
    row.querySelector('[data-field="name"]').textContent = role.name;
    const description = row.querySelector('[data-field="description"]');
    description.textContent = role.built_in ? "Built-in role" : (role.description || "No description");
    const count = Number(role.permission_count || 0);
    row.querySelector('[data-field="count"]').textContent = count === 1 ? "1 permission" : `${count} permissions`;
    if (role.built_in) row.querySelector('[data-action="delete"]').hidden = true;
    return row;
  }

  function openForm(mode, role) {
    formMode = mode;
    activeRole = role || null;
    clearField(nameInput, "role-name-error");
    clearField(descriptionInput, "role-description-error");
    formAlert.hidden = true;
    formTitle.textContent = mode === "create" ? "Create role" : "Update role";
    form.querySelector(".users-button-label").textContent = mode === "create" ? "Create" : "Update";
    nameInput.value = role ? role.name : "";
    descriptionInput.value = role && role.description ? role.description : "";
    formModal.show();
    nameInput.focus();
  }

  async function saveRole() {
    clearField(nameInput, "role-name-error");
    clearField(descriptionInput, "role-description-error");
    const name = nameInput.value.trim();
    const description = descriptionInput.value.trim();
    if (name === "") {
      setField(nameInput, "role-name-error", "Enter a role name.");
      return;
    }
    const body = { name, description };
    const path = formMode === "create" ? "/user-roles" : `/user-roles/${activeRole.id}`;
    const result = await send(formModalElement, formMode === "create" ? "POST" : "PATCH", path, body);
    if (result.status === 201 || result.status === 200) {
      formModal.hide();
      flash(result.payload.message || "Role saved.");
      state.page = 1;
      void load();
      return;
    }
    showModalError(formAlert, result, "Couldn't save this role", { name: nameInput, description: descriptionInput });
  }

  async function openView(role) {
    viewTitle.textContent = role.name;
    viewBody.replaceChildren(paragraph("Loading role details…"));
    viewModal.show();
    const result = await request("GET", window.CmsApi.url(`/user-roles/${role.id}`));
    if (result.status !== 200 || !result.payload || !result.payload.data) {
      viewBody.replaceChildren(paragraph(failureMessage(result, "Couldn't load this role")));
      return;
    }
    const data = result.payload.data;
    viewTitle.textContent = data.name;
    viewBody.replaceChildren();
    const summary = document.createElement("p");
    summary.className = "text-sm";
    summary.textContent = data.description || "No description";
    viewBody.append(summary);
    if (data.built_in) {
      const note = document.createElement("p");
      note.className = "text-xs text-secondary";
      note.textContent = "This built-in role is used by accounts with the same role.";
      viewBody.append(note);
    }
    const permissions = Array.isArray(data.permissions) ? data.permissions : [];
    if (permissions.length === 0) {
      viewBody.append(paragraph("No permissions are assigned."));
      return;
    }
    const groups = new Map();
    for (const permission of permissions) {
      const label = permission.module_label || permission.module;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(permission);
    }
    for (const [label, items] of groups) {
      const title = document.createElement("h6");
      title.className = "text-sm mt-3 mb-2";
      title.textContent = label;
      const list = document.createElement("ul");
      list.className = "text-sm mb-0 ps-3";
      for (const item of items) {
        const entry = document.createElement("li");
        entry.className = "mb-2";
        const name = document.createElement("strong");
        name.textContent = item.label;
        entry.append(name);
        if (item.description) {
          const detail = document.createElement("div");
          detail.className = "text-xs text-secondary";
          detail.textContent = item.description;
          entry.append(detail);
        }
        const code = document.createElement("div");
        code.className = "permission-code";
        code.textContent = item.code;
        entry.append(code);
        list.append(entry);
      }
      viewBody.append(title, list);
    }
  }

  function openDelete(role) {
    activeRole = role;
    deleteAlert.hidden = true;
    deleteText.textContent = `Delete ${role.name}? Accounts keep their current Administrator or User role. This can't be undone.`;
    deleteModal.show();
  }

  async function removeRole() {
    const result = await send(deleteModalElement, "DELETE", `/user-roles/${activeRole.id}`);
    if (result.status === 200) {
      deleteModal.hide();
      flash(result.payload.message || "Role deleted.");
      void load();
      return;
    }
    showModalError(deleteAlert, result, "Couldn't delete this role");
  }

  async function openAssign(role) {
    activeRole = role;
    assignAlert.hidden = true;
    assignIntro.textContent = `Choose the data permissions for ${role.name}.`;
    assignList.replaceChildren(paragraph("Loading permissions…"));
    assignModal.show();
    const [detail, groups] = await Promise.all([
      request("GET", window.CmsApi.url(`/user-roles/${role.id}`)),
      catalog ? Promise.resolve({ status: 200, payload: { data: catalog } }) : request("GET", window.CmsApi.url("/data-permissions")),
    ]);
    if (groups.status !== 200 || !groups.payload || !Array.isArray(groups.payload.data)) {
      assignList.replaceChildren(paragraph(failureMessage(groups, "Couldn't load permissions")));
      return;
    }
    catalog = groups.payload.data;
    const selected = new Set();
    if (detail.status === 200 && detail.payload && detail.payload.data && Array.isArray(detail.payload.data.permissions)) {
      for (const permission of detail.payload.data.permissions) selected.add(permission.code);
    }
    assignList.replaceChildren();
    const summary = document.createElement("p");
    summary.className = "permission-summary";
    summary.id = "role-assign-summary";
    assignList.append(summary);
    for (const group of catalog) {
      const section = document.createElement("section");
      section.className = "permission-group";
      const header = document.createElement("div");
      header.className = "permission-group-header";
      const title = document.createElement("h6");
      title.textContent = group.label;
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "permission-group-toggle";
      header.append(title, toggle);
      section.append(header);
      const choices = document.createElement("div");
      choices.className = "permission-group-choices";
      for (const permission of group.permissions) {
        const id = `permission-${permission.code}`;
        const choice = document.createElement("label");
        choice.className = "permission-choice";
        choice.htmlFor = id;
        const input = document.createElement("input");
        input.className = "permission-choice-input";
        input.type = "checkbox";
        input.id = id;
        input.value = permission.code;
        input.checked = selected.has(permission.code);
        const box = document.createElement("span");
        box.className = "permission-choice-box";
        box.setAttribute("aria-hidden", "true");
        const copy = document.createElement("span");
        copy.className = "permission-choice-copy";
        const name = document.createElement("span");
        name.className = "permission-choice-name";
        name.textContent = permission.label;
        const detailText = document.createElement("span");
        detailText.className = "permission-choice-detail";
        detailText.textContent = permission.description;
        copy.append(name, detailText);
        choice.append(input, box, copy);
        choices.append(choice);
      }
      section.append(choices);
      toggle.addEventListener("click", () => {
        const boxes = Array.from(choices.querySelectorAll(".permission-choice-input"));
        const allOn = boxes.every((box) => box.checked);
        for (const box of boxes) box.checked = !allOn;
        refreshPermissionSummary();
      });
      assignList.append(section);
    }
    refreshPermissionSummary();
  }

  function refreshPermissionSummary() {
    const summary = document.getElementById("role-assign-summary");
    const boxes = Array.from(assignList.querySelectorAll(".permission-choice-input"));
    const selectedCount = boxes.filter((box) => box.checked).length;
    if (summary) summary.textContent = selectedCount === 1 ? "1 permission selected" : `${selectedCount} permissions selected`;
    for (const section of assignList.querySelectorAll(".permission-group")) {
      const groupBoxes = Array.from(section.querySelectorAll(".permission-choice-input"));
      const toggle = section.querySelector(".permission-group-toggle");
      const on = groupBoxes.filter((box) => box.checked).length;
      toggle.textContent = on === groupBoxes.length && groupBoxes.length > 0 ? "Clear" : "Select all";
      toggle.setAttribute("aria-pressed", on === groupBoxes.length ? "true" : "false");
    }
  }

  async function savePermissions() {
    const permissions = Array.from(assignList.querySelectorAll(".permission-choice-input:checked")).map((input) => input.value);
    const result = await send(assignModalElement, "PUT", `/user-roles/${activeRole.id}/permissions`, { permissions });
    if (result.status === 200) {
      assignModal.hide();
      flash(result.payload.message || "Permissions saved.");
      void load();
      return;
    }
    showModalError(assignAlert, result, "Couldn't assign permissions");
  }

  function show(visible) {
    for (const element of [loadingState, emptyState, noMatchState, loadErrorState, tableWrap]) {
      element.hidden = element !== visible;
    }
  }

  function flash(message) {
    successText.textContent = message;
    successBox.hidden = false;
    errorBox.hidden = true;
    live.textContent = message;
    heading.focus();
  }

  function showModalError(alertBox, result, prefix, fields) {
    const errors = result.payload && result.payload.errors ? result.payload.errors : {};
    if (fields) {
      for (const [name, input] of Object.entries(fields)) {
        const message = errors[name] && errors[name][0];
        if (message) setField(input, `${input.id}-error`, message);
      }
    }
    alertBox.textContent = failureMessage(result, prefix);
    alertBox.hidden = false;
    alertBox.focus();
  }

  function failureMessage(result, prefix) {
    const message = result.payload && result.payload.message;
    if (result.status === 401) return `${message || "Your session has ended."} Sign in again to continue.`;
    if (result.status === 403) return message || `${prefix}. Your account isn't allowed to do that.`;
    if (result.status === 404) return message || `${prefix}. That role no longer exists.`;
    if (result.status === 422) return message || `${prefix}. Check the form and try again.`;
    if (result.status === 0) return `${prefix}. Couldn't connect to the server.`;
    return message || `${prefix}. Try again in a moment.`;
  }

  async function send(modal, method, path, body) {
    setBusy(modal, true);
    try {
      return await request(method, window.CmsApi.url(path), body);
    } finally {
      setBusy(modal, false);
    }
  }

  async function request(method, url, body, controller = new AbortController()) {
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method,
        signal: controller.signal,
        headers: window.CmsApi.headers(body ? { "Content-Type": "application/json" } : undefined),
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        window.CmsApi.clearToken();
        window.location.assign(signInUrl);
      }
      return { status: response.status, payload, aborted: false };
    } catch (error) {
      return { status: timedOut ? -1 : 0, payload: {}, aborted: error && error.name === "AbortError" && !timedOut };
    } finally {
      window.clearTimeout(timer);
    }
  }

  function setBusy(modal, busy) {
    busyModal = busy ? modal : null;
    for (const control of modal.querySelectorAll("button, input, textarea")) {
      if (busy) {
        control.dataset.wasDisabled = control.disabled ? "true" : "false";
        control.disabled = true;
      } else {
        control.disabled = control.dataset.wasDisabled === "true";
        delete control.dataset.wasDisabled;
      }
    }
    const submit = modal.querySelector('button[type="submit"]');
    if (!submit) return;
    const spinner = submit.querySelector(".spinner-border");
    if (spinner) spinner.hidden = !busy;
    const label = submit.querySelector(".users-button-label");
    if (!label) return;
    if (busy) {
      submit.dataset.idleLabel = label.textContent;
      label.textContent = submit.dataset.busyLabel || "Working…";
    } else if (submit.dataset.idleLabel) {
      label.textContent = submit.dataset.idleLabel;
    }
  }

  function paragraph(text) {
    const element = document.createElement("p");
    element.className = "text-sm mb-0";
    element.textContent = text;
    return element;
  }

  function setField(input, errorId, message) {
    input.classList.add("is-invalid");
    input.setAttribute("aria-invalid", "true");
    byId(errorId).textContent = message;
  }

  function clearField(input, errorId) {
    input.classList.remove("is-invalid");
    input.removeAttribute("aria-invalid");
    byId(errorId).textContent = "";
  }

  function byId(id) {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing #${id}`);
    return element;
  }
})();
