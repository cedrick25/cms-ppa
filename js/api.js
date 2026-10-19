(function () {
  var TOKEN_KEY = "cms-ppa-token";

  function base() {
    return String(window.CMS_API_BASE || "").replace(/\/$/, "");
  }

  window.CmsApi = {
    token: function () {
      return sessionStorage.getItem(TOKEN_KEY);
    },
    setToken: function (token) {
      sessionStorage.setItem(TOKEN_KEY, token);
    },
    clearToken: function () {
      sessionStorage.removeItem(TOKEN_KEY);
    },
    url: function (path) {
      return base() + path;
    },
    headers: function (extra) {
      var headers = { Accept: "application/json" };
      var token = sessionStorage.getItem(TOKEN_KEY);
      if (token) {
        headers.Authorization = "Bearer " + token;
      }
      if (extra) {
        Object.keys(extra).forEach(function (key) {
          headers[key] = extra[key];
        });
      }
      return headers;
    },
  };
})();
