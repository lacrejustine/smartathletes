/* ==========================================================
   SmartAthlete — admin login logic (login.html)

   Two ways in:
     - the normal username/password form (config.js credentials)
     - "Try Demo", which signs in as a flagged demo admin and seeds
       the sample season into the separate `smartathlete_demo_*`
       namespace before landing on the dashboard

   On success we replace the history entry so the browser Back button
   cannot return to this page and re-trigger a redirect loop.
   ========================================================== */

(function(){
  "use strict";

  const params = new URLSearchParams(location.search);
  const next = params.get("next") || "admin.html";

  // Only same-site relative pages may be used as a redirect target.
  const target = /^[a-z0-9._-]+\.html$/i.test(next) ? next : "admin.html";

  // Already signed in? Skip the form.
  if (SA_AUTH.redirectIfAuthenticated(target)) return;

  const form = document.getElementById("loginForm");
  const error = document.getElementById("loginError");
  const demoButton = document.getElementById("btnDemo");
  const demoBlock = document.getElementById("demoBlock");
  const demoDivider = document.getElementById("demoDivider");
  let attempts = 0;

  // Render the real credentials so the hint can never drift from config.js.
  const credHint = document.getElementById("credHint");
  if (credHint && window.SA_CONFIG){
    credHint.textContent = `${SA_CONFIG.adminUsername} / ${SA_CONFIG.adminPassword}`;
  }

  // Hide the demo entry entirely when it's switched off.
  if (!SA_DEMO.isEnabled()){
    demoBlock.hidden = true;
    demoDivider.hidden = true;
  }

  form.addEventListener("submit", event => {
    event.preventDefault();

    const result = SA_AUTH.login(
      document.getElementById("loginUser").value,
      document.getElementById("loginPass").value
    );

    if (result.ok){
      error.hidden = true;
      // Hand off through SA_AUTH so the redirect goes through the same
      // single navigation path (and uses `replace`, keeping this page
      // out of history so Back can't loop back here).
      SA_AUTH.go(target);
      return;
    }

    attempts += 1;
    error.textContent = result.message + (attempts >= 3
      ? " Check the admin account in config.js."
      : "");
    error.hidden = false;
    document.getElementById("loginPass").value = "";
    document.getElementById("loginPass").focus();
  });

  demoButton.addEventListener("click", () => {
    const result = SA_AUTH.loginDemo();
    if (!result.ok){
      error.textContent = result.message;
      error.hidden = false;
      return;
    }
    error.hidden = true;
    SA_AUTH.go(target);
  });

})();