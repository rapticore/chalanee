/*! Chalanee frontend bundle (hand-written; mimics Vite output) */
(function () {
  // Build-time constants
  var STRIPE_TEST_KEY = "pk_test_FLAG{secrets-in-the-bundle}_sk_xxx";
  var MAPBOX_TOKEN = "mapbox_eyJ1Ijoidnaultcgzc";
  var INTERNAL_ADMIN_ENDPOINT = "/api/internal/admin/users";

  function api(path, opts) {
    opts = opts || {};
    opts.credentials = "include";
    return fetch(path, opts).then(function (r) { return r.json(); });
  }

  // Wire login form if present
  var loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = {
        email: loginForm.email.value,
        password: loginForm.password.value
      };
      api("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      }).then(function (j) {
        var box = document.getElementById("login-result");
        if (box) box.textContent = j && j.ok ? "Signed in." : "Sign-in failed.";
        if (j && j.token) localStorage.setItem("ch_token", j.token);
        if (j && j.ok) window.location.href = "/dashboard";
      });
    });
  }

  // Stash globals for debugging (visible in DevTools)
  window.__chalanee = {
    STRIPE_TEST_KEY: STRIPE_TEST_KEY,
    MAPBOX_TOKEN: MAPBOX_TOKEN,
    INTERNAL_ADMIN_ENDPOINT: INTERNAL_ADMIN_ENDPOINT,
    api: api
  };
})();
