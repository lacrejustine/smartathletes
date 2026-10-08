/* ==========================================================
   SmartAthlete — admin app (admin.html)

   Protected side: sports, athletes, tryout evaluation, final
   selection, and the registration window. Storage, formatting,
   validation, and UI primitives come from common.js so this file
   and the public student page can never drift apart.
   ========================================================== */

(function(){
  "use strict";

  // No valid session? Bounce to login.html and render nothing.
  if (!window.SA_AUTH || !SA_AUTH.requireAdmin("admin.html")) return;

  // A demo session reads and writes the separate `smartathlete_demo_*`
  // namespace, so nothing done in the demo touches real registrations.
  const IS_DEMO = SA_AUTH.isDemo();
  if (IS_DEMO) SA.useNamespace("demo");

  const toast = SA.toast;
  const modal = SA.modal;
  const openModal = modal.open.bind(modal);
  const closeModal = modal.close.bind(modal);
  const openConfirm = modal.confirm.bind(modal);
  const uid = SA.uid;
  const escapeHtml = SA.escapeHtml;

  SA.load({ seed: true });

  let currentView = "dashboard";

  /* ============================================================
     NAV / VIEW SWITCHING
     ============================================================ */
  function switchView(view){
    currentView = view;
    document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + view));
    renderAll();
  }

  document.getElementById("sideNav").addEventListener("click", e => {
    const btn = e.target.closest(".nav-item");
    if (btn) switchView(btn.dataset.view);
  });

  document.getElementById("btnLogout").onclick = () => openConfirm(
    IS_DEMO
      ? "Log out of demo mode? The sample data stays until you use \"Exit Demo\"."
      : "Log out of the admin area?",
    () => SA_AUTH.logout()
  );

  document.getElementById("btnExitDemo").onclick = () => openConfirm(
    "Exit demo mode? This clears the sample data and returns to the login page.",
    () => SA_AUTH.exitDemo()
  );

  /* ---------------- demo indicators ---------------- */
  if (IS_DEMO){
    document.getElementById("demoBadge").hidden = false;
    document.getElementById("demoBanner").hidden = false;
    document.getElementById("btnExitDemo").hidden = false;
  }

  /* ============================================================
     SPORTS — Create / Update / Delete
     ============================================================ */
  function sportInitials(name){
    const cleaned = name.replace(/\(.*?\)/g, "").trim();
    const words = cleaned.split(/\s+/);
    if (words.length === 1) return words[0].slice(0,2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  /* Normalises a sport name for map lookups: lowercase, alphanumeric only.
     "DOTA 2 (Esports)" -> "dota2",  "Beach Volleyball" -> "beachvolleyball".
     Shared by the sport-image map and the initials fallback. */
  const iconKey = str => String(str || "").replace(/\(.*?\)/g, "") // drop "(Esports)"
    .toLowerCase().replace(/[^a-z0-9]/g, "");

/* ============================================================
     SPORT ARTWORK ASSETS

     The project ships one real image per sport under image=logo/.
     These are used verbatim: never renamed, edited or re-encoded.

     Keys are the normalised sport names produced by iconKey() (lowercase,
     alphanumeric only), so the lookup is exact and predictable. There is no
     tail matching here on purpose: "volleyball" and "beachvolleyball" must
     resolve to their own files, not to a shared fallback.

     Two filenames in this folder are spelt differently from the brief:
       sepak takraw  -> sepaktakraw.png   (no space in the real file)
       taekwondo    -> teakwando.png     (real file has no "kd" pair)
     The real names are used as-is rather than renaming anything.
     ============================================================ */
  const SPORT_IMAGE = {
    athletics:       "transparent/athlete.png",
    badminton:       "transparent/badminton.png",
    baseball:        "transparent/baseball.png",
    basketball:      "transparent/basketball.png",
    beachvolleyball: "transparent/beachvolley.png",
    chess:           "transparent/chess.png",
    dota:            "transparent/dota2.png",
    dota2:           "transparent/dota2.png",
    football:        "transparent/football.png",
    highjump:        "transparent/highjump.png",
    lawntennis:      "transparent/lawntennis.png",
    longjump:        "transparent/longjump.png",
    mlbb:            "transparent/mlbb.png",
    pickleball:      "transparent/pickleball.png",
    sepak:           "transparent/sepaktakraw.png",
    sepaktakraw:     "transparent/sepaktakraw.png",
    tabletennis:     "transparent/tabletennis.png",
    taekwondo:       "transparent/teakwando.png",
    valorant:        "transparent/valorant.png",
    volleyball:      "transparent/volleyball.png",
  };

  // Last resort for a sport added later with no matching file: an empty src is
  // hidden by CSS rather than showing a broken image icon.
  function sportImageHtml(sport){
    const file = SPORT_IMAGE[iconKey(sport && sport.name)];
    if (!file) return `<span class="sc-image sc-image--none" aria-hidden="true"></span>`;
    return `<span class="sc-image">`
      + `<img src="image=logo/${file}" alt="" loading="lazy" decoding="async">`
      + `</span>`;
  }
  /* ============================================================
     READ-ONLY STUDENT DETAIL  (used by the roster cards)

     Clicking a student name on a sport card opens every field the coach needs
     to verify a registration, including the uploaded Student ID photo. This is
     deliberately read-only: editing stays on the Athletes page, so nothing here
     can accidentally overwrite a registration.
     ============================================================ */
  function detailRowHtml(label, value){
    return `<div class="detail-row">
      <dt>${escapeHtml(label)}</dt>
      <dd>${value || `<span class="detail-empty">Not provided</span>`}</dd>
    </div>`;
  }

  function openStudentDetail(athlete){
    if (!athlete) return;
    const sport = SA.sportById(athlete.sportId);
    const isTeamMember = !!athlete.teamName;
    const fb = athlete.facebook
      ? `<a href="${escapeHtml(SA.facebookHref(athlete.facebook))}" target="_blank" rel="noopener noreferrer">${escapeHtml(athlete.facebook)}</a>`
      : "";

    openModal(`
      <h2>Student details</h2>
      <p class="modal-sub">${escapeHtml(sport ? sport.name : athlete.sportName || "Sport")}
        &middot; registered ${escapeHtml(SA.fmtDate(athlete.dateRegistered))}</p>

      <dl class="detail-list">
        ${detailRowHtml("Name", escapeHtml(athlete.name))}
        ${detailRowHtml("Department", escapeHtml(athlete.department))}
        ${detailRowHtml("Course", escapeHtml(athlete.course))}
        ${detailRowHtml("Student number", escapeHtml(athlete.studentId))}
        ${detailRowHtml("Contact number", escapeHtml(athlete.contact))}
        ${detailRowHtml("Facebook account", fb)}
        ${isTeamMember ? detailRowHtml("Team", escapeHtml(athlete.teamName)) : ""}
        ${detailRowHtml("Year level", escapeHtml(athlete.yearLevel))}
        ${detailRowHtml("Reference number", escapeHtml(athlete.referenceNo || "\u2014"))}
        ${detailRowHtml("Current status", `<span class="verdict-pill ${SA.statusClass(SA.statusOf(athlete))}">${escapeHtml(SA.statusOf(athlete))}</span>`)}
      </dl>

      <div class="field id-photo-field">
        <span class="field-label">Verification &mdash; Student ID photo</span>
        ${athleteIdPhotoHtml(athlete)}
      </div>

      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" id="dClose">Close</button>
      </div>
    `);

    const viewBtn = document.querySelector("#modalBox [data-photo]");
    if (viewBtn) viewBtn.onclick = () => SAIDPhoto.openViewer(viewBtn.dataset.photo);
    document.getElementById("dClose").onclick = closeModal;
  }
  function openSportModal(sport){
    const isEdit = !!sport;
    openModal(`
      <h2>${isEdit ? "Edit Sport" : "Add a Sport"}</h2>
      <p class="modal-sub">${isEdit ? "Update how this sport appears across the system." : "New sports become available immediately for athlete registration."}</p>
      <div class="field">
        <label for="fSportName">Sport name</label>
        <input id="fSportName" type="text" maxlength="60" value="${isEdit ? escapeHtml(sport.name) : ""}" placeholder="e.g. Arnis">
      </div>
      <div class="field">
        <label for="fSportCat">Category</label>
        <select id="fSportCat">
          ${SA.CATEGORY_OPTIONS.map(c => `<option value="${c}" ${isEdit && sport.category===c ? "selected":""}>${c}</option>`).join("")}
        </select>
      </div>
      ${isEdit ? `
      <div class="field">
        <label for="fSportStatus">Status</label>
        <select id="fSportStatus">
          <option value="active" ${sport.status==="active"?"selected":""}>Active — open for tryouts</option>
          <option value="retired" ${sport.status==="retired"?"selected":""}>Retired — hidden from new entries</option>
        </select>
      </div>` : ""}
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" id="spCancel">Cancel</button>
        <button type="button" class="btn btn-gold" id="spSave">${isEdit ? "Save changes" : "Add sport"}</button>
      </div>
    `);
    document.getElementById("spCancel").onclick = closeModal;
    document.getElementById("spSave").onclick = () => {
      const name = document.getElementById("fSportName").value.trim();
      const category = document.getElementById("fSportCat").value;
      if (!name){ toast("Give the sport a name first."); return; }
      const dupe = SA.sports.find(s => s.name.toLowerCase() === name.toLowerCase() && (!isEdit || s.id !== sport.id));
      if (dupe){ toast("That sport already exists."); return; }

      if (isEdit){
        sport.name = name; sport.category = category;
        sport.status = document.getElementById("fSportStatus").value;
        toast(`${name} updated.`);
      } else {
        SA.sports.push({ id: uid("sp"), name, category, status: "active" });
        toast(`${name} added to the sports roster.`);
      }
      SA.saveSports();
      closeModal();
      renderAll();
    };
  }

  function deleteSport(sport){
    const linkedAthletes = SA.athletesFor(sport.id).length;
    const msg = linkedAthletes
      ? `${sport.name} has ${linkedAthletes} registered athlete(s) and their evaluations. Deleting it removes all of that data permanently.`
      : `Delete ${sport.name} permanently? This cannot be undone.`;
    openConfirm(msg, () => {
      SA.sports = SA.sports.filter(s => s.id !== sport.id);
      SA.athletes = SA.athletes.filter(a => a.sportId !== sport.id);
      SA.evals = SA.evals.filter(ev => ev.sportId !== sport.id);
      SA.saveSports(); SA.saveAthletes(); SA.saveEvals();
      toast(`${sport.name} removed.`);
      renderAll();
    });
  }

  function renderSports(){
    const grid = document.getElementById("sportGrid");
    const search = document.getElementById("sportSearch").value.trim().toLowerCase();
    const cat = document.getElementById("sportCategoryFilter").value;

    const list = SA.sports.filter(s =>
      (!search || s.name.toLowerCase().includes(search)) &&
      (!cat || s.category === cat)
    );

    if (!list.length){
      grid.innerHTML = `<p class="empty-note">No sports match that search.</p>`;
      return;
    }

    grid.innerHTML = list.map(s => {
      const regCount = SA.athletesFor(s.id).length;
      const selCount = SA.athletesFor(s.id).filter(a => SA.statusOf(a) === "Selected").length;
      return `
      <div class="sport-tile ${s.status==="retired"?"retired":""}" data-id="${s.id}">
        <div class="tile-top">
          <div class="tile-badge">${sportInitials(s.name)}</div>
          <div class="tile-cat">${s.category}</div>
        </div>
        <h3 class="tile-name">${escapeHtml(s.name)}</h3>
        <span class="status-pill ${s.status}">${s.status === "active" ? "Active" : "Retired"}</span>
        <div class="tile-meta">
          <span>${regCount} registered</span>
          <span>${selCount} selected</span>
        </div>
        <div class="tile-actions">
          <button class="btn btn-ghost btn-sm" data-act="edit">Edit</button>
          <button class="btn btn-danger btn-sm" data-act="delete">Delete</button>
        </div>
      </div>`;
    }).join("");

    grid.querySelectorAll(".sport-tile").forEach(tile => {
      const sport = SA.sportById(tile.dataset.id);
      tile.querySelector('[data-act="edit"]').onclick = () => openSportModal(sport);
      tile.querySelector('[data-act="delete"]').onclick = () => deleteSport(sport);
    });
  }

  document.getElementById("btnAddSport").onclick = () => openSportModal(null);
  document.getElementById("sportSearch").addEventListener("input", renderSports);
  document.getElementById("sportCategoryFilter").addEventListener("change", renderSports);

  /* ============================================================
     ATHLETES — Edit / Delete only.
     Registrations now come exclusively from the public student
     page, so there is no "add" path here. Staff can still correct
     a student's details and change their status.
     ============================================================ */
  function sportOptionsHtml(selectedId){
    // Only active sports can be assigned. (This used to read an undeclared
    // `includeRetired` flag, which threw a ReferenceError and broke the whole
    // athlete Edit modal. Kept as a plain active-sports filter.)
    return SA.sports
      .filter(s => s.status === "active")
      .map(s => `<option value="${s.id}" ${s.id===selectedId?"selected":""}>${escapeHtml(s.name)}${s.status==="retired" ? " (retired)" : ""}</option>`)
      .join("");
  }

  function refreshSportFilterDropdowns(){
    const dropdowns = [
      document.getElementById("athleteSportFilter"),
      document.getElementById("evalSportFilter"),
      document.getElementById("selectionSportFilter"),
    ];
    dropdowns.forEach(dd => {
      const current = dd.value;
      const placeholder = dd.options[0];
      dd.innerHTML = "";
      dd.appendChild(placeholder);
      SA.sports.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.name + (s.status === "retired" ? " (retired)" : "");
        dd.appendChild(opt);
      });
      if ([...dd.options].some(o => o.value === current)) dd.value = current;
    });
  }

