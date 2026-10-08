/* ==========================================================
   SmartAthlete — shared core
   Storage, settings, formatting, validation, and UI bits used
   by BOTH the public student page (register.html) and the
   protected admin app (admin.html). One source of truth, so a
   student's submission and an admin's settings always agree.

   Plain DOM + localStorage. No frameworks, no build step.
   ========================================================== */

window.SA = (function(){
  "use strict";

  /* ---------------- constants ---------------- */
  // Two independent namespaces. The live app owns `sa_*`; demo mode owns
  // `smartathlete_demo_*`, so exploring the demo can never touch real
  // registrations or real admin settings.
  const NAMESPACES = {
    live: {
      sports:  "sa_sports",
      athletes:"sa_athletes",
      evals:   "sa_evals",
      settings:"sa_settings",
      seeded:  "sa_seeded_v1",
    },
    demo: {
      sports:  "smartathlete_demo_sports",
      athletes:"smartathlete_demo_athletes",
      evals:   "smartathlete_demo_evals",
      settings:"smartathlete_demo_settings",
      seeded:  "smartathlete_demo_seeded",
    },
  };

  // Active namespace. Starts on live; demo mode switches it before loading.
  let LS = NAMESPACES.live;

  function useNamespace(name){
    LS = NAMESPACES[name] || NAMESPACES.live;
    return LS;
  }

  function clearNamespace(name){
    const keys = NAMESPACES[name];
    if (!keys) return;
    Object.keys(keys).forEach(key => localStorage.removeItem(keys[key]));
  }

  // True when this namespace holds a real, non-empty season.
  function namespaceHasData(name){
    const keys = NAMESPACES[name];
    if (!keys) return false;
    return safeParse(localStorage.getItem(keys.athletes), []).length > 0
        || safeParse(localStorage.getItem(keys.sports), []).length > 0;
  }

  const VERDICTS = ["Pending", "Selected", "Waitlisted", "Not Selected"];
  // The four statuses an athlete record carries. `Pending` is the default for a
  // brand-new registration; staff set the rest from the Athletes page.
  const STATUS_CLASS = {
    "Pending":      "pending",
    "Selected":     "selected",
    "Waitlisted":   "waitlisted",
    "Not Selected": "notselected",
  };
  const DEPARTMENTS = ["CITE", "CBA", "CAS", "CN", "CCJE", "CED"];
  const CATEGORY_OPTIONS = ["Team Sport","Individual Sport","Combat Sport","Racket Sport","Track & Field","Mind Sport","Esports"];
  const YEAR_LEVELS = ["1st Year","2nd Year","3rd Year","4th Year"];
  const ESPORTS = "Esports";
  const TEAM_MIN_MEMBERS = 5;
  const TEAM_MAX_MEMBERS = 6;
  const SEASON_LABEL = "A.Y. 2026\u20132027";

  const DEFAULT_SPORTS = [
    ["Basketball", "Team Sport"],
    ["Volleyball", "Team Sport"],
    ["Baseball", "Team Sport"],
    ["Taekwondo", "Combat Sport"],
    ["Sepak Takraw", "Team Sport"],
    ["Football", "Team Sport"],
    ["Chess", "Mind Sport"],
    ["Table Tennis", "Racket Sport"],
    ["Lawn Tennis", "Racket Sport"],
    ["Badminton", "Racket Sport"],
    ["Athletics", "Track & Field"],
    ["Long Jump", "Track & Field"],
    ["High Jump", "Track & Field"],
    ["Beach Volleyball", "Team Sport"],
    ["Pickleball", "Racket Sport"],
    ["MLBB (Esports)", "Esports"],
    ["VALORANT (Esports)", "Esports"],
    ["DOTA 2 (Esports)", "Esports"],
  ];

  /* The school runs on Philippine time. Every date/time the app *displays*
     is rendered in this zone so the admin and the students always read the
     same clock, whatever timezone the device is set to. */
  const TIMEZONE = "Asia/Manila";

  const DEFAULT_SETTINGS = {
    openAt: "",              // "YYYY-MM-DDTHH:mm" — optional
    cutoffAt: "",            // "YYYY-MM-DDTHH:mm" — the timeout
    manuallyClosed: false,   // admin kill switch
    tryoutDate: "",          // "YYYY-MM-DD"
    tryoutTime: "",          // "HH:mm"
    tryoutVenue: "",
    tryoutNote: "",
    // Staff must flip this before students can see any result other than
    // Pending. Until then every lookup reports "Pending" regardless of the
    // real status, so tryout outcomes stay private.
    publishResults: false,
    sportOverrides: {},      // { [sportId]: { date, time, venue, note } }
    // Score bands that define the skill band AND the verdict it implies.
    // A total >= selected -> "Selected as Player"/Selected, >= waitlisted ->
    // "Need Improvement"/Waitlisted, >= practice -> "Need More Practice"/
    // Pending, below that -> "Not Being Selected"/Not Selected.
    verdictThresholds: { selected:81, waitlisted:51, practice:31 },
    updatedAt: "",           // ISO stamp of the last settings save
  };

  /* ---------------- primitives ---------------- */
  function uid(prefix){
    return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
  }

  function safeParse(raw, fallback){
    if (raw === null || raw === undefined) return fallback;
    try { const parsed = JSON.parse(raw); return parsed === null ? fallback : parsed; }
    catch (e){ return fallback; }
  }

  function escapeHtml(str){
    return String(str ?? "").replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  /* ============================================================
     SKILL BANDS — the score out of 100 (25 x 4 criteria) turned
     into a percentage band, and each band DRIVES the verdict:

       Selected as Player  -> Selected
       Need Improvement    -> Waitlisted
       Need More Practice  -> Pending
       Not Being Selected  -> Not Selected

     The three boundaries live in settings.verdictThresholds so staff can
     adjust them (81 / 51 / 31 by default). They used to be a separate
     80/65 "suggested verdict" scale, which is gone: the band is now the
     only scale, so the two can never disagree.

     A total of 0-9 (all four criteria left at zero) has no band of its own
     in the staff scale, so it falls into "Not Being Selected" rather than
     showing nothing.
     ============================================================ */
  const DEFAULT_BANDS = { selected:81, waitlisted:51, practice:31 };

  /* Builds the four bands from the current boundaries, highest first. */
  function skillBands(){
    const t = Object.assign({}, DEFAULT_BANDS, settings.verdictThresholds || {});
    return [
      { min:t.selected, max:100, label:"Selected as Player", verdict:"Selected" },
      { min:t.waitlisted, max:t.selected - 1, label:"Need Improvement",  verdict:"Waitlisted" },
      { min:t.practice, max:t.waitlisted - 1, label:"Need More Practice", verdict:"Pending" },
      { min:0, max:t.practice - 1, label:"Not Being Selected", verdict:"Not Selected" },
    ];
  }

  /* Normalises anything to 0-100 so a missing total never reads as a high score. */
  function skillPercent(total){
    const n = Number(total);
    if (!isFinite(n) || n < 0) return 0;
    return Math.min(100, Math.round(n));
  }

  function bandFor(total){
    const pct = skillPercent(total);
    const bands = skillBands();
    return bands.find(b => pct >= b.min) || bands[bands.length - 1];
  }

  function ratingLabel(total){
    return bandFor(total).label;
  }

  /* "81–100%" — used as a tooltip so the band boundaries are discoverable. */
  function ratingRange(total){
    const band = bandFor(total);
    return band.min + "\u2013" + band.max + "%";
  }

  function verdictClass(v){
    return String(v || "").toLowerCase().replace(" ", "");
  }

  // Human-friendly reference a student can read off a screenshot.
  // Ambiguous glyphs (I/O/0/1) are left out of the alphabet.
  const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  function makeReference(){
    let body = "";
    const pool = new Uint32Array(6);
    if (window.crypto && window.crypto.getRandomValues){
      window.crypto.getRandomValues(pool);
      for (let i = 0; i < 6; i++) body += REF_ALPHABET[pool[i] % REF_ALPHABET.length];
    } else {
      for (let i = 0; i < 6; i++) body += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)];
    }
    return `NDMC-${body}`;
  }

  /* ---------------- dates & times ---------------- */
  function parseDate(value){
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  function todayStamp(){
    return new Date().toISOString().slice(0,10);
  }

  function fmtDateTime(value){
    const d = value instanceof Date ? value : parseDate(value);
    if (!d) return "\u2014";
    return d.toLocaleString(undefined, {
      month:"long", day:"numeric", year:"numeric", hour:"numeric", minute:"2-digit"
    });
  }

  function fmtDate(value){
    const d = value instanceof Date ? value : parseDate(value);
    if (!d) return "";
    return d.toLocaleDateString(undefined, { month:"long", day:"numeric", year:"numeric" });
  }

  function fmtClock(value){
    if (!value) return "";
    const d = parseDate(value);
    return d ? d.toLocaleTimeString(undefined, { hour:"numeric", minute:"2-digit" }) : "";
  }

  // A tryout moment for a date (+ optional time). A date with no time counts as
  // the end of that day, so a cutoff later that same day still fails validation.
  function tryoutMoment(dateStr, timeStr){
    if (!dateStr) return null;
    const time = /^\d{2}:\d{2}$/.test(timeStr || "") ? timeStr : "23:59";
    return parseDate(`${dateStr}T${time}`);
  }

  function countdownText(ms){
    if (ms <= 0) return "less than a minute";
    const minutes = Math.floor(ms / 60000);
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins = minutes % 60;
    const parts = [];
    if (days) parts.push(`${days} day${days === 1 ? "" : "s"}`);
    if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
    if (!days && mins) parts.push(`${mins} minute${mins === 1 ? "" : "s"}`);
    return parts.length ? parts.join(" ") : "less than a minute";
  }

  /* Ticking countdown with seconds: "2d 5h 12m 30s". Used by the admin
     settings page and the student registration page. */
  function countdownParts(ms){
    if (!(ms > 0)) return null;
    const total = Math.floor(ms / 1000);
    return {
      days:    Math.floor(total / 86400),
      hours:   Math.floor((total % 86400) / 3600),
      minutes: Math.floor((total % 3600) / 60),
      seconds: total % 60,
    };
  }

  function fmtCountdown(ms){
    const p = countdownParts(ms);
    if (!p) return "Closed";
    const pad = n => String(n).padStart(2, "0");
    return p.days
      ? `${p.days}d ${p.hours}h ${p.minutes}m ${pad(p.seconds)}s`
      : `${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)}`;
  }

  /* ============================================================
     TIMEZONE — Asia/Manila display formatting
     ============================================================ */
  function fmtTimeOnly(value, opts){
    const d = value instanceof Date ? value : parseDate(value);
    if (!d) return "\u2014";
    return d.toLocaleTimeString("en-PH", Object.assign({
      hour:"numeric", minute:"2-digit", timeZone: TIMEZONE,
    }, opts || {}));
  }

  /* "2:45 PM" — used for "Last updated" on the settings page. */
  function fmtClockTime(value){
    return fmtTimeOnly(value);
  }

  /* ============================================================
     VERDICTS — suggestion from score, and manual-override tracking
     ============================================================ */
  /* The verdict the skill band implies. `total` may be null/undefined for an
     athlete who has not been scored yet -> Pending. This is the ONLY rule that
     turns a score into a verdict; there is no second threshold scale. */
  function suggestedVerdict(total){
    if (total === null || total === undefined || isNaN(total)) return "Pending";
    return bandFor(total).verdict;
  }

  function totalForAthlete(athleteId){
    const ev = state.evals.find(e => e.athleteId === athleteId);
    return ev ? ev.total : null;
  }

  /* True when a coach picked this verdict by hand, so the bulk "apply
     suggested" action can leave it alone. */
  function isManualVerdict(athleteId){
    const ev = state.evals.find(e => e.athleteId === athleteId);
    return !!(ev && ev.verdictManual);
  }

  /* setStatus() but flagged as a deliberate human choice. */
  function setStatusManual(athleteId, status){
    if (!setStatus(athleteId, status, { isAdminAction: true })) return false;
    state.evals.forEach(ev => {
      if (ev.athleteId === athleteId) ev.verdictManual = true;
    });
    saveEvals();
    return true;
  }

  /* Every athlete whose verdict differs from what the score suggests, split
     into "safe to change" (never set by hand) and "coach already decided". */
  function verdictChanges(){
    const safe = [], manual = [];
    state.athletes.forEach(a => {
      const ev = state.evals.find(e => e.athleteId === a.id);
      if (!ev) return;
      const suggested = suggestedVerdict(ev.total);
      if (suggested === SA.statusOf(a)) return;
      (ev.verdictManual ? manual : safe).push({ athlete: a, eval: ev, suggested });
    });
    return { safe, manual };
  }

  /* ============================================================
     CSV EXPORT — pure string builder with no DOM, so it can be
     checked on its own; admin.js only handles the download itself.
     ============================================================ */
  function csvCell(value){
    const s = value === null || value === undefined ? "" : String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function buildAthletesCsv(list, evals){
    const header = ["Name","Student Number","Department","Sport","Course","Year Level","Contact",
                    "Facebook","Status","Reference","Registered On","ID Photo","Score"];
    const source = list || state.athletes;
    const scores = evals || state.evals;
    const rows = source.map(a => {
      const ev = scores.find(e => e.athleteId === a.id);
      return [
        a.name, a.studentId, a.department, a.sportName, a.course, a.yearLevel,
        a.contact, a.facebook, statusOf(a), a.referenceNo, a.dateRegistered,
        a.idPhotoPath ? "yes" : "no",
        ev ? `${ev.skill}/${ev.fitness}/${ev.gamesense}/${ev.discipline} = ${ev.total}` : "",
      ].map(csvCell).join(",");
    });
    // The BOM keeps Excel from mangling UTF-8 names.
    return "﻿" + header.join(",") + "\r\n" + rows.join("\r\n");
  }

  /* ============================================================
     CROSS-TAB SYNC — localStorage only, no server
     BroadcastChannel fires immediately between tabs; the localStorage
     "ping" also raises a storage event, which covers browsers without
     BroadcastChannel. Either way the other tabs reload from storage.
     ============================================================ */
  const SYNC_CHANNEL = "sa_sync";
  let syncChannel = null;
  try { if (typeof BroadcastChannel !== "undefined") syncChannel = new BroadcastChannel(SYNC_CHANNEL); }
  catch (e){ /* unsupported: the storage event below still works */ }

  function broadcast(kind){
    const msg = { kind: kind || "data", at: Date.now() };
    try { if (syncChannel) syncChannel.postMessage(msg); } catch (e){}
    try { localStorage.setItem("sa_sync_ping", msg.at + ":" + Math.random()); } catch (e){}
  }

  function onSync(handler){
    if (syncChannel){
      syncChannel.addEventListener("message", ev => handler(ev.data && ev.data.kind || "data"));
    }
    // Always listen too: covers other tabs when BroadcastChannel is missing.
    window.addEventListener("storage", ev => {
      if (ev.key === "sa_sync_ping" || (ev.key && ev.key.indexOf(LS.settings) === 0)) {
        handler("data");
      }
    });
  }

  /* ============================================================
     REGISTRATION WINDOW — admin-controlled, read by both sides
     ============================================================ */
  function registrationStatus(now){
    const at = now ? new Date(now) : new Date();
    const opensAt = parseDate(settings.openAt);
    const cutoffAt = parseDate(settings.cutoffAt);

    if (settings.manuallyClosed){
      return { open:false, code:"manual", opensAt, cutoffAt,
        message:"Online registration is closed by the administrator." };
    }
    if (opensAt && at < opensAt){
      return { open:false, code:"notyet", opensAt, cutoffAt,
        message:`Online registration opens on ${fmtDateTime(opensAt)}.` };
    }
    if (cutoffAt && at >= cutoffAt){
      return { open:false, code:"cutoff", opensAt, cutoffAt,
        message:`Online registration closed on ${fmtDateTime(cutoffAt)}.` };
    }
    return { open:true, code:"open", opensAt, cutoffAt, message:"Online registration is open." };
  }

  function scheduleFor(sportId){
    const override = (sportId && settings.sportOverrides[sportId]) || {};
    return {
      date:  override.date  || settings.tryoutDate  || "",
      time:  override.time  || settings.tryoutTime  || "",
      venue: override.venue || settings.tryoutVenue || "",
      note:  override.note  || settings.tryoutNote  || "",
      published: !!override.published,
      publishedAt: override.publishedAt || null,
      publishedBy: override.publishedBy || null,
      overridden: Object.values(override).some(Boolean),
    };
  }

  /* Default tryout date: today, so the admin never has to pick the year by hand.
     The season year is derived from the current date, which also lines up with
     the A.Y. season label. */
  function defaultTryoutDate(){
    return todayStamp();
  }

  function seasonYear(){
    return new Date().getFullYear();
  }

  /* "Oct 11, 2026, 8:00 AM" — always includes the year. */
  function fmtScheduleWhen(dateStr, timeStr){
    const d = parseDate(dateStr);
    const when = d
      ? d.toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" })
      : "";
    const clock = fmtClock(timeStr);
    if (!when && !clock) return "";
    return [when, clock].filter(Boolean).join(", ");
  }

  function scheduleSummary(schedule){
    if (!schedule || (!schedule.date && !schedule.time && !schedule.venue && !schedule.note)) return "";
    const when = fmtScheduleWhen(schedule.date, schedule.time) || "Time to be announced";
    return [when, schedule.venue].filter(Boolean).join(", ");
  }

  /* "Basketball: Oct 11, 2026, 8:00 AM, NDMC Main Gymnasium" — the sport name
     leads so the student always knows which schedule they are reading. */
  function scheduleLine(schedule, sportName){
    const summary = scheduleSummary(schedule);
    const note = schedule && schedule.note ? schedule.note : "";
    if (!summary && !note) return "";
    const label = sportName ? `${sportName}: ` : "";
    return label + [summary, note].filter(Boolean).join(" \u2014 ");
  }

  /* ============================================================
     SCHEDULE PUBLISHING
     Validates and publishes a sport's tryout schedule, then broadcasts
     the update so student pages can pick it up in real time.
     ============================================================ */
  function publishSchedule(sportId, scheduleData, publishedBy){
    if (!sportId) return { ok: false, message: "No sport selected." };
    if (!scheduleData.date) return { ok: false, message: "Tryout date is required." };
    if (!scheduleData.time) return { ok: false, message: "Tryout time is required." };
    if (!scheduleData.venue) return { ok: false, message: "Venue is required." };

    const tryoutMoment = SA.tryoutMoment(scheduleData.date, scheduleData.time);
    if (!tryoutMoment) return { ok: false, message: "Invalid date/time format." };

    const cutoffAt = SA.parseDate(settings.cutoffAt);
    if (cutoffAt && tryoutMoment <= cutoffAt){
      return { ok: false, message: `Tryout must be after the registration cutoff (${SA.fmtDateTime(cutoffAt)}).` };
    }

    const sport = SA.sportById(sportId);
    if (!sport) return { ok: false, message: "Selected sport not found." };

    const now = new Date().toISOString();
    const override = settings.sportOverrides[sportId] || {};
    
    // Merge existing override with new data
    const updatedOverride = {
      date: scheduleData.date,
      time: scheduleData.time,
      venue: scheduleData.venue,
      note: scheduleData.note || "",
      published: true,
      publishedAt: new Date().toISOString(),
      publishedBy: publishedBy || "Admin",
    };

    settings.sportOverrides[sportId] = updatedOverride;
    settings.updatedAt = new Date().toISOString();

    // Save to localStorage
    localStorage.setItem(LS.sportOverrides, JSON.stringify(settings.sportOverrides));
    localStorage.setItem(LS.settings, JSON.stringify(settings));

    // Broadcast the change
    SA.broadcast("schedule");

    const studentCount = SA.athletesFor(sportId).length;
    return { 
      ok: true, 
      message: `${sport.name} tryout schedule successfully updated. ${studentCount} registered student${studentCount === 1 ? "" : "s"} notified.`,
      studentCount
    };
  }

  /* The banner both pages render. `variant` adds admin-only guidance. */
  function registrationBannerHtml(status, variant){
    const admin = variant === "admin";
    const line = scheduleLine(scheduleFor(null));
    let headline = "";
    let detail = "";

    if (status.open){
      headline = "Online registration is open.";
      detail = status.cutoffAt
        ? `Registration closes in ${countdownText(status.cutoffAt.getTime() - Date.now())} \u2014 ${fmtDateTime(status.cutoffAt)}.`
        : "No registration cutoff has been set yet.";
    } else if (status.code === "cutoff"){
      headline = status.message;   // "Online registration closed on [date/time]."
      detail = settings.manuallyClosed
        ? "The administrator has also switched registration off."
        : "New online entries are no longer accepted.";
    } else {
      headline = status.message;
      detail = status.cutoffAt
        ? `Registration will stay open until ${fmtDateTime(status.cutoffAt)}.`
        : "Registration opens on the date set by the administrator.";
    }

    return `
      <div class="reg-banner ${status.open ? "open" : "closed"}">
        <span class="reg-banner-tag">${status.open ? "Registration open" : "Registration closed"}</span>
        <div class="reg-banner-body">
          <strong>${escapeHtml(headline)}</strong>
          <span>${escapeHtml(detail)}</span>
          ${line ? `<span class="reg-banner-tryout">Tryout: ${escapeHtml(line)}</span>` : ""}
          ${admin ? `<span class="reg-banner-hint">${settings.manuallyClosed
            ? "Online registration is currently switched off manually. Untick the toggle below to reopen it."
            : "Change the window or the tryout schedule below."}</span>` : ""}
        </div>
      </div>`;
  }

  /* ============================================================
     STUDENT NUMBER & CONTACT NUMBER
     Student numbers are digits only with no dash (210134). Older data used a
     dashed form (21-0134), so every value is normalised by stripping
     non-digits — that also makes the lookup work with or without a dash.
     Contact numbers are Philippine mobiles: exactly 11 digits starting 09.
     ============================================================ */
  const STUDENT_ID_MIN = 4;
  const STUDENT_ID_MAX = 12;

  function normalizeStudentId(raw){
    return String(raw ?? "").replace(/[^0-9]/g, "");
  }
  function normalizeContact(raw){
    return String(raw ?? "").replace(/[^0-9]/g, "");
  }

  function validateStudentId(raw){
    const digits = normalizeStudentId(raw);
    if (!digits) return { ok:false, message:"Enter your student number." };
    if (digits.length < STUDENT_ID_MIN || digits.length > STUDENT_ID_MAX){
      return { ok:false, message:`Student number must be ${STUDENT_ID_MIN} to ${STUDENT_ID_MAX} digits (no dash).` };
    }
    return { ok:true, value: digits };
  }

  function validateContact(raw){
    const digits = normalizeContact(raw);
    if (!digits) return { ok:false, message:"Enter your contact number." };
    if (digits.length !== 11) return { ok:false, message:"Contact number must be exactly 11 digits." };
    if (digits.slice(0, 2) !== "09") return { ok:false, message:"Contact number must start with 09 (example: 09171234567)." };
    return { ok:true, value: digits };
  }

  /* ============================================================
     NAME SORTING
     Every athlete list is grouped by sport and ordered A-Z by surname then
     given name, so the same student always appears in the same place.
     ============================================================ */
  function nameParts(name){
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return { last:"", first:"", full:"" };
    return { first: parts[0], last: parts[parts.length - 1], full: parts.join(" ") };
  }

  function compareByName(a, b){
    const pa = nameParts(a.name);
    const pb = nameParts(b.name);
    const byLast = pa.last.localeCompare(pb.last, undefined, { sensitivity:"base" });
    if (byLast) return byLast;
    const byFirst = pa.first.localeCompare(pb.first, undefined, { sensitivity:"base" });
    if (byFirst) return byFirst;
    return pa.full.localeCompare(pb.full, undefined, { sensitivity:"base" });
  }

  function sortByName(list){
    return [...list].sort(compareByName);
  }

  /* Groups athletes by sport. Groups are ordered by sport name, and each
     group is A-Z by name. Returns [{ sport, athletes }]. */
  function groupBySport(list){
    const groups = new Map();
    list.forEach(a => {
      if (!groups.has(a.sportId)) groups.set(a.sportId, []);
      groups.get(a.sportId).push(a);
    });
    return [...groups.entries()]
      .map(([sportId, athletes]) => ({
        sport: sportById(sportId) || { id:sportId, name:"Sport unavailable", category:"", status:"retired" },
        athletes: sortByName(athletes),
      }))
      .sort((a, b) => a.sport.name.localeCompare(b.sport.name, undefined, { sensitivity:"base" }));
  }

  /* Esports rosters: teams by team name, then players A-Z inside each team. */
  function sortTeamsForDisplay(athletes){
    const teams = new Map();
    athletes.filter(a => a.teamId).forEach(a => {
      if (!teams.has(a.teamId)) teams.set(a.teamId, []);
      teams.get(a.teamId).push(a);
    });
    return [...teams.entries()]
      .map(([teamId, members]) => ({
        teamId,
        name: members[0]?.teamName || "Unnamed team",
        members: sortByName(members),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity:"base" }));
  }

  /* ============================================================
     STATUS — owned by the athlete record, mirrored onto the evaluation
     so Tryout Evaluation and Final Selection can never disagree.
     ============================================================ */
  function statusOf(athlete){
    if (!athlete) return "Pending";
    return STATUS_CLASS[athlete.status] ? athlete.status : "Pending";
  }
  function statusClass(status){ return STATUS_CLASS[status] || "pending"; }

  function setStatus(athleteId, status, options){
    const athlete = athleteById(athleteId);
    if (!athlete || !STATUS_CLASS[status]) return false;
    
    const now = new Date().toISOString();
    const isAdminAction = options?.isAdminAction === true;
    
    athlete.status = status;
    athlete.updatedAt = now;
    
    // Store selection metadata when status changes to a final decision
    if (status === "Selected" || status === "Waitlisted" || status === "Not Selected") {
      athlete.selectedBy = options?.selectedBy || (isAdminAction ? "Admin" : "System");
      athlete.selectedAt = now;
      athlete.selectedSport = athlete.sportName || (SA.sportById(athlete.sportId)?.name || "");
    }
    
    // Clear selection metadata if reverting to Pending
    if (status === "Pending") {
      athlete.selectedBy = undefined;
      athlete.selectedAt = undefined;
      athlete.selectedSport = undefined;
    }
    
    // Keep the evaluation row in step so the other two pages agree.
    state.evals.forEach(ev => { if (ev.athleteId === athleteId) ev.selectionStatus = status; });
    saveAthletes(); saveEvals();
    broadcast("athletes");
    return true;
  }

  function statusCounts(){
    const counts = { "Pending":0, "Selected":0, "Waitlisted":0, "Not Selected":0 };
    state.athletes.forEach(a => { counts[statusOf(a)] += 1; });
    return counts;
  }

  /* ============================================================
     FACEBOOK ACCOUNT
     ============================================================ */
  const FACEBOOK_HOST_RE = /(?:^|\/\/)(?:www\.|web\.|m\.)?(?:facebook|fb)\.com\//i;
  const FACEBOOK_URL_RE = /^https?:\/\/(?:www\.|web\.|m\.)?facebook\.com\/[^\s?#]+\/?(?:\?[^\s]*)?(?:#.*)?$/i;

  function looksLikeFacebookLink(value){
    return FACEBOOK_HOST_RE.test(String(value || "").trim());
  }

  function facebookHref(value){
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;      // already absolute
    return "https://" + raw.replace(/^\/\//, "");
  }

  /* Accepts a Facebook profile link or a plain name/handle. If the entry looks
     like a link, it has to resolve to a real facebook.com profile URL. */
  function validateFacebook(raw){
    const value = String(raw || "").trim();
    if (!value) return { ok:false, message:"Facebook account is required." };
    if (value.length > 120) return { ok:false, message:"That Facebook account is too long." };

    if (looksLikeFacebookLink(value)){
      if (FACEBOOK_URL_RE.test(facebookHref(value))) return { ok:true, value: facebookHref(value) };
      return { ok:false, message:"That Facebook link doesn't look right. Use a profile link like facebook.com/juan.delacruz." };
    }
    if (/^https?:\/\//i.test(value) || value.includes("/")){
      return { ok:false, message:"Enter your Facebook profile link (facebook.com/name) or just your Facebook name." };
    }
    return { ok:true, value };
  }

  function facebookCell(value){
    const raw = String(value || "").trim();
    if (!raw) return "<em>Not provided</em>";
    const safe = escapeHtml(raw);
    if (looksLikeFacebookLink(raw)){
      return `<a class="fb-link" href="${escapeHtml(facebookHref(raw))}" target="_blank" rel="noopener noreferrer">${safe}</a>`;
    }
    return safe;
  }

  /* ============================================================
     STORE — the single shared data set
     ============================================================ */
  const state = {
    sports: [],
    athletes: [],
    evals: [],
    settings: normalizeSettings(null),
  };
  // Module-level alias. `state.settings` keeps the SAME object identity for the
  // lifetime of the page so helpers can read it without chasing the store.
  const settings = state.settings;

  function normalizeSettings(raw){
    const out = { ...DEFAULT_SETTINGS, sportOverrides: {} };
    if (!raw || typeof raw !== "object") return out;
    // `verdictThresholds` and `updatedAt` must be listed here or a save would
    // silently drop them (replaceSettings rebuilds the object from this list).
    ["openAt","cutoffAt","tryoutDate","tryoutTime","tryoutVenue","tryoutNote","updatedAt"].forEach(key => {
      out[key] = typeof raw[key] === "string" ? raw[key] : "";
    });
    out.manuallyClosed = !!raw.manuallyClosed;
    out.publishResults = !!raw.publishResults;

    // Clamped so the four bands stay in order and can never be empty.
    // An older settings blob with only {selected, waitlisted} keeps those two
    // and gains the default `practice` boundary.
    const t = raw.verdictThresholds || {};
    const num = (v, fallback) => {
      const n = parseInt(v, 10);
      return isFinite(n) ? n : fallback;
    };
    const selected   = Math.min(100, Math.max(3, num(t.selected, DEFAULT_BANDS.selected)));
    const waitlisted = Math.min(selected - 1, Math.max(2, num(t.waitlisted, DEFAULT_BANDS.waitlisted)));
    const practice   = Math.min(waitlisted - 1, Math.max(1, num(t.practice, DEFAULT_BANDS.practice)));
    out.verdictThresholds = { selected, waitlisted, practice };
    if (raw.sportOverrides && typeof raw.sportOverrides === "object"){
      Object.keys(raw.sportOverrides).forEach(id => {
        const entry = raw.sportOverrides[id];
        if (!entry || typeof entry !== "object") return;
        out.sportOverrides[id] = {
          date:  typeof entry.date  === "string" ? entry.date  : "",
          time:  typeof entry.time  === "string" ? entry.time  : "",
          venue: typeof entry.venue === "string" ? entry.venue : "",
          note:  typeof entry.note  === "string" ? entry.note  : "",
        };
      });
    }
    return out;
  }

  // Normalises in place so `settings` stays a stable reference.
  function replaceSettings(raw){
    const next = normalizeSettings(raw);
    Object.keys(settings).forEach(key => { delete settings[key]; });
    Object.assign(settings, next);
    return settings;
  }

  /* Deterministic id for a built-in sport.

     The fallback list is regenerated every time the store is found empty — e.g.
     when a student opens the page before any admin has. With random ids, a
     student's chosen sport would be re-issued a new id on the next load, their
     selection would stop matching, and the registration would be rejected.
     Stable ids keep every generation of the built-in list identical, so
     registrations saved on either side always line up. */
  function defaultSportId(name){
    return "sp_" + String(name).toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function newSportRecord(name, category){
    return { id: defaultSportId(name), name, category, status: "active" };
  }

  function load(opts){
    const options = opts || {};
    state.sports   = safeParse(localStorage.getItem(LS.sports), []);
    state.athletes = safeParse(localStorage.getItem(LS.athletes), []);
    state.evals    = safeParse(localStorage.getItem(LS.evals), []);
    replaceSettings(safeParse(localStorage.getItem(LS.settings), null));

    // First run: fall back to the built-in roster. Only the admin app writes it
    // back (`seed: true`), so a student's visit never touches the store.
    if (!state.sports.length){
      state.sports = DEFAULT_SPORTS.map(([name, category]) => newSportRecord(name, category));
      if (options.seed){
        saveSports();
        localStorage.setItem(LS.seeded, "1");
      }
    }

    migrate();
    return state;
  }

  function reload(){ return load(); }

  function saveSports(){   localStorage.setItem(LS.sports,   JSON.stringify(state.sports)); }
  function saveAthletes(){ localStorage.setItem(LS.athletes, JSON.stringify(state.athletes)); }
  function saveEvals(){    localStorage.setItem(LS.evals,    JSON.stringify(state.evals)); }

  // Direct writers, used by the demo seeder to drop a whole season in.
  function saveSportsRaw(list){   state.sports   = list; saveSports(); }
  function saveAthletesRaw(list){ state.athletes = list; saveAthletes(); }
  function saveEvalsRaw(list){    state.evals    = list; saveEvals(); }
  function saveSettingsRaw(obj){  replaceSettings(obj); localStorage.setItem(LS.settings, JSON.stringify(settings)); }
  function saveSettings(){
    replaceSettings(settings);
    localStorage.setItem(LS.settings, JSON.stringify(settings));
  }

  /* Cleans up records written by older versions of the app:
       - roster-slot limits (removed from the model entirely)
       - missing reference numbers, so the student lookup always resolves
       - per-sport schedules pointing at sports that no longer exist */
  function migrate(){
    let changed = false;

    [state.sports, state.athletes, state.evals].forEach(collection => {
      collection.forEach(record => {
        if (record && typeof record === "object" && "maxSlots" in record){
          delete record.maxSlots;
          changed = true;
        }
      });
    });

    /* Normalise student numbers and contact numbers written by older builds
       (dashed IDs, phone numbers with spaces or symbols) and give every
       registration a `status`, taking the existing verdict from the
       evaluation so no historical outcome is lost. */
    state.athletes.forEach(a => {
      const sid = normalizeStudentId(a.studentId);
      if (sid !== (a.studentId || "")){ a.studentId = sid; changed = true; }

      const phone = normalizeContact(a.contact);
      if (phone !== (a.contact || "")){ a.contact = phone; changed = true; }

      const ev = state.evals.find(e => e.athleteId === a.id);
      const wanted = a.status || (ev && ev.selectionStatus) || "Pending";
      const next = STATUS_CLASS[wanted] ? wanted : "Pending";
      if (a.status !== next){ a.status = next; changed = true; }

      // The athlete record is the single source of truth for status.
      if (ev && ev.selectionStatus !== next){ ev.selectionStatus = next; changed = true; }
    });

    // Re-link records whose sportId no longer resolves. This happens when a sport
    // is deleted and re-created, or when a registration was saved against an
    // older build that used random ids for the built-in sports. Matching on the
    // stored sportName repairs the record instead of showing "Sport deleted".
    const sportsByName = new Map(state.sports.map(s => [s.name, s.id]));
    state.athletes.forEach(a => {
      if (!a.sportId || sportById(a.sportId)) return;
      const recovered = sportsByName.get(a.sportName);
      if (recovered){ a.sportId = recovered; changed = true; }
    });
    state.evals.forEach(ev => {
      if (!ev.sportId || sportById(ev.sportId)) return;
      const athlete = state.athletes.find(a => a.id === ev.athleteId);
      const recovered = athlete ? sportsByName.get(athlete.sportName) : null;
      if (recovered){ ev.sportId = recovered; changed = true; }
    });

    // One reference per team; individual athletes get their own.
    const teamRefs = {};
    state.athletes.forEach(a => {
      if (!a.teamId) return;
      if (!a.referenceNo){
        if (!teamRefs[a.teamId]) teamRefs[a.teamId] = makeReference();
        a.referenceNo = teamRefs[a.teamId];
        changed = true;
      }
    });
    state.athletes.forEach(a => {
      if (!a.referenceNo && !a.teamId){
        a.referenceNo = makeReference();
        changed = true;
      }
    });

    const sportIds = new Set(state.sports.map(s => s.id));
    Object.keys(state.settings.sportOverrides).forEach(id => {
      if (!sportIds.has(id)){ delete state.settings.sportOverrides[id]; changed = true; }
    });

    if (changed){
      saveSports(); saveAthletes(); saveEvals(); saveSettings();
    }
  }

  /* ---------------- lookups ---------------- */
  function sportById(id){ return state.sports.find(s => s.id === id); }
  function athleteById(id){ return state.athletes.find(a => a.id === id); }
  function activeSports(){ return state.sports.filter(s => s.status === "active"); }
  function athletesFor(sportId){ return state.athletes.filter(a => a.sportId === sportId); }
  function isEsports(sportId){ return sportById(sportId)?.category === ESPORTS; }

  /* ============================================================
     REGISTRATION RULES — identical on both sides, so the public
     form and the admin's manual entry can never disagree.
     ============================================================ */
  function studentAlreadyRegistered(studentId, sportId, ignoreId){
    // Compare digits-only so "21-0134" and "210134" are the same student.
    const needle = normalizeStudentId(studentId);
    if (!needle) return false;
    return state.athletes.some(a =>
      a.id !== ignoreId &&
      a.sportId === sportId &&
      normalizeStudentId(a.studentId) === needle
    );
  }

  function validateIndividual(input, ignoreId){
    const name = String(input.name || "").trim();
    const department = String(input.department || "").trim();

    if (!name) return { ok:false, field:"name", message:"Enter your full name." };
    if (!department) return { ok:false, field:"department", message:"Choose your department." };

    const sid = validateStudentId(input.studentId);
    if (!sid.ok) return { ok:false, field:"studentId", message:sid.message };

    const phone = validateContact(input.contact);
    if (!phone.ok) return { ok:false, field:"contact", message:phone.message };

    const fb = validateFacebook(input.facebook);
    if (!fb.ok) return { ok:false, field:"facebook", message:fb.message };

    if (studentAlreadyRegistered(sid.value, input.sportId, ignoreId)){
      return { ok:false, field:"studentId", message:"That student number is already registered for this sport." };
    }

    return { ok:true, value:{
      name,
      studentId: sid.value,           // digits only, no dash
      department,
      contact:  phone.value,           // exactly 11 digits, starts 09
      facebook: fb.value,
      course:   String(input.course || "").trim(),
      yearLevel: String(input.yearLevel || YEAR_LEVELS[0]),
      sportId:  input.sportId,
    }};
  }

  function validateTeam(input){
    const sportId = input.sportId;
    const teamName = String(input.teamName || "").trim();
    if (!teamName) return { ok:false, field:"teamName", message:"Enter your team name." };

    const members = (input.members || [])
      .map(m => ({ name:String(m.name || "").trim(), studentId:String(m.studentId || "").trim(), department:String(m.department || "").trim() }))
      .filter(m => m.name || m.studentId);

    if (members.length < TEAM_MIN_MEMBERS || members.length > TEAM_MAX_MEMBERS){
      return { ok:false, field:"teamName",
        message:`An esports team must have ${TEAM_MIN_MEMBERS} or ${TEAM_MAX_MEMBERS} members.` };
    }
    if (members.some(m => !m.name || !m.studentId || !m.department)){
      return { ok:false, field:"teamName",
        message:`Every member needs a name, student number, and department (${TEAM_MIN_MEMBERS} or ${TEAM_MAX_MEMBERS} members).` };
    }

    // Same rules per player as the individual form: digits-only IDs, no dashes,
    // and no clash inside the team or against existing registrations.
    const ids = [];
    for (const member of members){
      const sid = validateStudentId(member.studentId);
      if (!sid.ok){
        return { ok:false, field:"teamName", message:`${member.name || "A player"}: ${sid.message}` };
      }
      member.studentId = sid.value;
      ids.push(sid.value);
    }

    if (new Set(ids).size !== ids.length){
      return { ok:false, field:"teamName", message:"Each team member must have a different student number." };
    }
    const clash = ids.find(id => studentAlreadyRegistered(id, sportId));
    if (clash){
      return { ok:false, field:"teamName",
        message:`Student number ${clash} is already registered for this sport.` };
    }

    return { ok:true, value:{ teamName, members }};
  }

  /* Writes a validated entry into the shared store. Returns the saved record(s).
     `sportName` is stored alongside `sportId` so a registration can always be
     traced back to its sport, even if that sport is later deleted and re-added. */
  function addIndividual(value, extra){
    const sport = sportById(value.sportId);
    const record = Object.assign({
      id: uid("at"),
      ...value,
      sportName: sport ? sport.name : value.sportName || "",
      referenceNo: makeReference(),
      dateRegistered: todayStamp(),
    }, extra || {});
    state.athletes.push(record);
    saveAthletes();
    return record;
  }

  function addTeam(sportId, value, extra){
    const teamId = uid("team");
    const referenceNo = makeReference();
    const sport = sportById(sportId);
    const shared = Object.assign({
      sportId, sportName: sport ? sport.name : "",
      teamId, teamName: value.teamName,
      contact: "", facebook: "", course: "Esports Team", yearLevel: "Team Member",
      referenceNo, dateRegistered: todayStamp(),
    }, extra || {});

    const records = value.members.map(member => Object.assign({ id: uid("at") }, member, shared));
    state.athletes.push(...records);
    saveAthletes();
    return { records, referenceNo, teamName: value.teamName, teamId };
  }

  /* ============================================================
     STUDENT LOOKUP — status only, never scores or remarks
     ============================================================ */
  /* What a student is allowed to see. Results stay private until staff publish
     them from Final Selection; until then every student reads as Pending
     regardless of the real status. */
  function resultsPublished(){ return !!settings.publishResults; }

  function publicStatusFor(athlete, bypassPublishCheck){
    if (!bypassPublishCheck && !resultsPublished()) return "Pending";
    return statusOf(athlete);
  }

  /* The wording a student sees for their own result. */
  function publicStatusMessage(status, sportName){
    switch (status){
      case "Selected":     return `Congratulations, you are selected for ${sportName}!`;
      case "Waitlisted":   return `You are on the waitlist for ${sportName}.`;
      case "Not Selected": return `You were not selected for ${sportName} this season.`;
      default:             return "Your registration is received. Results will be posted after the tryout.";
    }
  }

  function publicSummary(athlete, bypassPublishCheck){
    const sport = sportById(athlete.sportId);
    const sportName = sport ? sport.name : (athlete.sportName || "this sport");
    const status = publicStatusFor(athlete, bypassPublishCheck);
    const schedule = scheduleFor(athlete.sportId);
    return {
      name: athlete.name,
      studentId: athlete.studentId,
      teamName: athlete.teamName || "",
      sport: sportName,
      status,
      statusMessage: publicStatusMessage(status, sportName),
      // The tryout plan for THIS student's sport, so they know where to report.
      schedule: scheduleSummary(schedule),
      venue: schedule.venue || "",
      published: resultsPublished(),
      registeredOn: athlete.dateRegistered || "",
      referenceNo: athlete.referenceNo || "",
    };
  }

  /* Exact-match lookup by student number or team name. Partial matches are
     deliberately ignored so the lookup can't be used to enumerate students.
     A typed dash is ignored, so "21-0134" finds "210134". */
  function lookupRegistration(query, bypassPublishCheck){
    const typed = String(query || "").trim();
    if (!typed) return { ok:false, message:"Enter your student number or your team name." };

    const digits = normalizeStudentId(typed);
    const needle = typed.toLowerCase();
    // A numeric query matches on digits only, so a typed dash is harmless.
    const isNumericQuery = /^\d+$/.test(digits);

    const matches = state.athletes.filter(a => {
      if (isNumericQuery){
        const stored = normalizeStudentId(a.studentId);
        if (stored && stored === digits) return true;
      }
      return !!(a.teamName && a.teamName.toLowerCase() === needle);
    });

    if (!matches.length){
      return { ok:false, message:"No registration found. Check your ID." };
    }
    return { ok:true, records: sortByName(matches).map(a => publicSummary(a, bypassPublishCheck)) };
  }

  /* ============================================================
     UI BITS
     ============================================================ */
  /* ------------------------------------------------------------
     POP-UP NOTIFICATIONS

     toast(message)                 -> neutral (default)
     toast(message, "success")      -> green tick
     toast(message, "error")        -> red alert
     toast(message, "info")         -> blue note
     toast(message, "warn")         -> amber triangle

     One argument keeps every existing call site working unchanged.
     Several notifications stack instead of overwriting each other, and each
     one can be dismissed early with its close button or the Escape key.
     ------------------------------------------------------------ */
  const TOAST_ICON = {
    success: '<path d="M20 6 9 17l-5-5"/>',
    error:   '<circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16.5h.01"/>',
    warn:    '<path d="M12 4 2.5 20h19L12 4Z"/><path d="M12 10v4"/><path d="M12 17.5h.01"/>',
    info:    '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/>',
    neutral: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/>',
  };
  const TOAST_MS = { success: 3600, info: 4000, neutral: 3600, warn: 5200, error: 6000 };

  function dismissToast(node){
    if (!node || node.dataset.closing === "1") return;
    node.dataset.closing = "1";
    clearTimeout(node._timer);
    node.classList.remove("show");
    // Remove only after the slide-out transition finishes.
    setTimeout(() => node.remove(), 320);
  }

  function toast(msg, type){
    const kind = TOAST_ICON[type] ? type : "neutral";

    // One stack per page. Older markup shipped a bare <div id="toast"> used as a
    // single message slot, so adopt an existing #toast rather than adding a
    // second element with the same id.
    let host = document.getElementById("toast");
    if (host && host.dataset.toastHost !== "1"){
      host.textContent = "";          // drop any stale text
      host.className = "toast-host";
      host.removeAttribute("style");
    } else if (!host){
      host = document.createElement("div");
      host.id = "toast";
      host.className = "toast-host";
      document.body.appendChild(host);
    }
    host.dataset.toastHost = "1";
    host.setAttribute("role", "region");
    host.setAttribute("aria-label", "Notifications");

    const node = document.createElement("div");
    node.className = `toast toast--${kind}`;
    node.setAttribute("role", kind === "error" ? "alert" : "status");
    node.dataset.toastKind = kind;
    node.innerHTML =
      `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TOAST_ICON[kind]}</svg>` +
      `<span class="toast-msg"></span>` +
      `<button type="button" class="toast-close" aria-label="Dismiss notification">` +
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
            stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;

    // textContent, never innerHTML: the message may contain user input.
    node.querySelector(".toast-msg").textContent = msg == null ? "" : String(msg);

    // Never let the stack grow without bound.
    const live = Array.prototype.slice.call(host.querySelectorAll(".toast:not([data-closing='1'])"));
    if (live.length >= 4) dismissToast(live[0]);

    host.appendChild(node);
    // Add the class on the next frame so the entry transition actually runs.
    // The timeout is a fallback for environments where rAF is throttled.
    requestAnimationFrame(() => node.classList.add("show"));
    setTimeout(() => node.classList.add("show"), 60);

    node.querySelector(".toast-close").addEventListener("click", () => dismissToast(node));
    node._timer = setTimeout(() => dismissToast(node), TOAST_MS[kind]);
    return node;
  }

  // Escape closes the newest notification, matching normal popup behaviour.
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    const host = document.getElementById("toast");
    if (!host || host.dataset.toastHost !== "1") return;
    const live = host.querySelectorAll(".toast:not([data-closing='1'])");
    if (live.length) dismissToast(live[live.length - 1]);
  });

  const modalApi = {
    open(html){
      const box = document.getElementById("modalBox");
      const veil = document.getElementById("modalVeil");
      box.innerHTML = html;
      veil.classList.add("open");
      const first = box.querySelector("input, select, textarea");
      if (first) first.focus();
    },
    close(){
      const box = document.getElementById("modalBox");
      const veil = document.getElementById("modalVeil");
      veil.classList.remove("open");
      box.innerHTML = "";
    },
    confirm(message, onYes){
      modalApi.open(`
        <h2>Please confirm</h2>
        <p class="modal-sub">${escapeHtml(message)}</p>
        <div class="modal-foot">
          <button type="button" class="btn btn-ghost" id="cfNo">Cancel</button>
          <button type="button" class="btn btn-danger" id="cfYes">Yes, proceed</button>
        </div>
      `);
      document.getElementById("cfNo").onclick = modalApi.close;
      document.getElementById("cfYes").onclick = () => { onYes(); modalApi.close(); };
    },
  };

  /* ---------------- public surface ---------------- */
  const api = {
    get LS(){ return LS; },
    NAMESPACES, useNamespace, clearNamespace, namespaceHasData,
    VERDICTS, STATUS_CLASS, DEPARTMENTS, CATEGORY_OPTIONS, YEAR_LEVELS, ESPORTS,
    TEAM_MIN_MEMBERS, TEAM_MAX_MEMBERS, SEASON_LABEL, STUDENT_ID_MIN, STUDENT_ID_MAX,
    DEFAULT_SPORTS, DEFAULT_SETTINGS, TIMEZONE,

    // live state (assignable so the admin app can swap a filtered array back in)
    get sports(){ return state.sports; },
    set sports(value){ state.sports = value; },
    get athletes(){ return state.athletes; },
    set athletes(value){ state.athletes = value; },
    get evals(){ return state.evals; },
    set evals(value){ state.evals = value; },
    get settings(){ return state.settings; },
    set settings(value){ replaceSettings(value); },

    // primitives
    uid, escapeHtml, safeParse, ratingLabel, ratingRange, skillPercent, skillBands, bandFor, DEFAULT_BANDS, verdictClass, makeReference,
    parseDate, todayStamp, fmtDateTime, fmtDate, fmtClock, tryoutMoment, countdownText,
    countdownParts, fmtCountdown, fmtTimeOnly, fmtClockTime,

    // settings + window
    normalizeSettings, registrationStatus, scheduleFor, scheduleSummary, scheduleLine,
    registrationBannerHtml, defaultTryoutDate, seasonYear, fmtScheduleWhen,
    publishSchedule,

    // live sync between tabs (localStorage only)
    broadcast, onSync,

    // verdicts
    suggestedVerdict, totalForAthlete, isManualVerdict, setStatusManual, verdictChanges,

    // export
    buildAthletesCsv,

    // student number / contact
    normalizeStudentId, normalizeContact, validateStudentId, validateContact,

    // sorting
    nameParts, compareByName, sortByName, groupBySport, sortTeamsForDisplay,

    // status
    statusOf, statusClass, setStatus, statusCounts, resultsPublished,
    // facebook
    looksLikeFacebookLink, facebookHref, validateFacebook, facebookCell,

    // store
    load, reload, saveSports, saveAthletes, saveEvals, saveSettings, migrate,
    normalizeSettings: replaceSettings,
    saveSportsRaw, saveAthletesRaw, saveEvalsRaw, saveSettingsRaw,
    sportById, athleteById, activeSports, athletesFor, isEsports,

    // rules
    studentAlreadyRegistered, validateIndividual, validateTeam, addIndividual, addTeam,

    // student lookup
    publicStatusFor, publicSummary, publicStatusMessage, lookupRegistration,

    // ui
    toast, modal: modalApi,
  };

  return api;
})();