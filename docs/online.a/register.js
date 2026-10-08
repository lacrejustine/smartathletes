/* ==========================================================
   SmartAthlete — student registration page (public)

   register.html only. Students see their own submission and the
   tryout schedule — nothing else. All storage, validation, and the
   registration-window rules come from common.js so this page and
   the admin app always agree on the same data.

   NOTE: this page deliberately never loads config.js or auth.js,
   so the admin credentials are not shipped to students.
   ========================================================== */

(function(){
  "use strict";

  const toast = SA.toast;
  const escapeHtml = SA.escapeHtml;

  // Read-only from the student side: never seed, never migrate writes that
  // invent data. `load()` only falls back to the built-in sport list in memory.
  SA.load({ seed: false });

  const el = {
    regStatus:   document.getElementById("regStatus"),
    tryout:      document.getElementById("tryoutSchedule"),
    form:        document.getElementById("regForm"),
    formPanel:   document.getElementById("formPanel"),
    confirmPanel:document.getElementById("confirmPanel"),
    confirmBody: document.getElementById("confirmBody"),
    lockNote:    document.getElementById("formLockNote"),
    submit:      document.getElementById("regSubmit"),
    schedule:    document.getElementById("formSchedule"),
    sport:       document.getElementById("rSport"),
    individual:  document.getElementById("individualFields"),
    team:        document.getElementById("teamFields"),
    teamList:    document.getElementById("teamMemberList"),
    lookupResult:document.getElementById("lookupResult"),
  };

  /* ============================================================
     LIVE COUNTDOWN + AUTOMATIC OPEN/CLOSED SWITCH (Part 2)
     Ticks every second, so the page flips to the Registration Closed
     card the moment the deadline passes, with no reload.
     ============================================================ */
  function renderCountdown(){
    const el = document.getElementById("regCountdown");
    if (!el) return;
    const status = SA.registrationStatus();
    const cutoff = status.cutoffAt;

    if (!cutoff){
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const ms = cutoff.getTime() - Date.now();
    el.textContent = status.open
      ? `Registration closes in ${SA.fmtCountdown(ms)}`
      : "Registration is closed.";
    el.classList.toggle("is-closed", !status.open);
  }

  /* The closed card mirrors the published schedule so a student who missed the
     window still knows when and where to report. */
  function renderClosedCard(status){
    const card = document.getElementById("closedCard");
    if (!card) return;

    // Leave the form alone while it is open; only the closed state swaps in.
    if (status.open){
      card.hidden = true;
      return;
    }

    card.hidden = false;
    const lead = document.getElementById("closedCardLead");
    if (lead) lead.textContent = status.message;

    const host = document.getElementById("closedCardSchedule");
    if (!host) return;
    const general = SA.scheduleFor(null);
    const rows = [];
    if (general.date || general.time){
      rows.push(`<div class="closed-row"><span class="closed-label">Tryout</span><span class="closed-value">${escapeHtml(SA.fmtScheduleWhen(general.date, general.time) || "To be announced")}</span></div>`);
    }
    if (general.venue){
      rows.push(`<div class="closed-row"><span class="closed-label">Venue</span><span class="closed-value">${escapeHtml(general.venue)}</span></div>`);
    }
    if (general.note){
      rows.push(`<div class="closed-row"><span class="closed-label">Note</span><span class="closed-value">${escapeHtml(general.note)}</span></div>`);
    }
    host.innerHTML = rows.length
      ? rows.join("")
      : `<p class="field-hint" style="margin:0;">The tryout schedule will be posted on this page.</p>`;
  }

  let lastStatusCode = null;
  function tick(){
    const before = lastStatusCode;
    const status = SA.registrationStatus();

    renderCountdown();
    renderClosedCard(status);

    if (before !== null && before !== status.code){
      // The admin closed (or reopened) registration while this tab was open.
      // Re-render everything the student can see, without touching what they typed.
      SA.reload();
      renderStatus();
      buildSportOptions();
      renderTryoutPanel();
      toast(status.open
        ? "Registration is open again — you can submit now."
        : "Registration has closed. Your answers below have been kept.",
        status.open ? "success" : "warn");
    }
    lastStatusCode = status.code;
  }

  /* ============================================================
     HEADER / STATUS
     ============================================================ */
  /* Locks or unlocks every control to match the registration window.
     Both directions matter: the admin can close registration from another tab
     while this form is open, and reopen it just as easily. */
  function setFormLocked(locked, status){
    ["rName","rDepartment","rStudentId","rContact","rFacebook","rCourse","rYear","rTeamName"]
      .forEach(id => { const f = document.getElementById(id); if (f) f.disabled = locked; });
    document.querySelectorAll("#teamMemberList input, #teamMemberList select")
      .forEach(f => { f.disabled = locked; });
    el.sport.disabled = locked;
    SAIDPhoto.setEnabled(!locked);

    el.lockNote.hidden = !locked;
    if (locked){
      el.lockNote.textContent = status.message;
      el.submit.disabled = true;
      el.submit.textContent = "Online registration closed";
    } else {
      // Restore the label for the current sport (team vs individual).
      el.submit.disabled = false;
      el.submit.textContent = SA.isEsports(el.sport.value)
        ? "Submit team registration"
        : "Submit registration";
    }
  }

  function renderStatus(){
    const status = SA.registrationStatus();
    el.regStatus.innerHTML = SA.registrationBannerHtml(status, "student");
    lastStatusCode = status.code;
    renderCountdown();
    renderClosedCard(status);

    // The tryout plan stays visible even after registration closes.
    renderTryoutPanel();

    setFormLocked(!status.open, status);
  }

  function renderTryoutPanel(){
    const general = SA.scheduleFor(null);
    // Each entry is labelled with its sport so the student always knows which
    // schedule they are reading.
    const overrides = SA.sports
      .filter(s => SA.scheduleFor(s.id).overridden)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity:"base" }));

    const details = [
      general.date || general.time
        ? `<div class="schedule-when"><span class="schedule-label">All sports</span><strong>${escapeHtml(SA.fmtScheduleWhen(general.date, general.time))}</strong></div>`
        : "",
      general.venue
        ? `<div class="schedule-when"><span class="schedule-label">Venue</span><strong>${escapeHtml(general.venue)}</strong></div>`
        : "",
      general.note ? `<p class="schedule-note">${escapeHtml(general.note)}</p>` : "",
    ].filter(Boolean).join("");

    const overrideList = overrides.length ? `
      <div class="schedule-overrides">
        <h3>Different schedule for some sports</h3>
        ${overrides.map(s => `
          <div class="override-row">
            <strong>${escapeHtml(s.name)}</strong>
            <span>${escapeHtml(SA.scheduleSummary(SA.scheduleFor(s.id)) || "Using the general schedule")}</span>
          </div>`).join("")}
      </div>` : "";

    el.tryout.innerHTML = details || overrideList
      ? `<div class="schedule-main">${details}</div>${overrideList}`
      : `<p class="empty-note">The tryout date and venue have not been published yet. Check back soon.</p>`;
  }

  /* ============================================================
     FORM
     ============================================================ */
  function buildStaticOptions(){
    document.getElementById("rDepartment").innerHTML =
      `<option value="">Choose department</option>` +
      SA.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join("");
    document.getElementById("rYear").innerHTML =
      SA.YEAR_LEVELS.map(y => `<option>${y}</option>`).join("");
  }

  function buildTeamRows(){
    el.teamList.innerHTML = [...Array(SA.TEAM_MAX_MEMBERS).keys()].map(index => `
      <div class="team-member-row">
        <strong>Player ${index + 1}${index < SA.TEAM_MIN_MEMBERS ? "" : " (optional)"}</strong>
        <input class="team-member-name" type="text" placeholder="Full name" aria-label="Player ${index + 1} name">
        <input class="team-member-id" type="text" inputmode="numeric" maxlength="${SA.STUDENT_ID_MAX}" data-digits-only
               placeholder="210134" aria-label="Player ${index + 1} student number, digits only">
        <select class="team-member-department" aria-label="Player ${index + 1} department">
          <option value="">Department</option>
          ${SA.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join("")}
        </select>
      </div>`).join("");

    // Same digits-only rule as the individual form.
    el.teamList.querySelectorAll("[data-digits-only]").forEach(attachDigitOnly);
  }

  /* Blocks letters and symbols as the user types or pastes, so a student can
     never submit a dashed ID or a formatted phone number. */
  function attachDigitOnly(input){
    if (!input) return;
    const clean = () => {
      const digits = input.value.replace(/[^0-9]/g, "");
      if (input.value !== digits) input.value = digits;
    };
    input.addEventListener("input", clean);
    input.addEventListener("paste", () => setTimeout(clean, 0));
    input.addEventListener("blur", clean);
  }

