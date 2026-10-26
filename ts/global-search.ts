(() => {
  type Permission = "any" | "systems" | "users" | "audit" | "admin";
  type Behavior = "click" | "focus";

  interface SearchEntry {
    id: string;
    title: string;
    detail: string;
    keywords: string;
    permission: Permission;
    href: string;
    selector?: string;
    behavior?: Behavior;
    openSettings?: boolean;
  }

  const STORAGE_KEY = "cms-search-go";
  const MAX_RESULTS = 8;

  /** Pages and controls that exist in CMS. Record values are never included. */
  const ENTRIES: readonly SearchEntry[] = [
    {
      id: "dashboard",
      title: "Dashboard",
      detail: "Welcome, notifications, activity charts, production systems, and sign-in history.",
      keywords: "home overview welcome",
      permission: "any",
      href: "dashboard.html",
      selector: "#welcome-name",
      behavior: "focus",
    },
    {
      id: "notifications",
      title: "Notifications",
      detail: "Website status changes on the dashboard, including mark all as read.",
      keywords: "alerts bell unread",
      permission: "any",
      href: "dashboard.html",
      selector: "#notifications-title",
      behavior: "focus",
    },
    {
      id: "remote-desks-chart",
      title: "Remote desks opened",
      detail: "Dashboard chart of remote desks opened this week, last week, or the last 30 days.",
      keywords: "chart bar line graph activity remote desk",
      permission: "audit",
      href: "dashboard.html",
      selector: "#dashboard-activity-remote-desks-title",
      behavior: "focus",
    },
    {
      id: "credential-changes-chart",
      title: "Credential changes",
      detail: "Dashboard chart of credentials registered, updated, or removed.",
      keywords: "chart bar line graph activity credentials",
      permission: "audit",
      href: "dashboard.html",
      selector: "#dashboard-activity-credential-changes-title",
      behavior: "focus",
    },
    {
      id: "account-changes-chart",
      title: "Account changes",
      detail: "Dashboard chart of accounts registered, updated, disabled, or removed.",
      keywords: "chart bar line graph activity users accounts",
      permission: "audit",
      href: "dashboard.html",
      selector: "#dashboard-activity-account-changes-title",
      behavior: "focus",
    },
    {
      id: "production-systems",
      title: "Production systems",
      detail: "Dashboard list of production systems and whether each web address answered.",
      keywords: "status monitor up down",
      permission: "any",
      href: "dashboard.html",
      selector: "#dashboard-systems",
      behavior: "focus",
    },
    {
      id: "sign-in-history",
      title: "Sign-in history",
      detail: "Recent CMS sign-ins. Shown to administrators on the dashboard.",
      keywords: "logged in users timeline activity",
      permission: "admin",
      href: "dashboard.html",
      selector: "#dashboard-sign-ins",
      behavior: "focus",
    },
    {
      id: "credentials",
      title: "Credentials",
      detail: "Register, view, update, or remove access details for PPA systems.",
      keywords: "systems credentials management anydesk rustdesk rdp ssh mysql domain vm local ip remote",
      permission: "systems",
      href: "systems.html",
      selector: "#systems-heading",
      behavior: "focus",
    },
    {
      id: "register-system",
      title: "Register system",
      detail: "Open the form to add a system.",
      keywords: "create add new system credentials",
      permission: "systems",
      href: "systems.html",
      selector: "[data-action='create']",
      behavior: "click",
    },
    {
      id: "setup-rdp",
      title: "Set up one-click RDP",
      detail: "Install the handler so an RDP entry can open from this computer.",
      keywords: "remote desktop setup link",
      permission: "systems",
      href: "systems.html",
      selector: "[data-action='link-setup'][data-setup='rdp']",
      behavior: "click",
    },
    {
      id: "setup-ssh",
      title: "Set up one-click SSH",
      detail: "Install the handler so an SSH entry can open from this computer.",
      keywords: "secure shell setup link",
      permission: "systems",
      href: "systems.html",
      selector: "[data-action='link-setup'][data-setup='ssh']",
      behavior: "click",
    },
    {
      id: "filter-production",
      title: "Production credentials",
      detail: "Show systems marked Production.",
      keywords: "environment filter production",
      permission: "systems",
      href: "systems.html",
      selector: "[data-environment='production']",
      behavior: "click",
    },
    {
      id: "filter-test",
      title: "Test credentials",
      detail: "Show systems marked Test.",
      keywords: "environment filter test",
      permission: "systems",
      href: "systems.html",
      selector: "[data-environment='test']",
      behavior: "click",
    },
    {
      id: "filter-legacy",
      title: "Legacy credentials",
      detail: "Show systems marked Legacy.",
      keywords: "environment filter legacy",
      permission: "systems",
      href: "systems.html",
      selector: "[data-environment='legacy']",
      behavior: "click",
    },
    {
      id: "systems-audit",
      title: "Systems audit trail",
      detail: "Activity copied from UAMS, CMIS, and PPIS.",
      keywords: "audit log history date",
      permission: "audit",
      href: "audit-trail.html",
      selector: "#audit-heading",
      behavior: "focus",
    },
    {
      id: "systems-audit-refresh",
      title: "Refresh systems audit trail",
      detail: "Read the latest activity from UAMS, CMIS, and PPIS.",
      keywords: "sync reload audit",
      permission: "audit",
      href: "audit-trail.html",
      selector: "#audit-refresh",
      behavior: "click",
    },
    {
      id: "audit-uams",
      title: "UAMS audit records",
      detail: "Filter the systems audit trail to UAMS.",
      keywords: "uams source",
      permission: "audit",
      href: "audit-trail.html",
      selector: "[data-source='uams']",
      behavior: "click",
    },
    {
      id: "audit-cmis",
      title: "CMIS audit records",
      detail: "Filter the systems audit trail to CMIS.",
      keywords: "cmis source",
      permission: "audit",
      href: "audit-trail.html",
      selector: "[data-source='cmis']",
      behavior: "click",
    },
    {
      id: "audit-ppis",
      title: "PPIS audit records",
      detail: "Filter the systems audit trail to PPIS.",
      keywords: "ppis source",
      permission: "audit",
      href: "audit-trail.html",
      selector: "[data-source='ppis']",
      behavior: "click",
    },
    {
      id: "cms-audit",
      title: "CMS audit trail",
      detail: "Sign-ins, sign-outs, credential changes, remote desk opens, and account changes.",
      keywords: "cms activity log history",
      permission: "audit",
      href: "cms-audit-trail.html",
      selector: "#cms-audit-heading",
      behavior: "focus",
    },
    {
      id: "cms-audit-refresh",
      title: "Refresh CMS audit trail",
      detail: "Reload activity recorded in this system.",
      keywords: "reload cms audit",
      permission: "audit",
      href: "cms-audit-trail.html",
      selector: "#cms-audit-refresh",
      behavior: "click",
    },
    {
      id: "cms-audit-session",
      title: "Sign-in audit records",
      detail: "Filter the CMS audit trail to sign-ins and sign-outs.",
      keywords: "session module",
      permission: "audit",
      href: "cms-audit-trail.html",
      selector: "[data-module='session']",
      behavior: "click",
    },
    {
      id: "cms-audit-credentials",
      title: "Credential change records",
      detail: "Filter the CMS audit trail to credential changes.",
      keywords: "credentials module",
      permission: "audit",
      href: "cms-audit-trail.html",
      selector: "[data-module='credentials']",
      behavior: "click",
    },
    {
      id: "cms-audit-users",
      title: "User account change records",
      detail: "Filter the CMS audit trail to user account changes.",
      keywords: "users module accounts",
      permission: "audit",
      href: "cms-audit-trail.html",
      selector: "[data-module='users']",
      behavior: "click",
    },
    {
      id: "users",
      title: "Users",
      detail: "View, update, disable, or remove CMS accounts.",
      keywords: "accounts registered users active",
      permission: "users",
      href: "users.html",
      selector: "#users-heading",
      behavior: "focus",
    },
    {
      id: "register-user",
      title: "Register user",
      detail: "Create an account and choose the User or Administrator role.",
      keywords: "add account new user role",
      permission: "users",
      href: "register.html",
      selector: "#first_name",
      behavior: "focus",
    },
    {
      id: "reset-password",
      title: "Reset password",
      detail: "Set a new password for an account from the Users page.",
      keywords: "password reset",
      permission: "users",
      href: "users.html",
      selector: "#users-heading",
      behavior: "focus",
    },
    {
      id: "account-status",
      title: "Disable or enable an account",
      detail: "Active and Disabled filters are on the Users page. The change is on each row.",
      keywords: "status active disabled user",
      permission: "users",
      href: "users.html",
      selector: "#users-heading",
      behavior: "focus",
    },
    {
      id: "remove-user",
      title: "Remove an account",
      detail: "Remove is on each row of the Users page.",
      keywords: "delete user account",
      permission: "users",
      href: "users.html",
      selector: "#users-heading",
      behavior: "focus",
    },
    {
      id: "update-account",
      title: "Update account",
      detail: "Change your name, email, username, or password.",
      keywords: "profile first name last name middle suffix email password username",
      permission: "any",
      href: "",
      selector: "#account-update-open",
      behavior: "click",
    },
    {
      id: "sign-out",
      title: "Sign out",
      detail: "End this session.",
      keywords: "logout log out signout",
      permission: "any",
      href: "",
      selector: "#sign-out",
      behavior: "click",
    },
    {
      id: "theme",
      title: "Dark mode",
      detail: "Switch the CMS between dark and light mode.",
      keywords: "theme dark mode light mode appearance",
      permission: "any",
      href: "",
      selector: "#theme-toggle",
      behavior: "click",
    },
    {
      id: "configurator",
      title: "Dashboard configurator",
      detail: "Sidebar colors, sidenav type, and fixed navbar.",
      keywords: "settings appearance cog gear",
      permission: "any",
      href: "",
      selector: ".fixed-plugin-button-nav",
      behavior: "click",
    },
    {
      id: "sidebar-colors",
      title: "Sidebar colors",
      detail: "Primary, dark, info, success, warning, and danger.",
      keywords: "color sidenav orange blue green red",
      permission: "any",
      href: "",
      selector: ".switch-trigger.background-color",
      behavior: "focus",
      openSettings: true,
    },
    {
      id: "sidenav-transparent",
      title: "Transparent sidenav",
      detail: "Use the transparent sidebar.",
      keywords: "sidenav type transparent",
      permission: "any",
      href: "",
      selector: "[data-class='bg-transparent']",
      behavior: "click",
      openSettings: true,
    },
    {
      id: "sidenav-solid",
      title: "Solid sidenav",
      detail: "Use the solid sidebar.",
      keywords: "sidenav type solid",
      permission: "any",
      href: "",
      selector: "[data-class='bg-white']",
      behavior: "click",
      openSettings: true,
    },
    {
      id: "navbar-fixed",
      title: "Fixed navbar",
      detail: "Keep the top bar in place while the page scrolls.",
      keywords: "navbar fixed sticky pin",
      permission: "any",
      href: "",
      selector: "#navbarFixed",
      behavior: "focus",
      openSettings: true,
    },
  ];

  const input = document.querySelector<HTMLInputElement>("[data-global-search]");
  if (!input) {
    return;
  }
  const field: HTMLInputElement = input;

  const group = input.closest(".input-group");
  const anchor = group instanceof HTMLElement ? group : input.parentElement;
  if (!(anchor instanceof HTMLElement)) {
    return;
  }

  const panel = document.createElement("div");
  panel.id = "global-search-results";
  panel.className = "global-search-panel";
  panel.hidden = true;
  panel.setAttribute("role", "listbox");
  anchor.append(panel);

  const live = document.createElement("p");
  live.className = "visually-hidden";
  live.setAttribute("aria-live", "polite");
  anchor.append(live);

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", panel.id);
  input.setAttribute("aria-expanded", "false");

  let activeIndex = -1;
  let visible: SearchEntry[] = [];
  let pendingId: string | null = null;
  let pendingAttempts = 0;

  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored) {
    sessionStorage.removeItem(STORAGE_KEY);
    pendingId = stored;
  }

  input.addEventListener("focus", render);
  input.addEventListener("pointerdown", render);
  input.addEventListener("input", render);
  input.addEventListener("keydown", onKeyDown);
  panel.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  document.addEventListener("pointerdown", (event) => {
    if (event.target instanceof Node && (anchor.contains(event.target) || panel.contains(event.target))) {
      return;
    }
    closePanel();
  });
  document.addEventListener("cms:user", () => {
    tryPending();
    if (!panel.hidden) {
      render();
    }
  });
  window.addEventListener("resize", () => {
    if (!panel.hidden) {
      placePanel();
    }
  });
  window.addEventListener("scroll", () => {
    if (!panel.hidden) {
      placePanel();
    }
  }, true);

  tryPending();

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      if (!panel.hidden) {
        event.preventDefault();
        closePanel();
      }
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (visible.length === 0) {
        return;
      }
      event.preventDefault();
      if (panel.hidden) {
        render();
      }
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const next = activeIndex + direction;
      activeIndex = next < 0 ? visible.length - 1 : next % visible.length;
      paintActive();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const entry = visible[activeIndex] ?? visible[0];
      if (entry) {
        choose(entry);
      }
    }
  }

  function render(): void {
    const query = normalize(field.value);
    visible = query === "" ? [] : search(query);
    activeIndex = visible.length === 0 ? -1 : 0;
    panel.replaceChildren();

    if (query === "") {
      panel.append(emptyMessage("Type to search pages and actions."));
      live.textContent = "Type to search pages and actions.";
    } else if (visible.length === 0) {
      panel.append(emptyMessage("Nothing in CMS matches that search."));
      live.textContent = "Nothing in CMS matches that search.";
    } else {
      visible.forEach((entry, index) => {
        panel.append(optionButton(entry, index));
      });
      live.textContent = visible.length === 1 ? "1 result." : `${visible.length} results.`;
    }

    openPanel();
    paintActive();
  }

  function optionButton(entry: SearchEntry, index: number): HTMLButtonElement {
    const shown = presentation(entry);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "global-search-option";
    button.id = `global-search-option-${entry.id}`;
    button.setAttribute("role", "option");
    button.dataset.index = String(index);
    const title = document.createElement("span");
    title.className = "global-search-title";
    title.textContent = shown.title;
    const detail = document.createElement("span");
    detail.className = "global-search-detail";
    detail.textContent = shown.detail;
    button.append(title, detail);
    button.addEventListener("click", () => {
      choose(entry);
    });
    return button;
  }

  function emptyMessage(text: string): HTMLParagraphElement {
    const message = document.createElement("p");
    message.className = "global-search-empty";
    message.textContent = text;
    return message;
  }

  function search(query: string): SearchEntry[] {
    const terms = query.split(" ").filter((term) => term !== "");
    return ENTRIES
      .filter((entry) => allowed(entry))
      .map((entry) => ({ entry, score: scoreEntry(entry, query, terms) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.entry.title.localeCompare(right.entry.title))
      .slice(0, MAX_RESULTS)
      .map((item) => item.entry);
  }

  function scoreEntry(entry: SearchEntry, query: string, terms: string[]): number {
    const shown = presentation(entry);
    const title = normalize(shown.title);
    const haystack = normalize(`${shown.title} ${entry.detail} ${entry.keywords}`);
    if (!terms.every((term) => haystack.includes(term))) {
      return 0;
    }
    if (title === query) {
      return 400;
    }
    if (title.startsWith(query)) {
      return 300;
    }
    if (title.includes(query)) {
      return 200;
    }
    return 100;
  }

  function choose(entry: SearchEntry): void {
    closePanel();
    field.value = "";
    if (entry.href !== "" && pageFile(entry.href) !== currentPage()) {
      sessionStorage.setItem(STORAGE_KEY, entry.id);
      window.location.assign(entry.href);
      return;
    }
    activate(entry);
  }

  function tryPending(): void {
    if (!pendingId) {
      return;
    }
    const entry = ENTRIES.find((item) => item.id === pendingId);
    if (!entry) {
      pendingId = null;
      return;
    }
    if (entry.permission !== "any" && !window.CMS_USER) {
      if (pendingAttempts < 40) {
        pendingAttempts += 1;
        window.setTimeout(tryPending, 50);
      }
      return;
    }
    pendingId = null;
    if (!allowed(entry) || (entry.href !== "" && pageFile(entry.href) !== currentPage())) {
      return;
    }
    activate(entry);
  }

  function activate(entry: SearchEntry): void {
    if (entry.openSettings) {
      openSettings();
    }
    if (!entry.selector) {
      return;
    }
    const target = document.querySelector(entry.selector);
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (entry.behavior === "click") {
      target.click();
      return;
    }
    target.scrollIntoView({ block: "center", inline: "nearest" });
    if (canFocus(target)) {
      target.focus({ preventScroll: true });
    }
  }

  function openSettings(): void {
    const settings = document.querySelector(".fixed-plugin");
    const button = document.querySelector(".fixed-plugin-button-nav");
    if (!(settings instanceof HTMLElement) || !(button instanceof HTMLElement)) {
      return;
    }
    if (!settings.classList.contains("show")) {
      button.click();
    }
  }

  function allowed(entry: SearchEntry): boolean {
    if (entry.permission === "any") {
      return true;
    }
    const user = window.CMS_USER;
    if (!user) {
      return false;
    }
    if (entry.permission === "systems") {
      return user.can?.manage_systems === true;
    }
    if (entry.permission === "users") {
      return user.can?.manage_users === true;
    }
    if (entry.permission === "audit") {
      return user.can?.view_audit_trail === true;
    }
    return user.role === "administrator" || user.can?.view_audit_trail === true;
  }

  function presentation(entry: SearchEntry): { title: string; detail: string } {
    if (entry.id !== "theme") {
      return { title: entry.title, detail: entry.detail };
    }
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    return dark
      ? { title: "Light mode", detail: "Switch the CMS to light mode." }
      : { title: "Dark mode", detail: "Switch the CMS to dark mode." };
  }

  function paintActive(): void {
    const options = panel.querySelectorAll<HTMLButtonElement>(".global-search-option");
    options.forEach((option, index) => {
      const selected = index === activeIndex;
      option.classList.toggle("is-active", selected);
      option.setAttribute("aria-selected", selected ? "true" : "false");
      if (selected) {
        field.setAttribute("aria-activedescendant", option.id);
        option.scrollIntoView({ block: "nearest" });
      }
    });
    if (activeIndex < 0) {
      field.removeAttribute("aria-activedescendant");
    }
  }

  function openPanel(): void {
    placePanel();
    panel.hidden = false;
    field.setAttribute("aria-expanded", "true");
  }

  function closePanel(): void {
    panel.hidden = true;
    panel.replaceChildren();
    visible = [];
    activeIndex = -1;
    field.setAttribute("aria-expanded", "false");
    field.removeAttribute("aria-activedescendant");
  }

  function placePanel(): void {
    const rect = field.getBoundingClientRect();
    panel.style.top = `${Math.round(rect.bottom + 6)}px`;
    panel.style.left = `${Math.round(rect.left)}px`;
    panel.style.width = `${Math.round(rect.width)}px`;
  }

  function normalize(value: string): string {
    return value.toLowerCase().replace(/\s+/g, " ").trim();
  }

  function currentPage(): string {
    const parts = window.location.pathname.split("/");
    return decodeURIComponent(parts[parts.length - 1] ?? "");
  }

  function pageFile(href: string): string {
    const file = href.split("?")[0]?.split("/").pop() ?? "";
    return file;
  }

  function canFocus(element: HTMLElement): boolean {
    return element.getAttribute("tabindex") === "-1"
      || element instanceof HTMLInputElement
      || element instanceof HTMLButtonElement
      || element instanceof HTMLAnchorElement
      || element instanceof HTMLSelectElement
      || element instanceof HTMLTextAreaElement;
  }
})();