/* Correcting a registration. Team rosters are assembled by students on the
     public page, so there is no team form here — an esports row is just an
     athlete record the staff can fix up like any other. */
  function openAthleteModal(athlete){
    if (!athlete) return;

    openModal(`
      <h2>Edit Registration</h2>
      <p class="modal-sub">Correct a student's details. Student numbers are digits only and contact numbers must be 11 digits starting with 09.</p>
      <div class="field">
        <label for="fASport">Sport</label>
        <select id="fASport">${sportOptionsHtml(athlete.sportId)}</select>
      </div>
      <p class="modal-schedule" id="modalSchedule" hidden></p>
      <div class="field">
        <label for="fAName">Full name</label>
        <input id="fAName" type="text" value="${escapeHtml(athlete.name)}" placeholder="Juan Dela Cruz">
      </div>
      <div class="field">
        <label for="fADepartment">Department</label>
        <select id="fADepartment">
          <option value="">Choose department</option>
          ${SA.DEPARTMENTS.map(d => `<option value="${d}" ${athlete.department === d ? "selected" : ""}>${d}</option>`).join("")}
        </select>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="fAStudentId">Student number</label>
          <input id="fAStudentId" type="text" inputmode="numeric" maxlength="${SA.STUDENT_ID_MAX}" data-digits-only
                 value="${escapeHtml(athlete.studentId)}" placeholder="210134">
        </div>
        <div class="field">
          <label for="fAContact">Contact number</label>
          <input id="fAContact" type="text" inputmode="numeric" maxlength="11" data-digits-only
                 value="${escapeHtml(athlete.contact)}" placeholder="09XXXXXXXXX">
        </div>
      </div>
      <div class="field">
        <label for="fAFacebook">Facebook account <span class="req-mark">required</span></label>
        <input id="fAFacebook" type="text" autocomplete="off"
               value="${escapeHtml(athlete.facebook || "")}" placeholder="facebook.com/juan.delacruz or your Facebook name">
        <span class="field-hint">Your Facebook profile link or the name people can search you by on Facebook.</span>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="fACourse">Course</label>
          <input id="fACourse" type="text" value="${escapeHtml(athlete.course)}" placeholder="BS Criminology">
        </div>
        <div class="field">
          <label for="fAYear">Year level</label>
          <select id="fAYear">
            ${SA.YEAR_LEVELS.map(y => `<option ${athlete.yearLevel === y ? "selected" : ""}>${y}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="field id-photo-field">
        <span class="field-label">Student ID photo</span>
        ${athleteIdPhotoHtml(athlete)}
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" id="aCancel">Cancel</button>
        <button type="button" class="btn btn-gold" id="aSave">Save changes</button>
      </div>
    `);

    const sportSelect = document.getElementById("fASport");
    const scheduleNote = document.getElementById("modalSchedule");

    // Strip anything that is not a digit as the staff types or pastes.
    attachDigitOnly(document.getElementById("fAStudentId"));
    attachDigitOnly(document.getElementById("fAContact"));

    function updateScheduleNote(){
      const line = SA.scheduleLine(SA.scheduleFor(sportSelect.value), SA.sportById(sportSelect.value)?.name || "");
      scheduleNote.textContent = line ? `Tryout \u2014 ${line}` : "";
      scheduleNote.hidden = !line;
    }
    sportSelect.addEventListener("change", updateScheduleNote);
    updateScheduleNote();

    const viewBtn = document.querySelector("#modalBox [data-photo]");
    if (viewBtn) viewBtn.onclick = () => SAIDPhoto.openViewer(viewBtn.dataset.photo);

    document.getElementById("aCancel").onclick = closeModal;
    document.getElementById("aSave").onclick = () => {
      const sportId = sportSelect.value;
      const sport = SA.sportById(sportId);
      if (!sport){ toast("Choose a valid sport."); return; }

      // Same validation the student form uses, but contact and Facebook are
      // allowed to stay blank for esports players who never supplied them.
      const sid = SA.validateStudentId(document.getElementById("fAStudentId").value);
      if (!sid.ok){ toast(sid.message); return; }

      let contact = "";
      const contactRaw = document.getElementById("fAContact").value.trim();
      if (contactRaw){
        const phone = SA.validateContact(contactRaw);
        if (!phone.ok){ toast(phone.message); return; }
        contact = phone.value;
      }

      let facebook = "";
      const fbRaw = document.getElementById("fAFacebook").value.trim();
      if (fbRaw){
        const fb = SA.validateFacebook(fbRaw);
        if (!fb.ok){ toast(fb.message); return; }
        facebook = fb.value;
      }

      const name = document.getElementById("fAName").value.trim();
      const department = document.getElementById("fADepartment").value;
      if (!name){ toast("Enter the student's full name."); return; }
      if (!department){ toast("Choose a department."); return; }
      if (SA.studentAlreadyRegistered(sid.value, sportId, athlete.id)){
        toast("That student number is already registered for this sport."); return;
      }

      Object.assign(athlete, {
        name, studentId: sid.value, department, contact, facebook,
        course: document.getElementById("fACourse").value.trim(),
        yearLevel: document.getElementById("fAYear").value,
        sportId, sportName: sport.name,
      });
      SA.saveAthletes();
      // Keep the evaluation's sport in step when the sport is changed.
      SA.evals.forEach(ev => { if (ev.athleteId === athlete.id) ev.sportId = sportId; });
      SA.saveEvals();
      closeModal();
      toast(`${name}'s record updated.`);
      renderAll();
    };
  }

  /* Blocks non-digits in an input as the user types or pastes. */
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

  function deleteAthlete(athlete){
    openConfirm(`Remove ${athlete.name} and any of their tryout evaluations?`, () => {
      SA.athletes = SA.athletes.filter(a => a.id !== athlete.id);
      SA.evals = SA.evals.filter(e => e.athleteId !== athlete.id);
      SA.saveAthletes(); SA.saveEvals();
      // Only drop the ID photo once nobody else references it (team photos are shared).
      SAIDPhoto.retain(SA.athletes.map(a => a.idPhotoPath));
      toast(`${athlete.name} removed.`);
      renderAll();
      SA.broadcast("athletes");
    });
  }

  function renderStatusSummary(){
    const host = document.getElementById("statusSummary");
    if (!host) return;
    const counts = SA.statusCounts();
    host.innerHTML = SA.VERDICTS.map(status => `
      <div class="status-chip is-${SA.statusClass(status)}">
        <strong>${counts[status]}</strong>
        <span>${status}</span>
      </div>`).join("");
  }

  /* Status dropdown shown in each row. Saving here also updates the athlete's
     evaluation, so Tryout Evaluation and Final Selection stay in sync. */
  function statusSelectHtml(athlete){
    const current = SA.statusOf(athlete);
    return `<select class="status-select is-${SA.statusClass(current)}" data-id="${athlete.id}">
      ${SA.VERDICTS.map(v => `<option value="${v}" ${v === current ? "selected" : ""}>${v}</option>`).join("")}
    </select>`;
  }

  /* Student ID photo cell. The record only carries the reference, so the
     image is looked up in the photo store at render time. */
  function idPhotoCellHtml(athlete){
    if (!athlete.idPhotoPath || !SAIDPhoto.has(athlete.idPhotoPath)){
      return `<span class="id-none" title="No ID photo uploaded">&mdash;</span>`;
    }
    return `<button type="button" class="id-view-btn" data-photo="${escapeHtml(athlete.idPhotoPath)}">View ID</button>`;
  }

  /* Same photo, rendered for the athlete detail modal. */
  function athleteIdPhotoHtml(athlete){
    const rec = athlete.idPhotoPath ? SAIDPhoto.get(athlete.idPhotoPath) : null;
    if (!rec){
      return `<p class="id-photo-empty">No ID photo was uploaded for this registration.</p>`;
    }
    return `
      <div class="id-photo-row">
        <img class="id-photo-thumb" src="${rec.dataUrl}" alt="Uploaded student ID photo">
        <div class="id-photo-info">
          <strong>${escapeHtml(rec.fileName || "student-id")}</strong>
          <span>${escapeHtml(SAIDPhoto.humanSize(rec.bytes))}</span>
          <button type="button" class="btn btn-secondary btn-sm" data-photo="${escapeHtml(athlete.idPhotoPath)}">View full size</button>
        </div>
      </div>`;
  }

  
  const addFieldError = (id, message) => {
    const box = document.getElementById(id + "Err");
    if (!box) return;
    box.textContent = message || "";
    box.hidden = !message;
    const input = document.getElementById(id);
    if (input) input.classList.toggle("error", !!message);
  };

  /* ============================================================
     CLEAR ALL STUDENTS (Part 1B) — guarded, backed up, scoped
     ============================================================ */
  function downloadAthletesCsv(list, filename){
    // SA.buildAthletesCsv() owns the CSV format; this only triggers the save.
    const blob = new Blob([SA.buildAthletesCsv(list)], { type:"text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function openClearAllModal(){
    const scope = document.getElementById("clearScope");
    const total = SA.athletes.length;
    if (!total){ toast("There are no students to clear."); return; }

    const sportName = id => SA.sportById(id)?.name || "this sport";

    openModal(`
      <div class="clear-warning">
        <span class="clear-warning-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
        </span>
        <div>
          <h3>Clear all students?</h3>
          <p id="clearMessage">This will permanently remove all ${total} registered students, their evaluation scores, and final selection results. This cannot be undone.</p>
        </div>
      </div>

      <div class="field">
        <label for="clearScope">Clear which students?</label>
        <select id="clearScope">
          <option value="">All sports &mdash; every student (${total})</option>
          ${SA.sports.map(s => {
            const n = SA.athletesFor(s.id).length;
            return `<option value="${s.id}" ${n ? "" : "disabled"}>${escapeHtml(s.name)} &mdash; ${n} student${n === 1 ? "" : "s"}</option>`;
          }).join("")}
        </select>
        <span class="field-hint">Sports, settings and admin accounts are never touched.</span>
      </div>

      <div class="clear-checks">
        <label class="clear-check" for="clearBackup">
          <input type="checkbox" id="clearBackup" checked>
          <span><b>Download a backup (CSV) first</b><br><span class="field-hint">Exports every student you are about to remove.</span></span>
        </label>
        <label class="clear-check" for="clearAck">
          <input type="checkbox" id="clearAck">
          <span>Type <b>CLEAR</b> below to enable the confirm button.</span>
        </label>
      </div>

      <div class="field">
        <label for="clearConfirm">Type CLEAR to confirm</label>
        <input id="clearConfirm" class="clear-confirm-input" type="text" autocomplete="off" placeholder="CLEAR" disabled>
        <p class="field-error" id="clearConfirmErr" hidden>Type CLEAR exactly to continue.</p>
      </div>

      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" id="clearCancel">Cancel</button>
        <button type="button" class="btn btn-danger-solid" id="clearGo" disabled>Yes, clear all</button>
      </div>
    `);

    const sel      = document.getElementById("clearScope");
    const ack      = document.getElementById("clearAck");
    const confirm_ = document.getElementById("clearConfirm");
    const go       = document.getElementById("clearGo");
    const message  = document.getElementById("clearMessage");

    const scoped = () => sel.value ? SA.athletesFor(sel.value) : SA.athletes;

    function refresh(){
      const list = scoped();
      const n = list.length;
      message.textContent = sel.value
        ? `This will permanently remove ${n} student${n === 1 ? "" : "s"} from ${sportName(sel.value)}, their evaluation scores, and final selection results. This cannot be undone.`
        : `This will permanently remove all ${n} registered students, their evaluation scores, and final selection results. This cannot be undone.`;

      confirm_.disabled = !ack.checked;
      const typed = confirm_.value.trim().toUpperCase();
      go.disabled = !(ack.checked && typed === "CLEAR" && n > 0);
      go.textContent = sel.value ? `Yes, clear ${n}` : "Yes, clear all";
    }

    sel.addEventListener("change", refresh);
    ack.addEventListener("change", refresh);
    confirm_.addEventListener("input", refresh);
    refresh();

    document.getElementById("clearCancel").onclick = closeModal;
    go.onclick = () => {
      const list = scoped();
      if (!list.length) return;

      if (document.getElementById("clearBackup").checked){
        const stamp = new Date().toISOString().slice(0, 10);
        downloadAthletesCsv(list, `smartathlete-students-backup-${sel.value ? sportName(sel.value).replace(/\W+/g,"-").toLowerCase() : "all-sports"}-${stamp}.csv`);
      }

      // Athletes plus the evaluations and selection verdicts that belong to them.
      const ids = new Set(list.map(a => a.id));
      SA.athletes = SA.athletes.filter(a => !ids.has(a.id));
      SA.evals    = SA.evals.filter(ev => !ids.has(ev.athleteId));
      SA.saveAthletes();
      SA.saveEvals();
      // Free the storage the cleared photos were using, but keep any photo a
      // surviving athlete still points at.
      const pruned = SAIDPhoto.retain(SA.athletes.map(a => a.idPhotoPath));

      closeModal();
      toast(pruned ? `All students cleared \u00b7 ${pruned} ID photo${pruned === 1 ? "" : "s"} removed` : "All students cleared");
      renderAll();
      SA.broadcast("athletes");
      syncClearButton();
    };
  }

  /* Disabled when there is nothing to clear. */
  function syncClearButton(){
    const btn = document.getElementById("btnClearAllStudents");
    if (!btn) return;
    const n = SA.athletes.length;
    btn.disabled = n === 0;
    btn.title = n === 0 ? "There are no students to clear." : `Remove all ${n} registered students`;
  }

  document.getElementById("btnClearAllStudents").onclick = openClearAllModal;

  function renderAthletes(){
    const tbody = document.querySelector("#athleteTable tbody");
    const search = document.getElementById("athleteSearch").value.trim().toLowerCase();
    const sportFilter = document.getElementById("athleteSportFilter").value;
    const statusFilter = document.getElementById("athleteStatusFilter").value;
    const digitsSearch = SA.normalizeStudentId(search);

    const filtered = SA.athletes.filter(a => {
      const matchesSearch = !search ||
        (a.name || "").toLowerCase().includes(search) ||
        (a.studentId || "").includes(digitsSearch) ||
        (a.facebook || "").toLowerCase().includes(search);
      const matchesSport = !sportFilter || a.sportId === sportFilter;
      const matchesStatus = !statusFilter || SA.statusOf(a) === statusFilter;
      return matchesSearch && matchesSport && matchesStatus;
    });

    renderStatusSummary();
    syncClearButton();
    document.getElementById("athleteEmpty").style.display = filtered.length ? "none" : "block";

    // Grouped by sport (groups A-Z by sport name), athletes A-Z by surname.
    const groups = SA.groupBySport(filtered);

    tbody.innerHTML = groups.map(group => `
      <tr class="sport-group-row">
        <th colspan="9">${escapeHtml(group.sport.name)}<span class="group-count">${group.athletes.length}</span></th>
      </tr>
      ${group.athletes.map(a => `
      <tr data-id="${a.id}">
        <td class="name-cell"><strong>${escapeHtml(a.name)}</strong><span>${escapeHtml(a.studentId)}</span></td>
        <td>${escapeHtml(a.sportName || group.sport.name)}</td>
        <td>${escapeHtml(a.course || "\u2014")} \u00b7 ${escapeHtml(a.yearLevel || "\u2014")}</td>
        <td>${escapeHtml(a.department || "Unassigned")}</td>
        <td>${escapeHtml(a.contact || "\u2014")}</td>
        <td class="fb-cell">${SA.facebookCell(a.facebook)}</td>
        <td class="status-cell">${statusSelectHtml(a)}</td>
        <td class="id-cell">${idPhotoCellHtml(a)}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-ghost btn-sm" data-act="edit">Edit</button>
            <button class="btn btn-danger btn-sm" data-act="delete">Delete</button>
          </div>
        </td>
      </tr>`).join("")}
    `).join("");

    tbody.querySelectorAll("tr[data-id]").forEach(row => {
      const athlete = SA.athleteById(row.dataset.id);
      row.querySelector('[data-act="edit"]').onclick = () => openAthleteModal(athlete);
      row.querySelector('[data-act="delete"]').onclick = () => deleteAthlete(athlete);

      const idBtn = row.querySelector("[data-photo]");
      if (idBtn) idBtn.onclick = () => SAIDPhoto.openViewer(idBtn.dataset.photo);

      const select = row.querySelector(".status-select");
      if (select){
        select.addEventListener("change", () => {
          if (!SA.setStatus(athlete.id, select.value, { isAdminAction: true, selectedBy: "Admin" })) return;
          select.className = `status-select is-${SA.statusClass(select.value)}`;
          toast(`${athlete.name} \u2014 ${select.value} saved.`);
          // Re-render so the summary counts and status filter stay accurate.
          renderAthletes();
          if (currentView === "dashboard") renderDashboard();
          if (currentView === "selection") renderSelectionBoard();
        });
      }
    });
  }

  document.getElementById("athleteSearch").addEventListener("input", renderAthletes);
  document.getElementById("athleteSportFilter").addEventListener("change", renderAthletes);
  document.getElementById("athleteStatusFilter").addEventListener("change", renderAthletes);

  /* ============================================================
     TRYOUT EVALUATIONS — Create / Update / Delete
     ============================================================ */
  function athleteOptionsHtml(selectedId, pool){
    return (pool || SA.athletes).map(a => {
      const sport = SA.sportById(a.sportId);
      return `<option value="${a.id}" data-sport="${a.sportId}" ${a.id===selectedId?"selected":""}>${escapeHtml(a.name)} \u2014 ${sport ? escapeHtml(sport.name) : "no sport"}</option>`;
    }).join("");
  }

  function openEvalModal(ev){
    const isEdit = !!ev;
    if (!SA.athletes.length){ toast("Register an athlete before scoring them."); return; }

    // For a NEW evaluation, only offer athletes who don't already have one —
    // picking an already-scored athlete and hitting Save would otherwise look
    // like the button does nothing.
    const evaluatedIds = new Set(SA.evals.map(e => e.athleteId));
    const pool = isEdit ? SA.athletes : SA.athletes.filter(a => !evaluatedIds.has(a.id));

    if (!isEdit && !pool.length){
      toast("Every registered athlete already has an evaluation. Edit an existing one instead.");
      return;
    }

    openModal(`
      <h2>${isEdit ? "Edit Evaluation" : "Score an Athlete"}</h2>
      <p class="modal-sub">Each criterion is scored out of 25. The total decides the tryout rating.</p>
      <div class="field">
        <label for="fEAthlete">Athlete</label>
        <select id="fEAthlete">${athleteOptionsHtml(isEdit ? ev.athleteId : "", pool)}</select>
      </div>
      <div class="score-grid">
        <div class="field">
          <label for="fSkill">Skill (0&ndash;25)</label>
          <input id="fSkill" type="number" min="0" max="25" value="${isEdit ? ev.skill : 0}">
        </div>
        <div class="field">
          <label for="fFitness">Physical Fitness (0&ndash;25)</label>
          <input id="fFitness" type="number" min="0" max="25" value="${isEdit ? ev.fitness : 0}">
        </div>
        <div class="field">
          <label for="fGamesense">Game Sense (0&ndash;25)</label>
          <input id="fGamesense" type="number" min="0" max="25" value="${isEdit ? ev.gamesense : 0}">
        </div>
        <div class="field">
          <label for="fDiscipline">Discipline (0&ndash;25)</label>
          <input id="fDiscipline" type="number" min="0" max="25" value="${isEdit ? ev.discipline : 0}">
        </div>
      </div>
      <div class="score-total-preview" id="totalPreview">Total: 0 / 100</div>
      <div class="field" style="margin-top:15px;">
        <label id="fEVerdictLabel">Verdict</label>
        <div class="verdict-segments" id="fEVerdict" role="group" aria-labelledby="fEVerdictLabel">
          ${SA.VERDICTS.map(v => {
            const meta = VERDICT_META[v] || { cls:"pending" };
            return `<button type="button" class="vseg ${meta.cls}" data-verdict="${v}" aria-pressed="false">${v}</button>`;
          }).join("")}
        </div>
        <span class="field-hint" id="fEVerdictHint">Follows your skill band automatically. Choosing one yourself marks it as a manual decision.</span>
      </div>
      <div class="field" style="margin-top:15px;">
        <label for="fRemarks">Coach's remarks</label>
        <textarea id="fRemarks" placeholder="Optional notes for the selection committee">${isEdit ? escapeHtml(ev.remarks || "") : ""}</textarea>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" id="eCancel">Cancel</button>
        <button type="button" class="btn btn-gold" id="eSave">${isEdit ? "Save changes" : "Save evaluation"}</button>
      </div>
    `);

    const scoreIds = ["fSkill","fFitness","fGamesense","fDiscipline"];
    const preview = document.getElementById("totalPreview");
    const verdictBox = document.getElementById("fEVerdict");
    const verdictHint = document.getElementById("fEVerdictHint");

    // null until the coach touches the segmented control; before that the
    // verdict follows the live score total.
    let chosenVerdict = isEdit ? SA.statusOf(SA.athleteById(ev.athleteId)) : null;

    function setVerdict(value, manual){
      chosenVerdict = value;
      verdictBox.querySelectorAll(".vseg").forEach(btn => {
        btn.setAttribute("aria-pressed", String(btn.dataset.verdict === value));
      });
      if (verdictHint){
        const band = SA.ratingLabel(currentTotal());
        verdictHint.textContent = manual
          ? `Set by hand to “${value}”. “Apply band verdicts” will leave this one alone.`
          : `From the skill band ${band}: ${value}. Choosing one yourself marks it as a manual decision.`;
      }
    }

    function currentTotal(){
      return scoreIds.reduce((sum,id) => sum + (parseInt(document.getElementById(id).value,10) || 0), 0);
    }

    function clampField(el){
      if (el.value === "") return;
      el.value = Math.min(25, Math.max(0, parseInt(el.value, 10) || 0));
    }

    function updatePreview(){
      const total = currentTotal();
      preview.textContent = `Total: ${total} / 100 \u2014 ${SA.ratingLabel(total)}`;
      // Follow the score until the coach makes a choice.
      if (!verdictBox.querySelector('.vseg[aria-pressed="true"][data-manual="1"]')){
        setVerdict(SA.suggestedVerdict(total), false);
      }
    }

    scoreIds.forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener("input", updatePreview);
      el.addEventListener("blur", () => { clampField(el); updatePreview(); });
    });

    verdictBox.querySelectorAll(".vseg").forEach(btn => {
      btn.addEventListener("click", () => {
        btn.dataset.manual = "1";
        setVerdict(btn.dataset.verdict, true);
      });
    });

    updatePreview();

    document.getElementById("eCancel").onclick = closeModal;
    document.getElementById("eSave").onclick = () => {
      const athleteId = document.getElementById("fEAthlete").value;
      const athlete = SA.athleteById(athleteId);
      const skill = Math.min(25, Math.max(0, parseInt(document.getElementById("fSkill").value,10) || 0));
      const fitness = Math.min(25, Math.max(0, parseInt(document.getElementById("fFitness").value,10) || 0));
      const gamesense = Math.min(25, Math.max(0, parseInt(document.getElementById("fGamesense").value,10) || 0));
      const discipline = Math.min(25, Math.max(0, parseInt(document.getElementById("fDiscipline").value,10) || 0));
      const total = skill + fitness + gamesense + discipline;
      const remarks = document.getElementById("fRemarks").value.trim();
      // chosenVerdict is null only if the coach never touched the control and
      // every score is 0 with no suggestion — fall back to the athlete's own.
      const verdict = chosenVerdict || SA.suggestedVerdict(total) || "Pending";
      const verdictIsManual = !!(verdictBox.querySelector('.vseg[data-manual="1"]'));

      if (isEdit){
        Object.assign(ev, { athleteId, sportId: athlete.sportId, skill, fitness, gamesense, discipline, total, remarks });
        // Only a verdict the coach actually touched counts as manual. A plain
        // score edit leaves it automatic, so the band keeps driving it.
        SA.setStatus(athlete.id, verdict);
        ev.verdictManual = verdictIsManual;
        SA.saveEvals();
        toast("Evaluation updated.");
      } else {
        const dupe = SA.evals.find(e => e.athleteId === athleteId);
        if (dupe){ toast("This athlete already has an evaluation \u2014 edit it instead."); return; }
        // A brand-new evaluation keeps whatever status the athlete already has;
        // the athlete record is the source of truth for status.
        SA.evals.push({
          id: uid("ev"), athleteId, sportId: athlete.sportId,
          skill, fitness, gamesense, discipline, total, remarks,
          selectionStatus: verdict,
          verdictManual: verdictIsManual,
          date: SA.todayStamp(),
        });
        SA.setStatus(athlete.id, verdict);
        toast(`${athlete.name} scored ${total}/100.`);
      }
      SA.saveEvals();
      closeModal();
      renderAll();
      SA.broadcast("verdicts");
    };
  }

  function deleteEval(ev){
    const athlete = SA.athleteById(ev.athleteId);
    openConfirm(`Delete the evaluation for ${athlete ? athlete.name : "this athlete"}?`, () => {
      SA.evals = SA.evals.filter(e => e.id !== ev.id);
      SA.saveEvals();
      toast("Evaluation deleted.");
      renderAll();
    });
  }

  /* ============================================================
     VERDICT SYSTEM (Part 3)
     ============================================================ */
  const VERDICT_META = {
    "Selected":     { cls:"selected",    icon:'<path d="M20 6 9 17l-5-5"/>' },
    "Pending":      { cls:"pending",     icon:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
    "Waitlisted":   { cls:"waitlisted",  icon:'<path d="M7 3h10"/><path d="M7 21h10"/><path d="M8 3v4l4 5 4-5V3"/><path d="M8 21v-4l4-5 4 5v4"/>' },
    "Not Selected": { cls:"notselected", icon:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>' },
  };

  let verdictFilter = "";   // "" = show every verdict

  function renderVerdictCards(){
    const host = document.getElementById("evalVerdictCards");
    if (!host) return;

    // Counted over the athletes that actually have an evaluation, so the
    // percentages always add up to the rows in the table below.
    const scored = SA.evals.map(ev => SA.athleteById(ev.athleteId)).filter(Boolean);
    const total = scored.length || 1;

    host.innerHTML = SA.VERDICTS.map(v => {
      const meta = VERDICT_META[v] || { cls:"pending", icon:"" };
      const count = scored.filter(a => SA.statusOf(a) === v).length;
      const pct = Math.round((count / total) * 100);
      return `
        <button type="button" class="vcard vcard-${meta.cls}" data-verdict="${v}"
                aria-pressed="${verdictFilter === v}"
                aria-label="${v}: ${count} of ${total}, ${pct} percent. Click to filter.">
          <span class="vcard-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${meta.icon}</svg>
          </span>
          <span class="vcard-text">
            <span class="vcard-count">${count}</span>
            <span class="vcard-label">${v}</span>
          </span>
          <span class="vcard-pct">${pct}%</span>
        </button>`;
    }).join("");

    host.querySelectorAll(".vcard").forEach(card => {
      card.onclick = () => {
        // Click again to clear the filter.
        verdictFilter = verdictFilter === card.dataset.verdict ? "" : card.dataset.verdict;
        const select = document.getElementById("evalVerdictFilter");
        if (select) select.value = verdictFilter;
        renderVerdictCards();
        renderEvals();
      };
    });

    const note = document.getElementById("verdictThresholdNote");
    if (note) renderVerdictThresholdNote();
  }

  /* The score bands, spelled out. Lives on Tryout Evaluation but is refreshed
     from the settings page too, so the two never disagree. */
  function renderVerdictThresholdNote(){
    const note = document.getElementById("verdictThresholdNote");
    if (!note) return;
    const t = SA.settings.verdictThresholds;
    note.innerHTML = `Current boundaries: <b>${t.selected}&ndash;100%</b> Selected as Player &middot; <b>${t.waitlisted}&ndash;${t.selected - 1}%</b> Need Improvement &middot; <b>${t.practice}&ndash;${t.waitlisted - 1}%</b> Need More Practice &middot; <b>0&ndash;${t.practice - 1}%</b> Not Being Selected.`;
  }

  /* Editable verdict: a pill that is really a dropdown, so it is keyboard
     accessible and saves the instant a choice is made. */
  function verdictCellHtml(athlete, ev){
    const current = SA.statusOf(athlete);
    const cls = VERDICT_META[current] ? VERDICT_META[current].cls : "pending";
    const suggested = SA.suggestedVerdict(ev ? ev.total : null);
    const manual = ev && ev.verdictManual;
    const hint = (!manual && suggested !== current)
      ? `<span class="suggested-hint">suggested ${escapeHtml(suggested)}</span>`
      : (manual ? `<span class="manual-mark">manual</span>` : "");
    return `<span class="verdict-cell">
      <select class="verdict-select ${cls}" data-verdict-for="${athlete.id}" aria-label="Verdict for ${escapeHtml(athlete.name)}">
        ${SA.VERDICTS.map(v => `<option value="${v}" ${v === current ? "selected" : ""}>${v}</option>`).join("")}
      </select>${hint}
    </span>`;
  }

  function wireVerdictSelects(root){
    root.querySelectorAll("[data-verdict-for]").forEach(sel => {
      sel.addEventListener("change", () => {
        const athlete = SA.athleteById(sel.dataset.verdictFor);
        if (!athlete) return;
        // A verdict a coach picks by hand is flagged, so "Apply band verdicts"
        // will never touch it later.
        SA.setStatusManual(athlete.id, sel.value);
        toast(`${athlete.name} — ${sel.value} saved.`);
        renderVerdictCards();
        renderEvals();
        if (currentView === "athletes") renderAthletes();
        if (currentView === "selection") renderSelectionBoard();
        if (currentView === "dashboard") renderDashboard();
        SA.broadcast("verdicts");
      });
    });
  }

  function renderEvals(){
    const tbody = document.querySelector("#evalTable tbody");
    const search = document.getElementById("evalSearch").value.trim().toLowerCase();
    const sportFilter = document.getElementById("evalSportFilter").value;

    // Resolve the matching athletes first, then group them A-Z by sport.
    const athletes = SA.evals
      .map(ev => SA.athleteById(ev.athleteId))
      .filter(Boolean)
      .filter(a => (!search || (a.name || "").toLowerCase().includes(search)) &&
                    (!sportFilter || a.sportId === sportFilter) &&
                    (!verdictFilter || SA.statusOf(a) === verdictFilter));

    document.getElementById("evalEmpty").style.display = athletes.length ? "none" : "block";

    const groups = SA.groupBySport(athletes);
    tbody.innerHTML = groups.map(group => `
      <tr class="sport-group-row"><th colspan="9">${escapeHtml(group.sport.name)}<span class="group-count">${group.athletes.length}</span></th></tr>
      ${group.athletes.map(a => {
        const ev = SA.evals.find(e => e.athleteId === a.id);
        if (!ev) return "";
        return `
      <tr data-id="${ev.id}">
        <td class="name-cell"><strong>${escapeHtml(a.name)}</strong><span>${escapeHtml(a.studentId)}</span></td>
        <td>${escapeHtml(a.sportName || group.sport.name)}</td>
        <td class="num">${ev.skill}</td>
        <td class="num">${ev.fitness}</td>
        <td class="num">${ev.gamesense}</td>
        <td class="num">${ev.discipline}</td>
        <td class="num"><strong>${ev.total}</strong></td>
        <td>${verdictCellHtml(a, ev)}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-ghost btn-sm" data-act="edit">Edit</button>
            <button class="btn btn-danger btn-sm" data-act="delete">Delete</button>
          </div>
        </td>
      </tr>`;
      }).join("")}
    `).join("");

    tbody.querySelectorAll("tr[data-id]").forEach(row => {
      const ev = SA.evals.find(e => e.id === row.dataset.id);
      if (!ev) return;
      row.querySelector('[data-act="edit"]').onclick = () => openEvalModal(ev);
      row.querySelector('[data-act="delete"]').onclick = () => deleteEval(ev);
    });

    wireVerdictSelects(tbody);
    syncApplyButton();
  }

  function syncApplyButton(){
    const btn = document.getElementById("btnApplySuggested");
    if (!btn) return;
    const { safe } = SA.verdictChanges();
    btn.disabled = safe.length === 0;
    btn.textContent = safe.length ? `Apply ${safe.length} band verdict${safe.length === 1 ? "" : "s"}` : "Apply band verdicts";
    btn.title = safe.length
      ? "Sets each verdict from its skill band. Athletes whose verdict you set by hand are left alone."
      : "Every verdict already matches its skill band.";
  }

  document.getElementById("btnApplySuggested").onclick = () => {
    const { safe, manual } = SA.verdictChanges();
    if (!safe.length){ toast("Every verdict already matches its skill band."); return; }

    const lines = safe.map(c => `<li><b>${escapeHtml(c.athlete.name)}</b> — ${escapeHtml(SA.statusOf(c.athlete))} &rarr; ${escapeHtml(c.suggested)} <span class="field-hint">(${escapeHtml(SA.ratingLabel(c.eval.total))}, ${c.eval.total}/100)</span></li>`).join("");
    const keepNote = manual.length
      ? `<p class="field-hint" style="margin-top:16px;"><b>${manual.length}</b> verdict${manual.length === 1 ? "" : "s"} set by hand will be left alone.</p>`
      : "";

    openModal(`
      <h2>Apply skill band verdicts?</h2>
      <p class="modal-sub">${escapeHtml(SA.skillBands().map(b => `${b.min}–${b.max}% ${b.label} → ${b.verdict}`).join(" · "))}</p>
      <ul class="confirm-list" style="margin-bottom:16px;">${lines}</ul>
      ${keepNote}
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" id="apCancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="apGo">Apply ${safe.length} change${safe.length === 1 ? "" : "s"}</button>
      </div>
    `);

    document.getElementById("apCancel").onclick = closeModal;
    document.getElementById("apGo").onclick = () => {
      safe.forEach(c => { SA.setStatus(c.athlete.id, c.suggested); });
      closeModal();
      toast(`${safe.length} verdict${safe.length === 1 ? "" : "s"} updated.`);
      renderVerdictCards();
      renderEvals();
      if (currentView === "athletes") renderAthletes();
      if (currentView === "selection") renderSelectionBoard();
      if (currentView === "dashboard") renderDashboard();
      SA.broadcast("verdicts");
    };
  };

  document.getElementById("btnAddEval").onclick = () => openEvalModal(null);
  document.getElementById("evalSearch").addEventListener("input", renderEvals);
  document.getElementById("evalSportFilter").addEventListener("change", renderEvals);
  document.getElementById("evalVerdictFilter").addEventListener("change", event => {
    verdictFilter = event.target.value;
    renderVerdictCards();
    renderEvals();
  });

  /* ============================================================
     FINAL SELECTION BOARD
     ============================================================ */
  /* Verdict dropdowns on the selection board. Shared by the single-sport and
     all-sports views. Writes through the athlete record so the Athletes page,
     Tryout Evaluation and the dashboard all agree immediately. */
  function wireSelectionVerdicts(root){
    root.querySelectorAll(".select-actions select").forEach(sel => {
      sel.addEventListener("change", () => {
        const athlete = SA.athleteById(sel.dataset.athlete);
        if (!athlete || !SA.setStatus(athlete.id, sel.value)) return;
        toast(`${athlete.name} — ${sel.value} saved.`);
        renderSelectionBoard();
        if (currentView === "dashboard") renderDashboard();
        if (currentView === "athletes") renderAthletes();
      });
    });
  }

  /* "All sports" (the default): one ranked list across every sport, so the
     coach can see the whole season at a glance and still pick a single sport
     from the dropdown above. */
  function renderAllSportsBoard(board){
    const rows = SA.evals
      .map(ev => ({ ev, athlete: SA.athleteById(ev.athleteId) }))
      .filter(row => row.athlete)
      .sort((a, b) => b.ev.total - a.ev.total || SA.compareByName(a.athlete, b.athlete));

    const selectedCount   = rows.filter(r => SA.statusOf(r.athlete) === "Selected").length;
    const waitlistedCount = rows.filter(r => SA.statusOf(r.athlete) === "Waitlisted").length;
    const registeredCount = SA.athletes.length;

    if (!rows.length){
      board.innerHTML = `
        <div class="summary-row">
          <div class="summary-chip"><strong>${SA.activeSports().length}</strong>active sports</div>
          <div class="summary-chip"><strong>${registeredCount}</strong>registered</div>
          <div class="summary-chip"><strong>0</strong>evaluated</div>
        </div>
        <p class="empty-note">No evaluations logged yet. Score athletes under Tryout Evaluation first, or pick a single sport above to review just that roster.</p>`;
      return;
    }

    const generalLine = SA.scheduleSummary(SA.scheduleFor(null));

    board.innerHTML = `
      <div class="summary-row">
        <div class="summary-chip"><strong>${selectedCount}</strong>currently selected</div>
        <div class="summary-chip"><strong>${waitlistedCount}</strong>waitlisted</div>
        <div class="summary-chip"><strong>${rows.length}</strong>total evaluated</div>
        <div class="summary-chip"><strong>${registeredCount}</strong>registered</div>
      </div>
      ${generalLine ? `<p class="selection-schedule">All sports — ${escapeHtml(generalLine)}</p>` : ""}
      <p class="selection-note">Every evaluated athlete, highest score first. Choose a single sport above to review just that roster.</p>
      <div class="table-wrap table-scroll">
        <table class="data-table rank-table">
          <thead>
            <tr><th>Athlete</th><th>Sport</th><th>Student number</th><th>Skill Percent</th><th>Skill Band</th><th>Verdict</th></tr>
          </thead>
          <tbody>
            ${rows.map(({ ev, athlete }) => {
              const current = SA.statusOf(athlete);
              const sportName = athlete.sportName || SA.sportById(athlete.sportId)?.name || "\u2014";
              return `
              <tr data-id="${ev.id}">
                <td class="name-cell"><strong>${escapeHtml(athlete.name)}</strong></td>
                <td>${escapeHtml(sportName)}</td>
                <td>${escapeHtml(athlete.studentId)}</td>
                <td class="num"><strong>${SA.skillPercent(ev.total)}</strong>%</td>
                <td class="skill-band" title="Band ${escapeHtml(SA.ratingRange(ev.total))}">${escapeHtml(SA.ratingLabel(ev.total))}</td>
                <td class="select-actions">
                  <select class="status-select is-${SA.statusClass(current)}" data-athlete="${athlete.id}"
                          aria-label="Verdict for ${escapeHtml(athlete.name)}">
                    ${SA.VERDICTS.map(v => `<option value="${v}" ${v===current?"selected":""}>${v}</option>`).join("")}
                  </select>
                </td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>


    wireSelectionVerdicts(board);
  }

  function renderSelectionBoard(){
    const board = document.getElementById("selectionBoard");
    const sportId = document.getElementById("selectionSportFilter").value;

    // No sport picked = "All sports", which is the default view now.
    if (!sportId){
      renderAllSportsBoard(board);
      return;
    }
    const sport = SA.sportById(sportId);
    // Scored athletes for this sport, listed A-Z by surname like every other
    // athlete list in the app.
    const scored = SA.sortByName(SA.evals.filter(e => e.sportId === sportId)
      .map(ev => ({ ev, athlete: SA.athleteById(ev.athleteId) }))
      .filter(row => row.athlete)
      .sort((a, b) => b.ev.total - a.ev.total));

    const list = scored.map(row => row.ev);
    const statusOf = ev => SA.statusOf(SA.athleteById(ev.athleteId));
    const selectedCount = list.filter(ev => statusOf(ev) === "Selected").length;
    const waitlistedCount = list.filter(ev => statusOf(ev) === "Waitlisted").length;
    const registeredCount = SA.athletesFor(sportId).length;
    const selectionSchedule = SA.scheduleLine(SA.scheduleFor(sportId), sport.name);

    if (!list.length){
      board.innerHTML = `
        <div class="summary-row">
          <div class="summary-chip"><strong>${registeredCount}</strong>registered</div>
        </div>
        ${selectionSchedule ? `<p class="selection-schedule">Tryout \u2014 ${escapeHtml(selectionSchedule)}</p>` : ""}
        <p class="empty-note">No evaluations logged for ${escapeHtml(sport.name)} yet. Score athletes under Tryout Evaluation first.</p>`;
      return;
    }

    board.innerHTML = `
      <div class="summary-row">
        <div class="summary-chip"><strong>${selectedCount}</strong>currently selected</div>
        <div class="summary-chip"><strong>${waitlistedCount}</strong>waitlisted</div>
        <div class="summary-chip"><strong>${list.length}</strong>total evaluated</div>
        <div class="summary-chip"><strong>${registeredCount}</strong>registered</div>
      </div>
      ${selectionSchedule ? `<p class="selection-schedule">Tryout \u2014 ${escapeHtml(selectionSchedule)}</p>` : ""}
      <div class="table-wrap table-scroll">
        <table class="data-table rank-table">
          <thead>
            <tr><th>Athlete</th><th>Student number</th><th>Skill Percent</th><th>Skill Band</th><th>Remarks</th><th>Verdict</th></tr>
          </thead>
          <tbody>
            ${list.map(ev => {
              const athlete = SA.athleteById(ev.athleteId);
              const current = SA.statusOf(athlete);
              return `
              <tr data-id="${ev.id}">
                <td class="name-cell"><strong>${escapeHtml(athlete.name)}</strong></td>
                <td>${escapeHtml(athlete.studentId)}</td>
                <td class="num"><strong>${SA.skillPercent(ev.total)}</strong>%</td>
                <td class="skill-band" title="Band ${escapeHtml(SA.ratingRange(ev.total))}">${escapeHtml(SA.ratingLabel(ev.total))}</td>
                <td>${escapeHtml(ev.remarks || "\u2014")}</td>
                <td class="select-actions">
                  <select class="status-select is-${SA.statusClass(current)}" data-athlete="${athlete.id}"
                          aria-label="Verdict for ${escapeHtml(athlete.name)}">
                    ${SA.VERDICTS.map(v => `<option value="${v}" ${v===current?"selected":""}>${v}</option>`).join("")}
                  </select>
                </td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>


    wireSelectionVerdicts(board);
  }

  document.getElementById("selectionSportFilter").addEventListener("change", renderSelectionBoard);
  /* "Publish results" — the only switch that lets students see anything other
     than Pending. Toggling it takes effect immediately on the student page. */
  function renderPublishToggle(){
    const toggle = document.getElementById("publishResults");
    if (toggle) toggle.checked = SA.resultsPublished();
    const hint = document.getElementById("publishHint");
    if (hint){
      hint.textContent = SA.resultsPublished()
        ? "Published. Students now see their real status — Selected, Waitlisted, or Not Selected — when they check their ID."
        : "While this is off, students checking their registration only ever see “Pending” — scores, verdicts, and remarks stay private.";
    }
  }

  document.getElementById("publishResults").addEventListener("change", event => {
    SA.settings.publishResults = event.target.checked;
    SA.settings.updatedAt = new Date().toISOString();
    SA.saveSettings();
    SA.broadcast("settings");
    renderPublishToggle();
    toast(event.target.checked ? "Results published to students." : "Results hidden — students only see Pending.");
  });

  /* ============================================================
     REGISTRATION STATUS + TRYOUT PANEL
     ============================================================ */
  function renderRegistrationStatus(){
    const status = SA.registrationStatus();

    // Only touch the DOM when the markup actually changed. The status tick runs
    // every 30s; blindly reassigning innerHTML repaints the banner every cycle
    // and makes the page look like it's flickering.
    setBanner("regStatus", status, "student");
    setBanner("settingsStatus", status, "admin");
  }

  function setBanner(id, status, variant){
    const host = document.getElementById(id);
    if (!host) return;
    const html = SA.registrationBannerHtml(status, variant);
    if (host.innerHTML !== html) host.innerHTML = html;
  }

  function renderTryoutPanel(){
    const host = document.getElementById("tryoutSchedule");
    if (!host) return;
    const general = SA.scheduleFor(null);
    // Every entry is labelled with its sport, including the general one.
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

    host.innerHTML = `<div class="schedule-main">${details || `<p class="empty-note">No tryout date has been published yet. Set it in Registration Settings.</p>`}</div>${overrideList}`;
  }

  /* ============================================================
     DASHBOARD
     ============================================================ */
  function renderDashboard(){
    const totalSports = SA.activeSports().length;
    const totalAthletes = SA.athletes.length;
    const totalEvaluated = SA.evals.length;
    const totalSelected = SA.athletes.filter(a => SA.statusOf(a) === "Selected").length;

    document.getElementById("scoreRow").innerHTML = `
      <div class="stat-tile"><div class="stat-num">${totalSports}</div><div class="stat-label">Active Sports</div></div>
      <div class="stat-tile alt"><div class="stat-num">${totalAthletes}</div><div class="stat-label">Registered Athletes</div></div>
      <div class="stat-tile alt"><div class="stat-num">${totalSelected}</div><div class="stat-label">Athletes Selected</div></div>



    const counts = SA.activeSports().map(s => ({ name: s.name, count: SA.athletesFor(s.id).length }))
      .sort((a,b) => b.count - a.count).slice(0, 8);
    const max = Math.max(1, ...counts.map(c => c.count));

    document.getElementById("perSportBars").innerHTML = counts.length ? counts.map(c => `
      <div class="bar-row">
        <span class="bar-label">${escapeHtml(c.name)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(c.count/max*100).toFixed(0)}%"></div></div>
        <span class="bar-count">${c.count}</span>
      </div>
    `).join("") : `<p class="empty-note">No sports yet \u2014 add one from the Sports Roster tab.</p>`;

    document.getElementById("outcomeBreakdown").innerHTML = SA.VERDICTS.map(v => `
      <div class="outcome-row ${SA.statusClass(v)}">
        <span>${v}</span>
        <strong>${SA.athletes.filter(a => SA.statusOf(a) === v).length}</strong>
      </div>
    `).join("");
    renderHomeRosters();
  }

  function renderHomeRosters(){
    const board = document.getElementById("sportRosterBoard");
    // Sports A-Z so the Home board matches the Athletes page grouping.
    const list = SA.activeSports().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity:"base" }));
    if (!list.length){
      board.innerHTML = `<p class="empty-note">No active sports are available for registration.</p>`;
      return;
    }
    board.innerHTML = list.map(sport => {
      const registered = SA.sortByName(SA.athletesFor(sport.id));
      const esports = sport.category === SA.ESPORTS;
      // Teams sorted by team name; players inside each team A-Z by surname.
      const teams = esports ? SA.sortTeamsForDisplay(registered) : [];
      const departmentGroups = SA.DEPARTMENTS.map(department => ({
        department,
        students: registered.filter(a => (a.department || "Unassigned") === department),
        teams: teams.filter(team => team.members.some(member => (member.department || "Unassigned") === department))
      })).filter(group => group.students.length || group.teams.length);
      const unassigned = registered.filter(a => !a.department);
      if (unassigned.length) departmentGroups.push({ department: "Unassigned", students: unassigned, teams: [] });
      const schedule = SA.scheduleLine(SA.scheduleFor(sport.id), sport.name);
      const countLabel = esports
        ? `${teams.length} team${teams.length === 1 ? "" : "s"}`
        : `${registered.length} registered`;
      const emptyLabel = esports ? "No teams registered yet." : "No students registered yet.";
      return `
        <article class="sport-roster-card" data-sport="${escapeHtml(sport.id)}">
          <header class="sc-head">
            <div class="sc-head-text">
              <span class="sc-cat">${escapeHtml(sport.category)}</span>
              <h3 class="sc-name">${escapeHtml(sport.name)}</h3>
            </div>
            <span class="sc-badge">
              <svg class="sc-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                ${esports
                  ? '<circle cx="9" cy="8" r="3.2"/><path d="M2.6 19c0-3 2.8-5.2 6.4-5.2 1 0 2 .2 2.8.5"/><path d="M16.4 13.2l4.6 2.6-4.6 2.6-4.6-2.6z"/>'
                  : '<circle cx="12" cy="8" r="3.4"/><path d="M4.6 20c0-3.8 3.3-6.4 7.4-6.4s7.4 2.6 7.4 6.4"/>'}
              </svg>
              ${escapeHtml(countLabel)}
            </span>
          </header>

          <div class="sc-art">${sportImageHtml(sport)}</div>

          <div class="sc-status${departmentGroups.length ? " is-filled" : ""}">
            ${departmentGroups.length ? `
              <div class="sc-roster">
                ${departmentGroups.map(group => `
                  <section class="department-group">
                    <h4>${escapeHtml(group.department)}</h4>
                    ${esports
                      ? group.teams.map(team => `<div class="roster-team"><strong>${escapeHtml(team.name)}</strong><span>${team.members.filter(m => (m.department || "Unassigned") === group.department).map(m => `<button type="button" class="sc-person-btn" data-athlete="${escapeHtml(m.id)}">${escapeHtml(m.name)}</button>`).join("")}</span></div>`).join("")
                      : group.students.map(a => `<div class="roster-person"><strong><button type="button" class="sc-person-btn" data-athlete="${escapeHtml(a.id)}">${escapeHtml(a.name)}</button></strong><span>${escapeHtml(a.course || "Student")} \u00b7 ${escapeHtml(a.yearLevel || "Year level not set")} \u00b7 ${escapeHtml(SA.statusOf(a))}</span></div>`).join("")}
                  </section>`).join("")}
              </div>`
            : `<p class="sc-empty">
                 <svg class="sc-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                   <circle cx="12" cy="8.4" r="3.4"/><path d="M4.8 19.6c0-3.6 3.2-6.2 7.2-6.2s7.2 2.6 7.2 6.2"/>
                 </svg>
                 <span>${escapeHtml(emptyLabel)}</span>
               </p>`}
            ${schedule ? `<p class="sc-tryout">Tryout &mdash; ${escapeHtml(schedule)}</p>` : ""}
          </div>
        </article>`;
    }).join("");

    // Each student name opens the full read-only record. Delegated so it keeps
    // working after the board re-renders on every sync tick.
    board.querySelectorAll(".sc-person-btn").forEach(btn => {
      btn.onclick = () => openStudentDetail(SA.athleteById(btn.dataset.athlete));
    });
  }

  /* ============================================================
     REGISTRATION SETTINGS PANEL
     ============================================================ */
  /* Which schedule is the form editing: "" = all sports (general), otherwise a
     specific sport id whose override is being set. */
  function currentScheduleTarget(){
    return document.getElementById("setScheduleSport").value || "";
  }

  /* Which schedule the form is editing: "" = the general one, otherwise a sport.
     NOTE: the general schedule is stored under tryoutDate/tryoutTime/... while a
     per-sport override uses date/time/... . Reading `source.date` for BOTH wiped
     the general tryout date every time the panel was rendered, and the "fill with
     today" fallback then made a later Save overwrite the real tryout date. */
  function fillScheduleFields(target){
    const source = target
      ? (SA.settings.sportOverrides[target] || {})
      : {
          date:  SA.settings.tryoutDate,
          time:  SA.settings.tryoutTime,
          venue: SA.settings.tryoutVenue,
          note:  SA.settings.tryoutNote,
        };
    document.getElementById("setTryoutDate").value  = source.date  || "";
    document.getElementById("setTryoutTime").value  = source.time  || "";
    document.getElementById("setTryoutVenue").value = source.venue || "";
    document.getElementById("setTryoutNote").value  = source.note  || "";
  }

  function renderSettingsPanel(){
    // Sport selector, "All sports" first.
    const picker = document.getElementById("setScheduleSport");
    const previous = picker.value;
    picker.innerHTML = `<option value="">All sports (general schedule)</option>` +
      SA.sports.map(s => `<option value="${s.id}">${escapeHtml(s.name)}${s.status === "retired" ? " (retired)" : ""}</option>`).join("");
    if ([...picker.options].some(o => o.value === previous)) picker.value = previous;

    document.getElementById("setOpenAt").value = SA.settings.openAt || "";
    document.getElementById("setCutoff").value = SA.settings.cutoffAt || "";
    document.getElementById("setManualClose").checked = !!SA.settings.manuallyClosed;
    document.getElementById("setThresholdSelected").value = SA.settings.verdictThresholds.selected;
    document.getElementById("setThresholdWaitlisted").value = SA.settings.verdictThresholds.waitlisted;
    document.getElementById("setThresholdPractice").value = SA.settings.verdictThresholds.practice;

    // The year is derived, so an empty date box is pre-filled with today rather
    // than making staff pick a year themselves.
    const target = currentScheduleTarget();
    if (target && !(SA.settings.sportOverrides[target] || {}).date){
      document.getElementById("setTryoutDate").value = SA.defaultTryoutDate();
    } else if (!target && !SA.settings.tryoutDate){
      document.getElementById("setTryoutDate").value = SA.defaultTryoutDate();
    } else {
      fillScheduleFields(target);
    }
    if (!document.getElementById("setTryoutDate").value){
      document.getElementById("setTryoutDate").value = SA.defaultTryoutDate();
    }

    updateScheduleSportHint();
    renderPerSportSchedule();
    renderVerdictThresholdNote();
    settingsDirty = false;
    renderSettingsPreview();
    renderSettingsStatusChip();
    renderPublishScheduleSection();
  }

  function updateScheduleSportHint(){
    const target = currentScheduleTarget();
    const hint = document.getElementById("setScheduleSportHint");
    const name = target ? SA.sportById(target)?.name : "";
    hint.textContent = target
      ? `Editing the schedule for ${name}. Blank fields still fall back to the general schedule.`
      : "This is the fallback schedule used when a sport has no override below.";
  }

  document.getElementById("setScheduleSport").addEventListener("change", () => {
    const target = currentScheduleTarget();
    if (target){
      fillScheduleFields(target);
      if (!document.getElementById("setTryoutDate").value){
        document.getElementById("setTryoutDate").value = SA.defaultTryoutDate();
      }
    }
    updateScheduleSportHint();
  });

  function renderPerSportSchedule(){
    const host = document.getElementById("perSportSchedule");
    if (!host) return;
    if (!SA.sports.length){
      host.innerHTML = `<p class="empty-note">Add a sport first to give it its own tryout schedule.</p>`;
      return;
    }
    const head = `
      <div class="ov-row ov-head">
        <span>Sport</span><span>Date</span><span>Time</span><span>Venue</span><span>Note</span><span></span>
      </div>`;
    // Sports A-Z so the list matches every other sport-ordered view.
    host.innerHTML = head + SA.sports
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity:"base" }))
      .map(s => {
      const o = SA.settings.sportOverrides[s.id] || {};
      return `
      <div class="ov-row" data-override-sport="${s.id}">
        <div class="ov-sport">
          <strong>${escapeHtml(s.name)}</strong>
          <span>${escapeHtml(s.category)}${s.status === "retired" ? " \u00b7 Retired" : ""}</span>
        </div>
        <input type="date" data-ov-date value="${escapeHtml(o.date || "")}" aria-label="Tryout date for ${escapeHtml(s.name)}">
        <input type="time" data-ov-time value="${escapeHtml(o.time || "")}" aria-label="Tryout time for ${escapeHtml(s.name)}">
        <input type="text" data-ov-venue value="${escapeHtml(o.venue || "")}" placeholder="General venue" aria-label="Venue for ${escapeHtml(s.name)}">
        <input type="text" data-ov-note value="${escapeHtml(o.note || "")}" placeholder="General note" aria-label="Note for ${escapeHtml(s.name)}">
        <button type="button" class="btn btn-ghost btn-sm" data-act="clear">Clear</button>
      </div>`;
    }).join("");

    host.querySelectorAll('.ov-row[data-override-sport] [data-act="clear"]').forEach(btn => {
      btn.onclick = () => btn.closest(".ov-row").querySelectorAll("input").forEach(input => { input.value = ""; });
    });
  }

  /* ============================================================
     PUBLISH TRYOUT SCHEDULE
     ============================================================ */
  function renderPublishScheduleSection(){
    const sportSelect = document.getElementById("setScheduleSport");
    const dateInput = document.getElementById("setTryoutDate");
    const timeInput = document.getElementById("setTryoutTime");
    const venueInput = document.getElementById("setTryoutVenue");
    const noteInput = document.getElementById("setTryoutNote");
    const summaryEl = document.getElementById("publishSummary");
    const countEl = document.getElementById("publishStudentCount");
    const publishBtn = document.getElementById("btnPublishSchedule");

    if (!sportSelect || !dateInput || !timeInput || !venueInput || !noteInput || !summaryEl || !countEl || !publishBtn) return;

    // Populate sport selector with active sports
    const previous = sportSelect.value;
    sportSelect.innerHTML = `<option value="">Select a sport...</option>` +
      SA.activeSports().map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
    if (SA.activeSports().some(s => s.id === previous)) sportSelect.value = previous;

    function updatePublishSection(){
      const sportId = sportSelect.value;
      if (!sportId){
        dateInput.value = "";
        timeInput.value = "";
        venueInput.value = "";
        noteInput.value = "";
        summaryEl.hidden = true;
        publishBtn.disabled = true;
        return;
      }

      const sport = SA.sportById(sportId);
      const count = SA.athletesFor(sportId).length;
      const override = SA.settings.sportOverrides[sportId] || {};

      // Pre-fill with existing override or general schedule
      const source = override.date ? override : {
        date: SA.settings.tryoutDate,
        time: SA.settings.tryoutTime,
        venue: SA.settings.tryoutVenue,
        note: SA.settings.tryoutNote,
      };
      dateInput.value = source.date || "";
      timeInput.value = source.time || "";
      venueInput.value = source.venue || "";
      noteInput.value = source.note || "";

      document.getElementById("publishStudentCount").textContent = count;
      summaryEl.hidden = false;
      publishBtn.disabled = false;
    }

    sportSelect.addEventListener("change", updatePublishSection);
    updatePublishSection();

    // Handle publish button
    publishBtn.onclick = async () => {
      const sportId = sportSelect.value;
      if (!sportId){
        toast("Please select a sport.", "error");
        return;
      }

      const scheduleData = {
        date: dateInput.value.trim(),
        time: timeInput.value.trim(),
        venue: venueInput.value.trim(),
        note: noteInput.value.trim(),
      };

      // Validation
      if (!scheduleData.date) { toast("Tryout date is required.", "error"); return; }
      if (!scheduleData.time) { toast("Tryout time is required.", "error"); return; }
      if (!scheduleData.venue) { toast("Venue is required.", "error"); return; }

      const tryoutMoment = SA.tryoutMoment(scheduleData.date, scheduleData.time);
      if (!tryoutMoment) { toast("Invalid date/time format.", "error"); return; }

      const cutoffAt = SA.parseDate(SA.settings.cutoffAt);
      if (cutoffAt && tryoutMoment <= cutoffAt){
        toast(`Tryout must be after the registration cutoff (${SA.fmtDateTime(cutoffAt)}).`, "error");
        return;
      }

      const sport = SA.sportById(sportId);
      if (!sport) { toast("Selected sport not found.", "error"); return; }

      // Confirmation
      const studentCount = SA.athletesFor(sportId).length;
      const confirmed = await new Promise(resolve => {
        openModal(`
          <h2>Update Registered Students?</h2>
          <p class="modal-sub">This will update the tryout information for all ${studentCount} student${studentCount === 1 ? "" : "s"} registered for ${escapeHtml(sport.name)}.</p>
          <div class="modal-foot">
            <button type="button" class="btn btn-ghost" id="pubCancel">Cancel</button>
            <button type="button" class="btn btn-primary" id="pubConfirm">Update Students</button>
          </div>
        `);
        document.getElementById("pubCancel").onclick = () => { closeModal(); resolve(false); };
        document.getElementById("pubConfirm").onclick = () => { closeModal(); resolve(true); };
      });
      if (!confirmed) return;

      // Publish using SA.publishSchedule
      const result = SA.publishSchedule(sportId, scheduleData, SA_AUTH.currentUser());
      if (result.ok){
        toast(result.message, "success");
        // Refresh the preview and other views
        renderSettingsPreview();
        renderSettingsPanel();
        SA.broadcast("schedule");
      } else {
        toast(result.message, "error");
      }
    };

    // Initial update
    updatePublishSection();
  }
  function collectSettingsFromForm(){
    const cutoffAt = document.getElementById("setCutoff").value.trim();
    const cutoff = SA.parseDate(cutoffAt);

    // Per-sport rows are the source for overrides; the general fields are routed
    // to either the general settings or the selected sport's override.
    const sportOverrides = {};
    document.querySelectorAll(".ov-row[data-override-sport]").forEach(row => {
      const entry = {
        date:  row.querySelector("[data-ov-date]").value.trim(),
        time:  row.querySelector("[data-ov-time]").value.trim(),
        venue: row.querySelector("[data-ov-venue]").value.trim(),
        note:  row.querySelector("[data-ov-note]").value.trim(),
      };
      if (Object.values(entry).some(Boolean)) sportOverrides[row.dataset.overrideSport] = entry;
    });

    const target = currentScheduleTarget();
    const scheduleFields = {
      date:  document.getElementById("setTryoutDate").value.trim(),
      time:  document.getElementById("setTryoutTime").value.trim(),
      venue: document.getElementById("setTryoutVenue").value.trim(),
      note:  document.getElementById("setTryoutNote").value.trim(),
    };
    if (target){
      if (Object.values(scheduleFields).some(Boolean)) sportOverrides[target] = scheduleFields;
      else delete sportOverrides[target];
    }

    // Tryouts must happen after athletes stop being able to register.
    const checks = [];
    if (!target){
      const when = SA.tryoutMoment(scheduleFields.date, scheduleFields.time);
      if (when) checks.push({ label:"The general tryout", when });
    }
    Object.keys(sportOverrides).forEach(id => {
      const entry = sportOverrides[id];
      const when = SA.tryoutMoment(entry.date, entry.time);
      if (when) checks.push({ label:`The ${SA.sportById(id)?.name || "sport"} tryout`, when });
    });
    if (cutoff){
      const clash = checks.find(check => check.when <= cutoff);
      if (clash){
        toast(`${clash.label} must be scheduled after the registration cutoff (${SA.fmtDateTime(cutoff)}).`);
        return null;
      }
    }

    return Object.assign({}, SA.settings, {
      openAt: document.getElementById("setOpenAt").value.trim(),
      cutoffAt,
      manuallyClosed: document.getElementById("setManualClose").checked,
      publishResults: SA.settings.publishResults,
      sportOverrides,
    }, target ? {} : {
      tryoutDate:  scheduleFields.date,
      tryoutTime:  scheduleFields.time,
      tryoutVenue: scheduleFields.venue,
      tryoutNote:  scheduleFields.note,
    });
  }

  /* ============================================================
     SETTINGS — LIVE PREVIEW, COUNTDOWN, AUTO-SAVE (Part 2)
     ============================================================ */
  /* True while the admin has unsaved edits in the settings form, so a
     background re-render (auto-save, another tab, a countdown tick) never
     overwrites what they are typing. */
  let settingsDirty = false;

  const SETTINGS_FIELD_IDS = ["setOpenAt","setCutoff","setManualClose","setScheduleSport","setTryoutDate","setTryoutTime","setTryoutVenue","setTryoutNote","setThresholdSelected","setThresholdWaitlisted","setThresholdPractice"];

  /* The three band boundaries, from the form or from saved settings. */
  function thresholdsFrom(source){
    const pick = (obj, key) => {
      if (!obj) return null;
      const el = document.getElementById("setThreshold" + key);
      const n = parseInt(el ? el.value : obj[key], 10);
      return isFinite(n) ? n : null;
    };
    const d = SA.DEFAULT_BANDS;
    const selected   = pick(source, "Selected");
    const waitlisted = pick(source, "Waitlisted");
    const practice   = pick(source, "Practice");
    return {
      selected:   selected   != null ? selected   : d.selected,
      waitlisted: waitlisted != null ? waitlisted : d.waitlisted,
      practice:   practice   != null ? practice   : d.practice,
    };
  }

  function setSaveStatus(text, kind){
    const el = document.getElementById("saveStatus");
    if (!el) return;
    el.textContent = text;
    el.className = "save-status" + (kind ? " is-" + kind : "");
  }

  /* Reads the *unsaved* form, so the preview moves as the admin types.
     collectSettingsFromForm() returns null while the draft breaks a rule
     (e.g. the tryout falls before the cutoff), so callers must cope. */
  function draftSettings(){
    const base = collectSettingsFromForm();
    if (!base) return null;
    base.verdictThresholds = thresholdsFrom(base.verdictThresholds);
    return base;
  }

  function renderSettingsPreview(){
    const bar = document.getElementById("previewBar");
    const state = document.getElementById("previewState");
    const body = document.getElementById("previewBody");
    if (!bar || !state || !body) return;

    const draft = draftSettings();
    if (!draft){
      // Mid-edit and not yet valid: flag it instead of throwing or lying.
      body.innerHTML = `<span class="preview-line preview-invalid">This draft is not valid yet &mdash; fix the highlighted field to refresh the preview.</span>`;
      return;
    }

    const openAt = SA.parseDate(draft.openAt);
    const cutoff = draft.cutoffAt ? SA.parseDate(draft.cutoffAt) : null;
    const now = new Date();
    const open = !draft.manuallyClosed && (!openAt || now >= openAt) && (!cutoff || now < cutoff);

    bar.classList.toggle("is-closed", !open);
    state.textContent = open ? "Registration open" : "Registration closed";

    // Read the schedule from the DRAFT, not from saved settings, so the preview
    // tracks what the admin is typing before they save.
    const target = currentScheduleTarget();
    const schedule = target
      ? (draft.sportOverrides[target] || {})
      : { date: draft.tryoutDate, time: draft.tryoutTime, venue: draft.tryoutVenue, note: draft.tryoutNote };

    const rows = [];
    if (schedule.date || schedule.time){
      rows.push(`<span class="preview-line"><strong>Tryout:</strong> ${escapeHtml(SA.fmtScheduleWhen(schedule.date, schedule.time) || "To be announced")}</span>`);
    }
    if (schedule.venue){
      rows.push(`<span class="preview-line"><strong>Venue:</strong> ${escapeHtml(schedule.venue)}</span>`);
    }
    if (schedule.note){
      rows.push(`<span class="preview-line">${escapeHtml(schedule.note)}</span>`);
    }
    if (cutoff){
      const ms = cutoff.getTime() - now.getTime();
      rows.push(`<span class="preview-line"><strong>${open ? "Closes in" : "Closed"}:</strong> ${escapeHtml(open ? SA.fmtCountdown(ms) : SA.fmtDateTime(cutoff))}</span>`);
    }

    body.innerHTML = (rows.length ? rows.join("") : `<span class="preview-line">No tryout date or venue published yet.</span>`)
      + `<span class="preview-cta${open ? "" : " is-closed"}">${open ? "Submit Registration" : "Registration Closed"}</span>`;
  }

  /* Green/red dot, ticking countdown and "Last updated". */
  function renderSettingsStatusChip(){
    const chip = document.getElementById("settingsLiveChip");
    const text = document.getElementById("settingsChipText");
    const cd = document.getElementById("settingsCountdown");
    const up = document.getElementById("settingsUpdatedAt");
    if (!chip) return;

    const status = SA.registrationStatus();
    chip.classList.toggle("is-open", status.open);
    chip.classList.toggle("is-closed", !status.open);
    text.textContent = status.open ? "Registration Open" : "Registration Closed";

    if (cd){
      const cutoff = status.cutoffAt;
      if (cutoff){
        const ms = cutoff.getTime() - Date.now();
        cd.textContent = status.open ? `Closes in ${SA.fmtCountdown(ms)}` : "Registration closed";
        cd.classList.toggle("is-closed", !status.open);
      } else {
        cd.textContent = status.open ? "No deadline set" : "Registration closed";
        cd.classList.toggle("is-closed", !status.open);
      }
    }

    if (up){
      up.textContent = SA.settings.updatedAt
        ? `Last updated: ${SA.fmtClockTime(SA.settings.updatedAt)}`
        : "Last updated: never";
    }
  }

  /* One-second tick: countdown + automatic flip to closed/open. */
  setInterval(() => {
    const before = SA.registrationStatus().code;
    renderSettingsStatusChip();
    if (before !== SA.registrationStatus().code){
      renderRegistrationStatus();
      renderAll();
    }
  }, 1000);

  let autoSaveTimer = null;
  function scheduleAutoSave(){
    if (!document.getElementById("setAutoSave").checked) return;
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => saveSettings(true), 700);
  }

  function saveSettings(silent){
    const opensAt = SA.parseDate(document.getElementById("setOpenAt").value.trim());
    const cutoff = SA.parseDate(document.getElementById("setCutoff").value.trim());
    if (opensAt && cutoff && cutoff <= opensAt){
      if (!silent) toast("The registration cutoff must come after the opening date.");
      setSaveStatus("Not saved — cutoff must be after opening", "error");
      return;
    }
    const draft = collectSettingsFromForm();
    if (!draft){
      setSaveStatus("Not saved — check the tryout date", "error");
      return;
    }
    draft.verdictThresholds = thresholdsFrom(SA.settings.verdictThresholds);
    draft.updatedAt = new Date().toISOString();

    setSaveStatus("Saving\u2026", "saving");
    try {
      SA.settings = draft;
      SA.saveSettings();
    } catch (e){
      setSaveStatus("Not saved \u2014 storage is full", "error");
      if (!silent) toast("Settings could not be saved: " + e.message);
      return;
    }

    // Tell every other open tab straight away.
    SA.broadcast("settings");

    setSaveStatus("All changes saved");
    settingsDirty = false;
    renderSettingsStatusChip();
    renderVerdictThresholdNote();
    renderRegistrationStatus();
    if (currentView === "tryouts"){ renderVerdictCards(); renderEvals(); }
    if (!silent){
      const target = currentScheduleTarget();
      toast(target ? `${SA.sportById(target)?.name || "Sport"} schedule saved.` : "Settings saved.");
    }
  }

  document.getElementById("setSave").onclick = () => saveSettings(false);

  document.getElementById("setCancel").onclick = () => {
    clearTimeout(autoSaveTimer);
    renderSettingsPanel();
    renderSettingsPreview();
    setSaveStatus("All changes saved");
    toast("Discarded unsaved changes.");
  };

  /* Every settings control refreshes the preview and, when the toggle is on,
     schedules a save. */
  SETTINGS_FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const handler = () => {
      settingsDirty = true;
      renderSettingsPreview();
      scheduleAutoSave();
    };
    el.addEventListener("input", handler);
    el.addEventListener("change", handler);
  });
  document.querySelectorAll("#perSportSchedule input").forEach(input => {
    input.addEventListener("input", () => {
      settingsDirty = true;
      renderSettingsPreview();
      scheduleAutoSave();
    });
  });

  document.getElementById("btnEditSettings").onclick = () => switchView("settings");

  /* ============================================================
     RENDER ALL + BOOT
     ============================================================ */
  function renderAll(){
    refreshSportFilterDropdowns();
    renderRegistrationStatus();
    syncClearButton();
    // The band-verdict count is derived from the data, not the visible view, so
    // refresh it here too — otherwise it looks stale from the other pages.
    syncApplyButton();
    if (currentView === "dashboard"){ renderDashboard(); renderTryoutPanel(); }
    if (currentView === "sports") renderSports();
    if (currentView === "athletes") renderAthletes();
    if (currentView === "tryouts"){ renderVerdictCards(); renderEvals(); }
    if (currentView === "selection"){ renderSelectionBoard(); renderPublishToggle(); }
    // Never repopulate the settings form while it holds unsaved edits.
    if (currentView === "settings"){
      if (!settingsDirty) renderSettingsPanel();
      renderSettingsPreview();
      renderSettingsStatusChip();
    }
  }

  /* Another tab (or the student page) changed something: pull it in. */
  SA.onSync(() => {
    SA.reload();
    if (currentView === "settings" && !settingsDirty) renderSettingsPanel();
    renderAll();
  });

  document.getElementById("sideUser").textContent = IS_DEMO
    ? `Signed in as ${SA_AUTH.currentUser()} (demo)`
    : `Signed in as ${SA_AUTH.currentUser()}`;
  document.getElementById("seasonLabel").textContent = SA.SEASON_LABEL;

  renderAll();

  /* Keep the countdown and the lock state honest without a full re-render.
     renderRegistrationStatus() skips DOM writes that wouldn't change anything,
     so this only repaints when the text or state genuinely differs. */
  setInterval(() => {
    const before = SA.registrationStatus().code;
    renderRegistrationStatus();
    if (currentView === "dashboard" && before !== SA.registrationStatus().code) renderAll();
  }, 30000);

})();

