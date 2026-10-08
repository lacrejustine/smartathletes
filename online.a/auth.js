/* ==========================================================
   SmartAthlete — admin session guard
   Loaded ONLY by admin.html and login.html, never by the public
   student page (which must not be able to read the credentials
   in config.js).

   Development-grade: the session is a localStorage flag and the
   password check is a plain comparison against config.js. See the
   upgrade notes at the top of config.js before deploying online.

   A demo session is the same shape as a normal one, plus `demo: true`.
   That flag is what puts the admin app on the `smartathlete_demo_*`
   storage namespace so demo edits never touch real data.
   ========================================================== */

window.SA_AUTH = (function(){
  "use strict";

  const SESSION_KEY = "sa_admin_session";
  const CONFIG = window.SA_CONFIG || {};
  const SESSION_MS = () => (Number(CONFIG.sessionHours) || 12) * 60 * 60 * 1000;
  let guardInstalled = false;

  function read(){
    const raw = SA.safeParse(localStorage.getItem(SESSION_KEY), null);
    if (!raw || typeof raw !== "object" || !raw.user) return null;
    if (!raw.expiresAt || Date.now() > raw.expiresAt){ clear(); return null; }
    return raw;
  }

  function isAuthenticated(){
    return !!read();
  }

  // True when the current session came from the "Try Demo" button.
  function isDemo(){
    const session = read();
    return !!(session && session.demo);
  }

  function currentUser(){
    const session = read();
    return session ? session.user : "";
  }

  function login(username, password){
    const expectedUser = String(CONFIG.adminUsername || "");
    const expectedPass = String(CONFIG.adminPassword || "");
    if (!expectedUser || !expectedPass) return { ok:false, message:"No admin account is configured. Check config.js." };

    const sameUser = String(username || "").trim() === expectedUser;
    const samePass = String(password || "") === expectedPass;
    if (!sameUser || !samePass) return { ok:false, message:"Incorrect username or password." };

    write({ user: expectedUser, at: Date.now(), expiresAt: Date.now() + SESSION_MS() });
    return { ok:true, user: expectedUser };
  }

  // One-click demo sign-in. Same session shape as login(), flagged as a demo,
  // and it seeds the sample season if the demo namespace is empty.
  function loginDemo(){
    if (!SA_DEMO.isEnabled()) return { ok:false, message:"Demo mode is disabled in config.js." };
    const seeded = SA_DEMO.seedIfEmpty();
    write({ user: SA_DEMO.username(), demo: true, at: Date.now(), expiresAt: Date.now() + SESSION_MS() });
    return { ok:true, user: SA_DEMO.username(), seeded };
  }

  /* Single place every redirect goes through. `replace` (not `assign`) so the
     login page is dropped from history and the Back button can't re-enter it.
     Overridable so the redirect targets can be exercised in tests. */
  let navigate = url => location.replace(url);
  function setNavigator(fn){ navigate = fn || (u => location.replace(u)); }

  // A navigation is in flight. Collapses overlapping redirects (a click that
  // lands while the page is already navigating, or several guards firing at
  // once) into one, so the browser can't end up ping-ponging between pages.
  // The latch releases on the next tick, so a later deliberate navigation —
  // e.g. the user pressing Back mid-load — still goes through.
  let redirecting = false;
  function navigateTo(url){
    if (redirecting) return false;
    redirecting = true;
    setTimeout(() => { redirecting = false; }, 0);
    navigate(url);
    return true;
  }

  // Public alias so the login page can hand off through the same path.
  function go(url){ return navigateTo(url); }

  /* Keeps a signed-in admin from re-entering the login screen. Returns true when
     the page should stop executing because we're navigating away. */
  function redirectIfAuthenticated(next){
    if (isAuthenticated() && typeof next === "string" && next){
      navigateTo(next);
      return true;
    }
    return false;
  }

  /* Call at the top of every admin page. Bounces to login.html otherwise.
     Also wipes a stale demo session's sample data on the way out. */
  function requireAdmin(nextPage){
    const session = read();
    if (session){
      // sliding expiry: refresh the window on each page load
      write({ user: session.user, demo: !!session.demo, at: session.at, expiresAt: Date.now() + SESSION_MS() });
      guardHistory();   // protected page: safe to guard from Back button
      return true;
    }
    // Expired or absent — don't leave sample data lying around.
    SA_DEMO.reset();
    navigateTo("login.html?next=" + encodeURIComponent(nextPage || "admin.html"));
    return false;
  }

  // Normal logout: leave any demo data on disk (harmless, inert) but end the
  // session and return to the login screen.
  function logout(){
    clear();
    return navigateTo("login.html");
  }

  // Leaves demo mode: clears the sample season AND the session.
  function exitDemo(){
    SA_DEMO.reset();
    clear();
    return navigateTo("login.html");
  }

  /* ---------------- history hardening ----------------
     The dashboard must not come back on the browser's Back button after a
     logout or an Exit Demo. We can't control what the browser restores, so
     re-check the session whenever the page is shown again from the
     back/forward cache or a popstate, and bounce to login if it's gone.

     This is installed by requireAdmin() — i.e. only on protected admin
     pages. It must NEVER run on login.html: being signed out is that page's
     normal state, so guarding it would replace login.html with login.html
     forever (an infinite reload). */
  function isLoginPage(){
    return /(^|\/)login\.html$/.test(location.pathname);
  }

  function guardHistory(){
    if (guardInstalled) return;
    guardInstalled = true;

    const bounce = () => {
      if (isAuthenticated()) return;
      if (isLoginPage()) return;   // never redirect the login screen to itself
      if (redirecting) return;     // a navigation is already in flight
      navigateTo("login.html");
    };
    window.addEventListener("pageshow", bounce);
    window.addEventListener("popstate", bounce);
  }

  function write(session){
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
  function clear(){
    localStorage.removeItem(SESSION_KEY);
  }

  // NOTE: no automatic guardHistory() here — it is installed by requireAdmin()
  // so the login page never guards itself into a reload loop.

  return {
    isAuthenticated, isDemo, currentUser,
    login, loginDemo, logout, exitDemo, requireAdmin, redirectIfAuthenticated,
    go, setNavigator, guardHistory,
  };
})();