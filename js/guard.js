(function () {
  var page = document.body.dataset.page || "";
  var signIn = "sign-in.html";

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
      if (!result) {
        return;
      }
      if (result.status === 403 || !result.user || !result.user.name) {
        return;
      }

      window.CMS_USER = result.user;
      document.dispatchEvent(new CustomEvent("cms:user"));
      var name = document.getElementById("welcome-name");
      var initial = document.getElementById("welcome-initial");
      if (name) {
        name.textContent = result.user.name;
      }
      if (initial) {
        initial.textContent = result.user.name.trim().charAt(0).toUpperCase();
      }

      var allowed = result.user.can && result.user.can.manage_users;
      document.querySelectorAll(".requires-manage-users").forEach(function (item) {
        item.hidden = !allowed;
      });

      if (!allowed && (page === "users" || page === "register")) {
        var container = document.querySelector(".container-fluid.py-4");
        if (container) {
          container.innerHTML = '<div class="alert alert-danger text-white" role="alert">You don\'t have permission to manage users.</div>';
        }
        window.CMS_BLOCKED = true;
      }

      var systemsAllowed = result.user.can && result.user.can.manage_systems;
      document.querySelectorAll(".requires-manage-systems").forEach(function (item) {
        item.hidden = !systemsAllowed;
      });

      if (!systemsAllowed && page === "systems") {
        var systemsContainer = document.querySelector(".container-fluid.py-4");
        if (systemsContainer) {
          systemsContainer.innerHTML = '<div class="alert alert-danger text-white" role="alert">You don\'t have permission to manage system credentials.</div>';
        }
        window.CMS_BLOCKED = true;
      }

      var auditAllowed = result.user.can && result.user.can.view_audit_trail;
      document.querySelectorAll(".requires-view-audit-trail").forEach(function (item) {
        item.hidden = !auditAllowed;
      });

      if (!auditAllowed && (page === "audit-trail" || page === "cms-audit-trail")) {
        var auditContainer = document.querySelector(".container-fluid.py-4");
        if (auditContainer) {
          var auditLabel = page === "cms-audit-trail" ? "CMS audit trail" : "systems audit trail";
          auditContainer.innerHTML = '<div class="alert alert-danger text-white" role="alert">You don\'t have permission to view the ' + auditLabel + '.</div>';
        }
        window.CMS_BLOCKED = true;
      }

    })
    .catch(function () {
    });
})();
