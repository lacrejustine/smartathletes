/* ==========================================================
   SmartAthlete — landing page logic (index.html)
   The landing page has no admin or student functionality, so it
   only needs the shared season label.
   ========================================================== */

(function(){
  "use strict";
  const label = document.getElementById("seasonLabel");
  if (label) label.textContent = SA.SEASON_LABEL;
})();