/* The admin's "Open student page" button links here with ?sport=<id> so the
   student lands on the right sport already chosen. Unknown or retired ids are
   ignored and the list is left on its first option. */
  function sportFromUrl(){
    try{
      const wanted = new URLSearchParams(window.location.search).get("sport");
      if (!wanted) return null;
      const match = SA.activeSports().find(s => s.id === wanted);
      return match ? match.id : null;
    } catch (e){
      return null;
    }
  }

  /* Announce the deep-linked sport on the first render only. */
  let announcedFromUrl = false;

  // Only active sports are offered. Retired sports stay hidden from students.
  function buildSportOptions(){
    const current = el.sport.value || sportFromUrl();
    const list = SA.activeSports();
    if (!list.length){
      el.sport.innerHTML = `<option value="">No sports are open for registration</option>`;
      return;
    }
    el.sport.innerHTML = list
      .map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
      .join("");
    if (list.some(s => s.id === current)) el.sport.value = current;
    updateMode();

    // Say which sport they arrived for, so the pre-selection is never silent.
    // buildSportOptions() also runs on every sync poll, so announce it once only.
    if (current && el.sport.value === current && !announcedFromUrl){
      announcedFromUrl = true;
      const sport = SA.sportById(current);
      if (sport) toast(`${sport.name} selected for you \u2014 change it below if you like.`, "info");
    }
  }

  function updateMode(){
    const esports = SA.isEsports(el.sport.value);
    el.individual.hidden = esports;
    el.team.hidden = !esports;
    el.submit.textContent = esports ? "Submit team registration" : "Submit registration";

    const line = SA.scheduleLine(SA.scheduleFor(el.sport.value), SA.sportById(el.sport.value)?.name || "");
    el.schedule.textContent = line ? `Tryout \u2014 ${line}` : "";
    el.schedule.hidden = !line;

    // Re-apply the lock if registration closed while the page was open.
    if (!SA.registrationStatus().open) renderStatus();
    else SAIDPhoto.setEnabled(true);
  }

  function readTeamMembers(){
    return [...el.teamList.querySelectorAll(".team-member-row")].map(row => ({
      name: row.querySelector(".team-member-name").value.trim(),
      studentId: row.querySelector(".team-member-id").value.trim(),
      department: row.querySelector(".team-member-department").value,
    })).filter(m => m.name || m.studentId);
  }

  function focusField(field){
    const map = {
      name:"rName", studentId:"rStudentId", department:"rDepartment",
      facebook:"rFacebook", teamName:"rTeamName",
    };
    const target = document.getElementById(map[field] || "");
    if (target) target.focus();
  }

  // Switching to an esports sport swaps the individual form for the team form.
  el.sport.addEventListener("change", updateMode);

  el.form.addEventListener("submit", event => {
    event.preventDefault();
    submitRegistration();
  });

  // The student ID photo is required for both individual and team sign-ups.
  // Checked before any other rule so the student is told about the missing
  // photo first, and the typed values are left untouched.
  function checkIdPhoto(){
    return SAIDPhoto.requirePhoto();
  }

  async function submitRegistration(){
    // ---- Re-check the window before anything else ----
    // The form may have been sitting open while the admin closed registration
    // or the cutoff passed. This is the authoritative check.
    const status = SA.registrationStatus();
    if (!status.open){
      toast(status.message, "error");
      renderStatus();
      return;
    }

    // Another tab (or the admin) may have changed settings since page load.
    SA.reload();
    const fresh = SA.registrationStatus();
    if (!fresh.open){
      toast(fresh.message, "error");
      renderStatus();
      return;
    }

    const sportId = el.sport.value;
    const sport = SA.sportById(sportId);
    if (!sport || sport.status !== "active"){
      toast("Choose an active sport.", "error");
      buildSportOptions();
      return;
    }

    // ---- Student ID photo (required, both individual and team) ----
    const photo = checkIdPhoto();
    if (!photo.ok) return;

    if (sport.category === SA.ESPORTS){
      const team = SA.validateTeam({ sportId, teamName: document.getElementById("rTeamName").value, members: readTeamMembers() });
      if (!team.ok){ toast(team.message, "error"); focusField(team.field); return; }

      // Write the image first. If storage is full the student keeps every
      // value they typed and no half-registration is created.
      SAIDPhoto.setBusy(true, "Uploading...");
      const stored = SAIDPhoto.persist();
      SAIDPhoto.setBusy(false);
      if (!stored.ok){ toast(stored.message, "error"); return; }

      const saved = SA.addTeam(sportId, team.value, SAIDPhoto.recordExtra());
      showConfirmation({
        kind: "team",
        referenceNo: saved.referenceNo,
        sportName: sport.name,
        registeredOn: saved.records[0].dateRegistered,
        summary: `${saved.records.length} players \u00b7 ${saved.teamName}`,
        rows: [
          ["Team name", saved.teamName],
          ["Players", String(saved.records.length)],
          ["Sport", sport.name],
          ["Registered on", SA.fmtDate(saved.records[0].dateRegistered)],
        ],
        members: saved.records.map(r => ({ name: r.name, detail: `${r.studentId} \u00b7 ${r.department}` })),
      });
      return;
    }

    const result = SA.validateIndividual({
      sportId,
      name: document.getElementById("rName").value,
      studentId: document.getElementById("rStudentId").value,
      department: document.getElementById("rDepartment").value,
      contact: document.getElementById("rContact").value,
      facebook: document.getElementById("rFacebook").value,
      course: document.getElementById("rCourse").value,
      yearLevel: document.getElementById("rYear").value,
    });
    if (!result.ok){ toast(result.message, "error"); focusField(result.field); return; }

    // Same as the team path: persist the image before the record so a failed
    // upload never leaves a registration without its ID photo.
    SAIDPhoto.setBusy(true, "Uploading...");
    const stored = SAIDPhoto.persist();
    SAIDPhoto.setBusy(false);
    if (!stored.ok){ toast(stored.message, "error"); return; }

    const saved = SA.addIndividual(result.value, SAIDPhoto.recordExtra());
    showConfirmation({
      kind: "individual",
      referenceNo: saved.referenceNo,
      sportName: sport.name,
      registeredOn: saved.dateRegistered,
      summary: saved.name,
      rows: [
        ["Name", saved.name],
        ["Student number", saved.studentId],
        ["Department", saved.department],
        ["Sport", sport.name],
        ["Year level", saved.yearLevel],
        ["Registered on", SA.fmtDate(saved.dateRegistered)],
      ],
      members: [],
    });
  }

  /* ============================================================
     CONFIRMATION
     ============================================================ */
  // scrollIntoView isn't available in every environment (and older browsers)
  function scrollTo(el){
    if (el && typeof el.scrollIntoView === "function"){
      try { el.scrollIntoView({ behavior:"smooth", block:"start" }); } catch (e){ el.scrollIntoView(); }
    }
  }

  function showConfirmation(payload){
    el.formPanel.hidden = true;
    el.confirmPanel.hidden = false;
    scrollTo(el.confirmPanel);

    const tryoutLine = SA.scheduleSummary(SA.scheduleFor(findSportIdByName(payload.sportName)));
    el.confirmBody.innerHTML = `
      <div class="confirm-head">
        <div class="confirm-tick">&#10003;</div>
        <div>
          <h3>${payload.kind === "team" ? "Team registered" : "You're registered"}</h3>
          <p>${escapeHtml(payload.summary)} &middot; ${escapeHtml(payload.sportName)}</p>
        </div>
      </div>

      <div class="ref-box">
        <span>Your reference number</span>
        <strong>${escapeHtml(payload.referenceNo)}</strong>
        <em>${tryoutLine ? "Tryout — " + escapeHtml(payload.sportName) + ": " + escapeHtml(tryoutLine) : "The tryout schedule is posted on this page."}</em>
      </div>

      <ul class="confirm-list">
        ${payload.rows.map(([label, value]) => `<li><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></li>`).join("")}
      </ul>

      ${payload.members.length ? `
        <div class="roster-echo">
          <h4>Team members</h4>
          <ul>
            ${payload.members.map(m => `<li><b>${escapeHtml(m.name)}</b><br><span>${escapeHtml(m.detail)}</span></li>`).join("")}
          </ul>
        </div>` : ""}
    `;

    toast("Registration submitted.", "success");
  }

  function findSportIdByName(name){
    const sport = SA.sports.find(s => s.name === name);
    return sport ? sport.id : null;
  }

  document.getElementById("btnRegisterAnother").onclick = () => {
    el.confirmPanel.hidden = true;
    el.formPanel.hidden = false;
    el.form.reset();
    SAIDPhoto.reset();
    buildSportOptions();
    scrollTo(el.formPanel);
  };

  document.getElementById("btnPrintRef").onclick = () => window.print();

  /* "REGISTER NOW" in the top-centre hero. It is a real link to the form
     panel so it behaves normally without JS, but the jump is handled here so
     that (a) it lands on the confirmation panel instead when the form is
     already submitted and hidden, and (b) keyboard users get focus moved
     there rather than having to hunt for it with Tab. */
  const heroCta = document.getElementById("registerNow");
  if (heroCta){
    heroCta.addEventListener("click", event => {
      const target = el.formPanel.hidden ? el.confirmPanel : el.formPanel;
      if (target.hidden) return;             // nothing to jump to: let the anchor behave
      event.preventDefault();
      scrollTo(target);
      // focus without scrolling again
      if (typeof target.focus === "function"){
        try { target.focus({ preventScroll: true }); }
        catch (e) { target.focus(); }
      }
      history.replaceState(null, "", "#" + (target === el.formPanel ? "formPanel" : "confirmPanel"));
      toast(target === el.formPanel
        ? "Take a moment to fill in your details below."
        : "This is your confirmation \u2014 your answers are already saved.",
        "info");
    });
  }

  // Re-runs the lookup only when the student has actually looked one up, so a
  // settings change never invents an empty result on the page.
  function runLookupIfPresent(){
    const query = document.getElementById("lookupQuery").value.trim();
    if (query) runLookup();
  }

  /* ============================================================
     "CHECK MY REGISTRATION" — status only, never scores
     ============================================================ */
  document.getElementById("lookupForm").addEventListener("submit", event => {
    event.preventDefault();
    runLookup();
  });

  let lookupPollInterval = null;
  const LOOKUP_POLL_INTERVAL = 3000; // 3 seconds

  function runLookup(){
    SA.reload();
    const result = SA.lookupRegistration(document.getElementById("lookupQuery").value, true);

    if (!result.ok){
      el.lookupResult.innerHTML = `<p class="empty-note">${escapeHtml(result.message)}</p>`;
      toast(result.message, "warn");
      stopLookupPolling();
      return;
    }

    // Only this student's own record is rendered: no scores, no remarks, and
    // never anyone else's data.
    el.lookupResult.innerHTML = `
      <div class="lookup-records">
        ${result.records.map(rec => `
          <div class="lookup-record is-${SA.statusClass(rec.status)}">
            <div class="lookup-head">
              <div class="lookup-who">
                <strong>${escapeHtml(rec.name)}</strong>
                <span>${escapeHtml(rec.studentId)}${rec.teamName ? " \u00b7 " + escapeHtml(rec.teamName) : ""}</span>
              </div>
              <span class="verdict-pill ${SA.statusClass(rec.status)}">${escapeHtml(rec.status)}</span>
            </div>

            <p class="lookup-message">${escapeHtml(rec.statusMessage)}</p>

            ${rec.schedule ? `
            <div class="lookup-tryout">
              <h4>Tryout Information</h4>
              <div class="tryout-grid">
                ${rec.schedule.date ? `<div class="tryout-item"><span class="tryout-label">TRYOUT DATE</span><span class="tryout-value">${escapeHtml(SA.fmtDate(rec.schedule.date))}</span></div>` : ""}
                ${rec.schedule.time ? `<div class="tryout-item"><span class="tryout-label">TRYOUT TIME</span><span class="tryout-value">${escapeHtml(rec.schedule.time)}</span></div>` : ""}
                ${rec.schedule.venue ? `<div class="tryout-item"><span class="tryout-label">VENUE</span><span class="tryout-value">${escapeHtml(rec.schedule.venue)}</span></div>` : ""}
                ${rec.schedule.note ? `<div class="tryout-item tryout-note"><span class="tryout-label">WHAT TO BRING</span><span class="tryout-value">${escapeHtml(rec.schedule.note)}</span></div>` : ""}
              </div>
              <p class="tryout-reminder">Please arrive at least 15 minutes before your scheduled tryout.</p>
            </div>` : ""}

            <div class="lookup-meta">
              <div><span>Sport</span><strong>${escapeHtml(rec.sport)}</strong></div>
              ${rec.schedule ? `<div><span>Tryout</span><strong>${escapeHtml(rec.schedule)}</strong></div>` : ""}
              ${rec.venue ? `<div><span>Venue</span><strong>${escapeHtml(rec.venue)}</strong></div>` : ""}
              <div><span>Reference</span><strong>${escapeHtml(rec.referenceNo || "\u2014")}</strong></div>
              ${rec.selectedAt ? `<div><span>Last updated</span><strong>${escapeHtml(SA.fmtDateTime(rec.selectedAt))}</strong></div>` : ""}
              ${rec.selectedBy ? `<div><span>Selected by</span><strong>${escapeHtml(rec.selectedBy)}</strong></div>` : ""}
            </div>
          </div>`).join("")}
      </div>
      <p class="lookup-note">${result.records[0].published
        ? "Scores and coach's remarks are not published here."
        : "Results are not published yet. You will see your final status here once the tryout is done."}</p>
    `;
    toast(result.records.length === 1
      ? "Found your registration."
      : `Found ${result.records.length} registrations.`, "success");
    
    // Start polling for real-time updates
    startLookupPolling();
  }

  function startLookupPolling() {
    stopLookupPolling();
    const query = document.getElementById("lookupQuery").value.trim();
    if (!query) return;
    
    lookupPollInterval = setInterval(() => {
      const currentQuery = document.getElementById("lookupQuery").value.trim();
      if (!currentQuery || currentQuery !== query) {
        stopLookupPolling();
        return;
      }
      
      // Reload data and re-run lookup silently
      SA.reload();
      const result = SA.lookupRegistration(query, true);
      
      if (result.ok) {
        // Check if any record's status has changed
        const currentRecords = document.querySelectorAll(".lookup-record");
        let hasChanges = false;
        
        result.records.forEach((rec, index) => {
          const currentRecord = currentRecords[index];
          if (currentRecord) {
            const currentStatus = currentRecord.querySelector(".verdict-pill")?.textContent?.trim();
            const newStatus = rec.status;
            if (currentStatus !== newStatus) {
              hasChanges = true;
            }
          }
        });
        
        if (hasChanges) {
          // Re-run lookup to update the display
          runLookup();
        }
      }
    }, 3000); // Poll every 3 seconds
  }

  function stopLookupPolling() {
    if (lookupPollInterval) {
      clearInterval(lookupPollInterval);
      lookupPollInterval = null;
    }
  }

  /* ============================================================
     BOOT + LIVE REFRESH
     ============================================================ */
  buildStaticOptions();
  // Digits-only on the individual form fields too.
  document.querySelectorAll("#regForm [data-digits-only]").forEach(attachDigitOnly);
  buildTeamRows();
  buildSportOptions();
  SAIDPhoto.attach();
  renderStatus();
  tick();

  // Ticking countdown: repaints the clock every second and flips the page to
  // the closed card on its own when the deadline passes.
  setInterval(tick, 1000);

  // Refresh the countdown and the lock state.
  setInterval(() => {
    const before = SA.registrationStatus().code;
    SA.reload();
    renderStatus();
    if (before !== SA.registrationStatus().code) buildSportOptions();
  }, 30000);

  // An admin tab saved settings: pick them up without a reload.
  SA.onSync(() => {
    SA.reload();
    buildSportOptions();
    renderStatus();
    renderTryoutPanel();
    runLookupIfPresent();
  });

  // Pick up admin changes made in another tab without a reload.
  window.addEventListener("storage", event => {
    if (!event.key || event.key.indexOf("sa_") !== 0) return;
    SA.reload();
    buildSportOptions();
    renderStatus();
    runLookupIfPresent();
  });

  // Clean up polling on page unload
  window.addEventListener("beforeunload", stopLookupPolling);

  // Stop polling when lookup query is cleared
  document.getElementById("lookupQuery").addEventListener("input", () => {
    if (!document.getElementById("lookupQuery").value.trim()) {
      stopLookupPolling();
    }
  });

})();
