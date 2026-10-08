/* ==========================================================
   SmartAthlete — Student ID photo upload (idphoto.js)

   Loaded by register.html (student) and admin.html (admin).

   Storage follows the existing project convention: localStorage
   in the live / demo namespaces, exactly like sa_athletes and
   sa_athletes' siblings in common.js. The athlete record only
   stores a short reference (idPhotoPath); the image bytes live in
   one shared store so a 6-player esports team never duplicates the
   same picture six times.

   This module owns its own UI and exposes a tiny API so
   register.js / admin.js stay almost untouched:

     SAIDPhoto.attach()                 wire the drop zone
     SAIDPhoto.validate()               { ok, message }
     SAIDPhoto.persist()                { ok, message, photoId }
     SAIDPhoto.recordExtra()            { idPhotoPath } for add*
     SAIDPhoto.setBusy(on, label)       submit-button spinner
     SAIDPhoto.setEnabled(on)           lock when registration closes
     SAIDPhoto.reset()                  clear the zone
     SAIDPhoto.has(id) / .get(id)       admin lookups
     SAIDPhoto.openViewer(id)           modal preview (admin + student)
   ========================================================== */

window.SAIDPhoto = (function(){
  "use strict";

  /* ---------------- limits ---------------- */
  const MAX_BYTES   = 5 * 1024 * 1024;   // 5 MB, checked on the ORIGINAL file
  const MAX_SIDE    = 1600;              // longest side after resize
  const TARGET_BYTES= 300 * 1024;        // aim well under this so localStorage survives
  const ACCEPT      = ["image/jpeg", "image/png", "image/webp"];
  const ACCEPT_ATTR = "image/png,image/jpeg,image/webp";

  const MSG_REQUIRED = "Please upload a photo of your student ID.";
  const MSG_TYPE     = "Only JPG, PNG, or WEBP images are allowed.";
  const MSG_SIZE     = "File is too large. Maximum size is 5 MB.";
  const MSG_READ     = "That file could not be read. Please choose another image.";
  const MSG_STORE    = "The photo could not be saved. Please remove it and try a smaller image.";

  /* Longest-side first, then lower quality. Stops as soon as we are
     small enough, so quality is only sacrificed when it has to be. */
  const QUALITY_STEPS = [
    { maxSide: MAX_SIDE, quality: 0.86 },
    { maxSide: MAX_SIDE, quality: 0.76 },
    { maxSide: 1280,     quality: 0.72 },
    { maxSide: 1100,     quality: 0.66 }
  ];

  /* ---------------- state ---------------- */
  const state = { record: null, busy: false, enabled: true };

  /* ---------------- dom (looked up lazily) ---------------- */
  function dom(){
    return {
      field:  document.getElementById("rIdPhotoField"),
      zone:   document.getElementById("rIdPhotoZone"),
      input:  document.getElementById("rIdPhoto"),
      empty:  document.getElementById("rIdZoneEmpty"),
      filled: document.getElementById("rIdZoneFilled"),
      thumb:  document.getElementById("rIdThumb"),
      name:   document.getElementById("rIdFileName"),
      size:   document.getElementById("rIdFileSize"),
      error:  document.getElementById("rIdPhotoError"),
      hint:   document.getElementById("rIdPhotoHint"),
      drop:   document.getElementById("rIdDropBtn"),
      replace:document.getElementById("rIdReplace"),
      remove: document.getElementById("rIdRemove"),
      submit: document.getElementById("regSubmit")
    };
  }

  /* ============================================================
     STORE — localStorage, live vs demo namespace
     ============================================================ */
  function storeKey(){
    const ns = (window.SA && SA.NAMESPACES) ? SA.NAMESPACES : null;
    const isDemo = !!(ns && SA.LS === ns.demo);
    return isDemo ? "smartathlete_demo_id_photos" : "sa_id_photos";
  }

  function readStore(){
    return SA.safeParse(localStorage.getItem(storeKey()), {});
  }

  function writeStore(all){
    try {
      localStorage.setItem(storeKey(), JSON.stringify(all));
      return { ok:true };
    } catch (e){
      // Almost always QuotaExceededError: localStorage is ~5 MB for the whole
      // origin, shared with sports + athletes + evals + settings.
      return { ok:false, message: MSG_STORE };
    }
  }

  function has(photoId){ return !!photoId && !!readStore()[photoId]; }
  function get(photoId){ return photoId ? (readStore()[photoId] || null) : null; }

  /* Drops one photo (used when its athlete is deleted). */
  function forget(photoId){
    if (!photoId) return false;
    const all = readStore();
    if (!all[photoId]) return false;
    delete all[photoId];
    return writeStore(all).ok;
  }

  /* Drops every photo nobody references any more. Called after a bulk clear:
     a team photo is shared by several members, so it must survive while any
     one of them is still registered. Without this the store slowly fills up
     with orphans and localStorage runs out. */
  function retain(idsToKeep){
    const keep = new Set((idsToKeep || []).filter(Boolean));
    const all = readStore();
    const keys = Object.keys(all);
    const doomed = keys.filter(id => !keep.has(id));
    if (!doomed.length) return 0;
    doomed.forEach(id => delete all[id]);
    writeStore(all);
    return doomed.length;
  }

  /* ============================================================
     FILE HELPERS
     ============================================================ */
  function humanSize(bytes){
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function dataUrlBytes(dataUrl){
    const comma = dataUrl.indexOf(",");
    if (comma < 0) return 0;
    const b64 = dataUrl.slice(comma + 1);
    const pad = b64.endsWith("==") ? 2 : (b64.endsWith("=") ? 1 : 0);
    return Math.floor(b64.length * 3 / 4) - pad;
  }

  function readAsDataUrl(file){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("read"));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src){
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("decode"));
      img.src = src;
    });
  }

  /* Client-side resize/re-encode. Output is always JPEG: it is far smaller
     than PNG for a photographed document, and JPEG has no alpha channel, so
     the white backdrop is painted first. The real MIME type of whatever we
     store is recorded in the record. */
  function shrink(dataUrl){
    return loadImage(dataUrl).then(img => {
      const longest = Math.max(img.width, img.height);
      let best = dataUrl;

      for (const step of QUALITY_STEPS){
        const ratio = Math.min(1, step.maxSide / longest);
        const w = Math.max(1, Math.round(img.width  * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));

        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) break;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        const url = canvas.toDataURL("image/jpeg", step.quality);
        best = url;
        if (dataUrlBytes(url) <= TARGET_BYTES) return url;
      }
      return best;
    });
  }

  function looksAllowed(file){
    if (file.type && ACCEPT.indexOf(file.type) !== -1) return true;
    // Some browsers report an empty type for camera captures; fall back to
    // the extension purely as a convenience. A server must re-check for real.
    return !file.type && /\.(jpe?g|png|webp)$/i.test(file.name || "");
  }

  /* ============================================================
     UI
     ============================================================ */
  function showError(message){
    const d = dom();
    if (d.error){
      d.error.textContent = message;
      d.error.hidden = false;
    }
    if (d.zone) d.zone.classList.add("is-error");
    if (d.field) d.field.classList.add("has-error");
  }

  function clearError(){
    const d = dom();
    if (d.error){ d.error.hidden = true; d.error.textContent = ""; }
    if (d.zone) d.zone.classList.remove("is-error");
    if (d.field) d.field.classList.remove("has-error");
  }

  function render(){
    const d = dom();
    if (!d.zone) return;
    const filled = !!state.record;
    d.zone.dataset.state = filled ? "filled" : "empty";
    if (d.empty)  d.empty.hidden  = filled;
    if (d.filled) d.filled.hidden = !filled;

    if (filled){
      if (d.thumb) d.thumb.src = state.record.dataUrl;
      if (d.name)  d.name.textContent = state.record.fileName;
      if (d.size)  d.size.textContent = humanSize(state.record.bytes);
    } else if (d.input){
      d.input.value = "";   // so re-picking the same file still fires change
    }
  }

  function focusError(){
    const d = dom();
    if (d.zone) d.zone.scrollIntoView({ behavior:"smooth", block:"center" });
    if (d.drop) { try { d.drop.focus({ preventScroll:true }); } catch(e){ d.drop.focus(); } }
  }

  /* Submit-button spinner. Saves/restores whatever label the page set
     (it swaps between "Submit registration" and "Submit team registration"). */
  let busyLabel = null;
  function setBusy(on, label){
    const d = dom();
    if (!d.submit) return;
    if (on){
      if (state.busy) return;
      state.busy = true;
      busyLabel = d.submit.textContent;
      d.submit.setAttribute("aria-busy", "true");
      d.submit.innerHTML =
        `<span class="spinner" aria-hidden="true"></span><span>${label || "Uploading..."}</span>`;
      d.submit.disabled = true;
    } else {
      if (!state.busy) return;
      state.busy = false;
      d.submit.removeAttribute("aria-busy");
      d.submit.textContent = busyLabel != null ? busyLabel : "Submit registration";
      d.submit.disabled = false;
    }
  }

  function setEnabled(on){
    state.enabled = on;
    const d = dom();
    if (d.zone)   d.zone.classList.toggle("is-disabled", !on);
    if (d.drop)   d.drop.disabled   = !on;
    if (d.replace)d.replace.disabled= !on;
    if (d.remove) d.remove.disabled = !on;
    if (d.input)  d.input.disabled  = !on;
  }

  function reset(){
    state.record = null;
    clearError();
    render();
  }

  /* ============================================================
     FILE INTAKE
     ============================================================ */
  function handleFile(file){
    if (!file) return;
    clearError();

    if (!looksAllowed(file)){ showError(MSG_TYPE); return; }
    if (file.size > MAX_BYTES){ showError(MSG_SIZE); return; }

    setBusy(true, "Preparing photo...");
    readAsDataUrl(file)
      .then(shrink)
      .then(dataUrl => {
        state.record = {
          id:        "idp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
          dataUrl:   dataUrl,
          mime:      "image/jpeg",
          bytes:     dataUrlBytes(dataUrl),
          originalBytes: file.size,
          fileName:  file.name || "student-id",
          uploadedAt: new Date().toISOString()
        };
        render();
        setBusy(false);
      })
      .catch(() => {
        setBusy(false);
        showError(MSG_READ);
      });
  }

  /* ============================================================
     PUBLIC API
     ============================================================ */
  function attach(){
    const d = dom();
    if (!d.zone || !d.input) return;

    d.input.accept = ACCEPT_ATTR;   // mobile: camera/gallery picker

    if (d.drop)  d.drop.addEventListener("click", () => { if (state.enabled) d.input.click(); });
    if (d.zone)  d.zone.addEventListener("click", ev => {
      // The filled state owns its own buttons/thumbnail.
      if (!state.enabled) return;
      if (ev.target.closest("button, img")) return;
      d.input.click();
    });

    d.input.addEventListener("change", () => {
      const file = d.input.files && d.input.files[0];
      if (file) handleFile(file);
    });

    // Drag and drop
    ["dragenter", "dragover"].forEach(type => {
      d.zone.addEventListener(type, ev => {
        ev.preventDefault();
        if (state.enabled) d.zone.dataset.drag = "true";
      });
    });
    ["dragleave", "dragend", "drop"].forEach(type => {
      d.zone.addEventListener(type, ev => {
        ev.preventDefault();
        d.zone.dataset.drag = "false";
      });
    });
    d.zone.addEventListener("drop", ev => {
      if (!state.enabled) return;
      const dt = ev.dataTransfer;
      const file = dt && dt.files && dt.files[0];
      if (file) handleFile(file);
    });

    if (d.replace) d.replace.addEventListener("click", ev => {
      ev.stopPropagation();
      if (state.enabled) d.input.click();
    });
    if (d.remove) d.remove.addEventListener("click", ev => {
      ev.stopPropagation();
      state.record = null;
      clearError();
      render();
    });

    // Thumbnail -> larger preview
    if (d.thumb) d.thumb.addEventListener("click", ev => {
      ev.stopPropagation();
      if (state.record) openPreview(state.record.dataUrl, state.record.fileName);
    });

    render();
  }

  function validate(){
    if (!state.record) return { ok:false, message: MSG_REQUIRED };
    return { ok:true, photoId: state.record.id };
  }

  /* Submit-path helper: validates, paints the inline error and moves focus
     to the zone in one call, so callers cannot forget the UI half. */
  function requirePhoto(){
    const res = validate();
    if (!res.ok){
      showError(res.message);
      focusError();
    }
    return res;
  }

  function persist(){
    if (!state.record) return { ok:false, message: MSG_REQUIRED };
    const all = readStore();
    all[state.record.id] = state.record;
    const res = writeStore(all);
    if (!res.ok) return res;
    return { ok:true, photoId: state.record.id };
  }

  function recordExtra(){
    return state.record ? { idPhotoPath: state.record.id } : {};
  }

  /* Modal preview. Uses the student's own #idPhotoModal when present,
     otherwise the admin's shared #modalBox. */
  function openPreview(dataUrl, name){
    const box = document.getElementById("idPhotoModal") || document.getElementById("modalBox");
    const veil = document.getElementById("idPhotoVeil") || document.getElementById("modalVeil");
    if (!box || !veil) return;
    box.innerHTML = `
      <div class="modal-header">
        <h2 class="modal-title">Student ID photo</h2>
        <button type="button" class="modal-close" id="idPhotoClose" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body idphoto-viewer">
        <img src="${dataUrl}" alt="Student ID photo${name ? ", " + String(name).replace(/"/g, "") : ""}">
      </div>`;
    veil.classList.add("open");
    const close = document.getElementById("idPhotoClose");
    if (close) close.onclick = () => veil.classList.remove("open");
  }

  function openViewer(photoId){
    const rec = get(photoId);
    if (!rec) return false;
    openPreview(rec.dataUrl, rec.fileName);
    return true;
  }

  return {
    MAX_BYTES, ACCEPT, ACCEPT_ATTR,
    attach, validate, requirePhoto, persist, recordExtra,
    setBusy, setEnabled, reset,
    has, get, forget, retain, openViewer, humanSize
  };
})();
