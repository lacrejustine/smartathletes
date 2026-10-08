/* ==========================================================
   SmartAthlete — admin account config
   ------------------------------------------------------------
   !! DEVELOPMENT CREDENTIALS ONLY !!

   This is a placeholder so the admin side can be protected
   without a server. The password below is readable by anyone
   who can open this file, and the "session" is only a flag in
   the browser's localStorage. That is fine for a closed,
   offline tryout season on a staff machine.

   BEFORE PUTTING THIS ONLINE, REPLACE IT WITH:
     - server-side authentication (the browser never sees the
       password; login is validated by a backend over HTTPS)
     - hashed passwords (bcrypt / Argon2 / scrypt — never plain
       text, and never shipped to the client)
     - a real session: httpOnly + Secure + SameSite cookies, or
       short-lived signed tokens, plus rate limiting and lockout
     - per-user accounts with roles/audit logs if more than one
       person administers the season
     - demo mode switched OFF (set demoEnabled to false) so the
       public can never browse the admin dashboard
   ========================================================== */

window.SA_CONFIG = {
  adminUsername: "admin",
  adminPassword: "admin123",

  // How long an admin session stays valid. Each admin page load
  // re-stamps this, so an active day of work won't log you out.
  sessionHours: 12,

  // "Try Demo" entry on the login page. Demo data is written to a
  // separate storage namespace (smartathlete_demo_*) and never
  // touches real registrations. Set to false to disable.
  demoEnabled: true,
  demoUsername: "demo",
};