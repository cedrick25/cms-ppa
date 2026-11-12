(function () {
  var page = document.body.dataset.page || "";
  var signIn = "sign-in.html";

  function allowsPermission(code) {
    var user = window.CMS_USER;
    if (!user || !code) return true;
    if (Array.isArray(user.permissions)) return user.permissions.indexOf(code) !== -1;
    return user.role === "administrator";
  }

  function applyPermissionElement(el) {
    var any = el.getAttribute("data-permission-any");
    var ok = any
      ? any.split(/\s+/).some(allowsPermission)
      : allowsPermission(el.getAttribute("data-permission"));
    if (!ok) {
      el.hidden = true;
      el.setAttribute("data-permission-hidden", "true");
    } else if (el.getAttribute("data-permission-hidden") === "true") {
      el.hidden = false;
      el.removeAttribute("data-permission-hidden");
    }
  }

  function applyPermissions(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.matches && (root.hasAttribute("data-permission") || root.hasAttribute("data-permission-any"))) {
      applyPermissionElement(root);
    }
    root.querySelectorAll("[data-permission], [data-permission-any]").forEach(applyPermissionElement);
  }

  window.CmsPermissions = { apply: applyPermissions, allows: allowsPermission };

  if (!window.CmsApi || !window.CmsApi.token()) {
    window.location.replace(signIn);
    return;
  }

  var signOut = document.getElementById("sign-out");
  if (signOut) {
    signOut.addEventListener("click", function () {
      var button = signOut;
      button.disabled = true;
      fetch(window.CmsApi.url("/sign-out"), {
        method: "POST",
        headers: window.CmsApi.headers(),
      }).finally(function () {
        window.CmsApi.clearToken();
        window.location.assign(signIn);
      });
    });
  }

  function blockPage(message) {
    var container = document.querySelector(".container-fluid.py-4");
    if (container) {
      container.innerHTML = '<div class="alert alert-danger text-white" role="alert">' + message + "</div>";
    }
    window.CMS_BLOCKED = true;
  }

  fetch(window.CmsApi.url("/user"), { headers: window.CmsApi.headers() })
    .then(function (response) {
      if (response.status === 401) {
        window.CmsApi.clearToken();
        window.location.replace(signIn);
        return null;
      }
      return response.json().then(function (user) {
        return { status: response.status, user: user };
      });
    })
    .then(function (result) {
      if (!result) return;
      if (result.status === 403 || !result.user || !result.user.name) return;

      window.CMS_USER = result.user;
      var name = document.getElementById("welcome-name");
      var initial = document.getElementById("welcome-initial");
      if (name) name.textContent = result.user.name;
      if (initial) initial.textContent = result.user.name.trim().charAt(0).toUpperCase();

      var allowed = result.user.can && result.user.can.manage_users;
      document.querySelectorAll(".requires-manage-users").forEach(function (item) {
        item.hidden = !allowed;
      });
      if (!allowed && (page === "users" || page === "register")) {
        blockPage("You don't have permission to manage users.");
      }

      var systemsAllowed = result.user.can && result.user.can.manage_systems;
      document.querySelectorAll(".requires-manage-systems").forEach(function (item) {
        item.hidden = !systemsAllowed;
      });
      if (!systemsAllowed && page === "systems") {
        blockPage("You don't have permission to manage system credentials.");
      }

      var auditAllowed = result.user.can && result.user.can.view_audit_trail;
      document.querySelectorAll(".requires-view-audit-trail").forEach(function (item) {
        item.hidden = !auditAllowed;
      });
      var cmsAuditAllowed = result.user.can && (result.user.can.view_cms_audit_trail === undefined
        ? result.user.can.view_audit_trail
        : result.user.can.view_cms_audit_trail);
      document.querySelectorAll(".requires-view-cms-audit-trail").forEach(function (item) {
        item.hidden = !cmsAuditAllowed;
      });
      if (!auditAllowed && page === "audit-trail") {
        blockPage("You don't have permission to view the systems audit trail.");
      }
      if (!cmsAuditAllowed && page === "cms-audit-trail") {
        blockPage("You don't have permission to view the CMS audit trail.");
      }

      var rolesAllowed = result.user.can && result.user.can.manage_user_roles;
      document.querySelectorAll(".requires-manage-user-roles").forEach(function (item) {
        item.hidden = !rolesAllowed;
      });
      if (!rolesAllowed && page === "user-roles") {
        blockPage("You don't have permission to manage user roles.");
      }

      document.dispatchEvent(new CustomEvent("cms:user"));
      applyPermissions(document);
    })
    .catch(function () {
    });

  new MutationObserver(function (records) {
    if (!window.CMS_USER) return;
    records.forEach(function (record) {
      record.addedNodes.forEach(function (node) {
        if (node.nodeType === 1) applyPermissions(node);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
})();
