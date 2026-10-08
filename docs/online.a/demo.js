/* ==========================================================
   SmartAthlete — demo mode

   Loaded by login.html and admin.html. Provides:
     - a one-click "Try Demo" sign-in that uses the SAME session
       shape as a normal login, flagged `demo: true`
     - sample season data, written only to the
       `smartathlete_demo_*` storage namespace so it can never
       overwrite real registrations
     - the sample-data generator, loaded on demand by admin.js
       only when a demo session is active
   ========================================================== */

window.SA_DEMO = (function(){
  "use strict";

  const CONFIG = window.SA_CONFIG || {};

  function isEnabled(){
    return CONFIG.demoEnabled !== false;
  }

  function username(){
    return String(CONFIG.demoUsername || "demo");
  }

  /* ---------------- sample data ---------------- */
  // Fixed, readable ids so the generated data is stable across reloads.
  const SPORTS = [
    ["Basketball", "Team Sport", "active"],
    ["Volleyball", "Team Sport", "active"],
    ["Taekwondo", "Combat Sport", "active"],
    ["Table Tennis", "Racket Sport", "active"],
    ["Athletics", "Track & Field", "active"],
    ["Badminton", "Racket Sport", "active"],
    ["Chess", "Mind Sport", "active"],
    ["MLBB (Esports)", "Esports", "active"],
    ["VALORANT (Esports)", "Esports", "active"],
    ["Arnis", "Combat Sport", "retired"],
  ];

  /* Student numbers are digits only (no dash) and contacts are 11-digit
       Philippine mobiles, matching what the registration form now enforces. */
  const ATHLETES = [
    // name, studentNo, dept, course, year, sport, facebook, contact
    ["Juan Dela Cruz",   "210134", "CITE", "BS Criminology",     "3rd Year",  "Basketball",     "facebook.com/juan.delacruz",     "09171234567"],
    ["Maria Santos",     "210135", "CBA",  "BS Business Admin",  "2nd Year",  "Basketball",     "facebook.com/maria.santos",      "09181234567"],
    ["Paulo Reyes",      "210136", "CN",   "BS Criminology",     "1st Year",  "Basketball",     "Paulo Reyes",                    "09191234567"],
    ["Kim Uy",           "210201", "CAS",  "BS Psychology",      "4th Year",  "Volleyball",     "facebook.com/kim.uy",            "09201234567"],
    ["Angel Bautista",   "210202", "CED",  "BS Education",       "2nd Year",  "Volleyball",     "facebook.com/angel.bautista",    "09211234567"],
    ["Rhea Lim",         "210301", "CITE", "BS Criminology",     "3rd Year",  "Taekwondo",     "facebook.com/rhea.lim",          "09221234567"],
    ["Carlo Mendoza",    "210302", "CBA",  "BS Accounting",      "1st Year",  "Taekwondo",     "Carlo Mendoza",                  "09231234567"],
    ["Grace Tolentino",  "210401", "CN",   "BS Information Tech","2nd Year",  "Table Tennis",  "facebook.com/grace.tolentino",   "09241234567"],
    ["Nico Fernandez",   "210402", "CAS",  "BS Psychology",      "3rd Year",  "Athletics",     "facebook.com/nico.fernandez",   "09251234567"],
    ["Bela Ramos",       "210403", "CED",  "BS Education",       "1st Year",  "Athletics",     "Bela Ramos",                     "09261234567"],
    ["Tara Villanueva",  "210501", "CITE", "BS Criminology",     "4th Year",  "Badminton",     "facebook.com/tara.villanueva",   "09271234567"],
    ["Jomar Aquino",     "210502", "CBA",  "BS Business Admin",  "2nd Year",  "Chess",         "facebook.com/jomar.aquino",      "09281234567"],
  ];

  // Team rosters for the esports sports: [teamName, sport, [[name, no, dept], ...]]
  const TEAMS = [
    ["NDMC Phoenix", "MLBB (Esports)", [
      ["Diego Ramos", "210601", "CITE"], ["Miguel Santo", "210602", "CBA"],
      ["Kevin Uy", "210603", "CN"], ["Paolo Lim", "210604", "CAS"],
      ["Rico Adobo", "210605", "CED"],
    ]],
    ["Crimson Owls", "VALORANT (Esports)", [
      ["Ivan Cruz", "210701", "CITE"], ["Marco Bautista", "210702", "CBA"],
      ["Sean Mendoza", "210703", "CN"], ["Gio Tolentino", "210704", "CAS"],
      ["Ralf Fernandez", "210705", "CED"], ["Nina Villanueva", "210706", "CITE"],
    ]],
  ];

  // athlete studentNo -> [skill, fitness, gamesense, discipline, remarks, verdict]
  const EVALS = {
    "210134": [23, 22, 24, 25, "Excellent court vision and leadership.", "Selected"],
    "210135": [21, 23, 20, 24, "Strong and consistent in drills.",       "Selected"],
    "210136": [14, 16, 13, 18, "Needs more game experience.",             "Waitlisted"],
    "210201": [24, 21, 22, 24, "Excellent blocking and serve.",           "Selected"],
    "210202": [18, 19, 17, 20, "Good effort, improving.",                 "Not Selected"],
    "210301": [25, 24, 23, 25, "Outstanding poomsae form.",               "Selected"],
    "210302": [15, 17, 14, 19, "Promising but needs footwork work.",      "Waitlisted"],
    "210401": [22, 20, 21, 23, "Very consistent at the table.",           "Selected"],
    "210501": [21, 19, 22, 24, "Great stamina and recovery.",             "Selected"],
    "210402": [17, 20, 16, 21, "Solid sprinting, watch the starts.",      "Pending"],
    "210502": [12, 15, 13, 17, "Still adjusting to the schedule.",        "Not Selected"],
    "210601": [24, 22, 25, 23, "Excellent shot-calling.",                "Selected"],
    "210701": [23, 24, 22, 24, "Calm under pressure.",                   "Selected"],
  };

  function dateStamp(daysAgo){
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0,10);
  }

  function localStamp(daysFromNow){
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    const p = n => String(n).padStart(2,"0");
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  /* Writes a complete sample season into the demo namespace. */
  function seed(){
    SA.useNamespace("demo");

    const sports = SPORTS.map(([name, category, status], index) => ({
      id: `dsp${index}`, name, category, status,
    }));
    SA.saveSportsRaw(sports);

    const byName = {};
    sports.forEach(s => { byName[s.name] = s.id; });

    const athletes = [];
    ATHLETES.forEach(([name, studentId, department, course, yearLevel, sport, facebook, contact], index) => {
      athletes.push({
        id: `dat${index}`,
        name, studentId, department, course, yearLevel, contact, facebook,
        sportId: byName[sport] || sports[0].id,
        sportName: sport,
        // New registrations default to Pending; the seeded verdicts below set
        // the rest so the demo shows every status colour.
        status: (EVALS[studentId] && EVALS[studentId][5]) || "Pending",
        referenceNo: `NDMC-DEMO${String(index + 1).padStart(2,"0")}`,
        dateRegistered: dateStamp(18 - index),
      });
    });

    TEAMS.forEach(([teamName, sport, members], teamIndex) => {
      const teamId = `dteam${teamIndex}`;
      const referenceNo = `NDMC-DTEAM${teamIndex + 1}`;
      members.forEach(([name, studentId, department], index) => {
        athletes.push({
          id: `dat_t${teamIndex}_${index}`,
          name, studentId, department,
          course: "Esports Team", yearLevel: "Team Member",
          contact: "", facebook: "",
          sportId: byName[sport], sportName: sport,
          status: (EVALS[studentId] && EVALS[studentId][5]) || "Pending",
          teamId, teamName, referenceNo,
          dateRegistered: dateStamp(12 - teamIndex),
        });
      });
    });
    SA.saveAthletesRaw(athletes);

    const evals = [];
    Object.keys(EVALS).forEach(studentId => {
      const athlete = athletes.find(a => a.studentId === studentId);
      if (!athlete) return;
      const [skill, fitness, gamesense, discipline, remarks, selectionStatus] = EVALS[studentId];
      evals.push({
        id: `dev_${athlete.id}`,
        athleteId: athlete.id,
        sportId: athlete.sportId,
        skill, fitness, gamesense, discipline,
        total: skill + fitness + gamesense + discipline,
        remarks, selectionStatus,
        date: dateRegisteredFor(athletes, athlete.id),
      });
    });
    SA.saveEvalsRaw(evals);

    // Registration is open, closing soon, with a tryout a few days after.
    SA.saveSettingsRaw({
      openAt: "",
      cutoffAt: localStamp(6),
      manuallyClosed: false,
      // Demo ships with results visible so the Try Demo button shows the whole
      // flow. Staff can switch this off from Final Selection.
      publishResults: true,
      tryoutDate: dateStamp(-9),
      tryoutTime: "08:00",
      tryoutVenue: "NDMC Main Gymnasium",
      tryoutNote: "Bring your intramurals ID and proper sports attire.",
      sportOverrides: {
        [byName["Taekwondo"]]: { date: "", time: "09:00", venue: "NDMC Combat Gym", note: "" },
        [byName["MLBB (Esports)"]]: { date: "", time: "10:00", venue: "Computer Lab 2", note: "Bring your own mouse." },
      },
    });
  }

  function dateRegisteredFor(athletes, id){
    const found = athletes.find(a => a.id === id);
    return found ? found.dateRegistered : dateStamp(1);
  }

  function hasData(){
    return SA.namespaceHasData("demo");
  }

  /* Seeds only when the demo namespace is empty, so a visitor who reloads
     keeps whatever they changed during the demo. */
  function seedIfEmpty(){
    if (hasData()) return false;
    seed();
    return true;
  }

  /* Wipes the demo namespace and returns to the live one. */
  function reset(){
    SA.clearNamespace("demo");
    SA.useNamespace("live");
  }

  return { isEnabled, username, hasData, seedIfEmpty, seed, reset };
})();