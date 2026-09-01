(function () {
  "use strict";

  var STORAGE_KEY = "bitacora_dias_v1";
  var STORAGE_KEY_GOALS = "bitacora_metas_v1";
  var DAY_MIN = 1440;

  // ---------------------------------------------------------------
  // Storage helpers
  // ---------------------------------------------------------------
  function loadAll() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error("Error leyendo localStorage", e);
      return {};
    }
  }

  function saveAll(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error("Error guardando en localStorage", e);
      showToast("No se pudo guardar. ¿Espacio lleno?");
      return false;
    }
  }

  function getEntries(dateStr) {
    var all = loadAll();
    var list = all[dateStr] || [];
    return list.slice().sort(function (a, b) {
      return toMin(a.start) - toMin(b.start);
    });
  }

  function saveEntries(dateStr, entries) {
    var all = loadAll();
    if (entries.length === 0) {
      delete all[dateStr];
    } else {
      all[dateStr] = entries;
    }
    saveAll(all);
  }

  function addEntry(dateStr, entry) {
    var entries = getEntries(dateStr);
    entries.push(entry);
    saveEntries(dateStr, entries);
  }

  function deleteEntry(dateStr, id) {
    var entries = getEntries(dateStr).filter(function (e) { return e.id !== id; });
    saveEntries(dateStr, entries);
  }

  function updateEntry(dateStr, id, changes) {
    var entries = getEntries(dateStr).map(function (e) {
      if (e.id === id) return Object.assign({}, e, changes);
      return e;
    });
    saveEntries(dateStr, entries);
  }

  function allTaskNames() {
    var all = loadAll();
    var set = {};
    Object.keys(all).forEach(function (d) {
      all[d].forEach(function (e) {
        if (e.task) set[e.task] = true;
      });
    });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, "es"); });
  }

  // ---------------------------------------------------------------
  // Goals storage helpers
  // ---------------------------------------------------------------
  function loadGoals() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY_GOALS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("Error leyendo metas", e);
      return [];
    }
  }

  function saveGoals(goals) {
    try {
      localStorage.setItem(STORAGE_KEY_GOALS, JSON.stringify(goals));
      return true;
    } catch (e) {
      console.error("Error guardando metas", e);
      showToast("No se pudo guardar la meta.");
      return false;
    }
  }

  function upsertGoal(goal) {
    var goals = loadGoals();
    var idx = goals.findIndex(function (g) { return g.id === goal.id; });
    if (idx === -1) goals.push(goal);
    else goals[idx] = goal;
    saveGoals(goals);
  }

  function deleteGoal(id) {
    var goals = loadGoals().filter(function (g) { return g.id !== id; });
    saveGoals(goals);
  }

  // ---------------------------------------------------------------
  // Time helpers
  // ---------------------------------------------------------------
  function toMin(hhmm) {
    if (!hhmm) return 0;
    var parts = hhmm.split(":");
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  function toHHMM(min) {
    min = ((min % DAY_MIN) + DAY_MIN) % DAY_MIN;
    var h = Math.floor(min / 60);
    var m = min % 60;
    return pad2(h) + ":" + pad2(m);
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function fmtDuration(min) {
    var h = Math.floor(min / 60);
    var m = min % 60;
    if (h === 0) return m + "m";
    if (m === 0) return h + "h";
    return h + "h " + m + "m";
  }

  function todayStr() {
    return dateToStr(new Date());
  }

  function dateToStr(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function strToDate(s) {
    var parts = s.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function addDays(dateStr, delta) {
    var d = strToDate(dateStr);
    d.setDate(d.getDate() + delta);
    return dateToStr(d);
  }

  function nowRounded5() {
    var d = new Date();
    var min = d.getHours() * 60 + d.getMinutes();
    min = Math.round(min / 5) * 5;
    return toHHMM(min);
  }

  // ---------------------------------------------------------------
  // Segment / aggregate computation
  // ---------------------------------------------------------------
  function computeDaySegments(entries) {
    var valid = entries
      .filter(function (e) { return toMin(e.start) < toMin(e.end); })
      .sort(function (a, b) { return toMin(a.start) - toMin(b.start); });

    var segs = [];
    var cursor = 0;
    valid.forEach(function (e) {
      var s = toMin(e.start);
      var en = toMin(e.end);
      if (s > cursor) {
        segs.push({ task: "Desconocido", start: cursor, end: s });
      }
      if (s < cursor) s = cursor;
      if (en > cursor && en > s) {
        segs.push({ task: e.task, start: s, end: en });
        cursor = en;
      }
    });
    if (cursor < DAY_MIN) {
      segs.push({ task: "Desconocido", start: cursor, end: DAY_MIN });
    }
    return segs;
  }

  function aggregateSegments(segs) {
    var map = {};
    segs.forEach(function (s) {
      var dur = s.end - s.start;
      map[s.task] = (map[s.task] || 0) + dur;
    });
    return map;
  }

  // ---------------------------------------------------------------
  // Colors
  // ---------------------------------------------------------------
  var UNKNOWN_COLOR = "hsl(228, 12%, 42%)";

  function hashHue(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % 360;
  }

  function taskColor(task) {
    if (task === "Desconocido") return UNKNOWN_COLOR;
    var hue = hashHue(task);
    return "hsl(" + hue + ", 62%, 58%)";
  }

  // ---------------------------------------------------------------
  // Goals: evaluation
  // ---------------------------------------------------------------
  // Una meta tiene esta forma:
  // {
  //   id, label, keyword,
  //   targetTime: "HH:MM" | "",   // opcional: hora objetivo
  //   toleranceMin: number,       // margen +/- minutos alrededor de targetTime
  //   minDuration: number         // minutos mínimos requeridos (0 = sin mínimo)
  // }
  // Se evalúa siempre contra los registros del día que se está viendo,
  // usando la definición ACTUAL de la meta (no hay histórico de metas):
  // así, si cambias una meta, el cambio se refleja al instante en
  // cualquier día que consultes.
  function computeGoalStatus(goal, dateStr, entries) {
    var kw = (goal.keyword || "").trim().toLowerCase();
    var valid = entries.filter(function (e) { return toMin(e.start) < toMin(e.end); });

    var hasTarget = !!goal.targetTime;
    var wStart = 0, wEnd = DAY_MIN;
    var matching;

    if (hasTarget) {
      var t = toMin(goal.targetTime);
      var tol = (goal.toleranceMin != null && goal.toleranceMin !== "") ? Number(goal.toleranceMin) : 30;
      wStart = Math.max(0, t - tol);
      wEnd = Math.min(DAY_MIN, t + tol);
      matching = valid.filter(function (e) {
        if (kw && e.task.toLowerCase().indexOf(kw) === -1) return false;
        return toMin(e.end) > wStart && toMin(e.start) < wEnd;
      });
    } else {
      matching = valid.filter(function (e) {
        return !kw || e.task.toLowerCase().indexOf(kw) !== -1;
      });
    }

    var totalDur = matching.reduce(function (sum, e) {
      return sum + (toMin(e.end) - toMin(e.start));
    }, 0);

    var required = Number(goal.minDuration) || 0;
    var found = matching.length > 0;
    var achieved = required > 0 ? totalDur >= required : found;

    var today = todayStr();
    var isPast = dateStr < today;
    var isToday = dateStr === today;

    var windowClosed = isPast;
    if (isToday) {
      if (hasTarget) {
        var nowMin = new Date().getHours() * 60 + new Date().getMinutes();
        windowClosed = nowMin > wEnd;
      } else {
        windowClosed = false;
      }
    }

    var status;
    if (achieved) {
      status = "met";
    } else if (windowClosed) {
      status = (required > 0 && totalDur > 0) ? "partial" : "missed";
    } else {
      status = "pending";
    }

    return { status: status, totalDur: totalDur, required: required, found: found, matching: matching };
  }

  var GOAL_STATUS_ICON = {
    met: "✓",
    partial: "◐",
    missed: "✕",
    pending: "…"
  };

  function goalMetaText(goal) {
    var parts = [];
    parts.push('coincide con "' + (goal.keyword || "") + '"');
    if (goal.targetTime) {
      var tol = (goal.toleranceMin != null && goal.toleranceMin !== "") ? Number(goal.toleranceMin) : 30;
      parts.push("sobre las " + goal.targetTime + " (±" + tol + "m)");
    }
    if (Number(goal.minDuration) > 0) {
      parts.push("mín. " + fmtDuration(Number(goal.minDuration)));
    }
    return parts.join(" · ");
  }

  function goalResultText(result) {
    if (result.required > 0) {
      return fmtDuration(result.totalDur) + " / " + fmtDuration(result.required);
    }
    if (result.found) {
      var first = result.matching.slice().sort(function (a, b) { return toMin(a.start) - toMin(b.start); })[0];
      return "hecho a las " + first.start;
    }
    return "sin registrar todavía";
  }

  // ---------------------------------------------------------------
  // State
  // ---------------------------------------------------------------
  var state = {
    selectedDate: todayStr(),
    goalsExpanded: false
  };

  // ---------------------------------------------------------------
  // DOM refs
  // ---------------------------------------------------------------
  var el = {};
  function cacheDom() {
    [
      "dateInput", "prevDay", "nextDay", "savedDaysSelect", "todayBtn",
      "entryForm", "taskInput", "taskHistory", "startInput", "endInput",
      "durationChips", "formHint",
      "statTracked", "statTasks", "statEntries", "insightText",
      "goalsToggle", "goalsBody", "goalsSummary",
      "addGoalBtn", "shareGoalsBtn", "goalFormWrap", "goalsList", "noGoals",
      "dialHolder", "dialLegend", "rankingList",
      "heatmapGrid",
      "recordsList", "noRecords",
      "shareDayBtn", "shareWeekBtn",
      "toast",
      "exportBtn", "importBtn", "importFile", "wipeBtn",
      "settingsBtn", "closeSettings", "settingsModal",
    ].forEach(function (id) { el[id] = document.getElementById(id); });
  }

  // ---------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------
  var toastTimer = null;
  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.toast.classList.remove("show");
    }, 2400);
  }

  // ---------------------------------------------------------------
  // Rendering: date nav
  // ---------------------------------------------------------------
  function renderDateNav() {
    el.dateInput.value = state.selectedDate;
    var all = loadAll();
    var dates = Object.keys(all).sort().reverse();
    el.savedDaysSelect.innerHTML = '<option value="">— elegir —</option>';
    dates.forEach(function (d) {
      var opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d + " (" + all[d].length + ")";
      if (d === state.selectedDate) opt.selected = true;
      el.savedDaysSelect.appendChild(opt);
    });
  }

  // ---------------------------------------------------------------
  // Rendering: stats + insight
  // ---------------------------------------------------------------
  function renderStats(entries, segs, agg) {
    var validEntries = entries.filter(function (e) { return toMin(e.start) < toMin(e.end); });
    var unknownMin = agg["Desconocido"] || 0;
    var trackedMin = DAY_MIN - unknownMin;
    var distinctTasks = Object.keys(agg).filter(function (t) { return t !== "Desconocido"; });

    el.statTracked.textContent = fmtDuration(trackedMin);
    el.statTasks.textContent = distinctTasks.length;
    el.statEntries.textContent = validEntries.length;

    if (validEntries.length === 0) {
      el.insightText.innerHTML = "Todavía no hay nada registrado este día. Añade tu primera tarea arriba.";
      return;
    }

    var sorted = distinctTasks
      .map(function (t) { return [t, agg[t]]; })
      .sort(function (a, b) { return b[1] - a[1]; });

    var top = sorted[0];
    var pctTop = Math.round((top[1] / DAY_MIN) * 100);

    var msg = "Tu tarea principal fue <strong>" + escapeHtml(top[0]) + "</strong>, con " +
      fmtDuration(top[1]) + " (" + pctTop + "% del día).";

    el.insightText.innerHTML = msg;
  }

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  // ---------------------------------------------------------------
  // Rendering: Goals
  // ---------------------------------------------------------------
  var GOAL_STATUS_LABEL = {
    met: "cumplida",
    partial: "parcial",
    missed: "no cumplida",
    pending: "pendiente"
  };

  function renderGoalsSummary(goals, entries) {
    if (goals.length === 0) {
      el.goalsSummary.textContent = "sin metas";
      return;
    }
    var counts = { met: 0, partial: 0, missed: 0, pending: 0 };
    goals.forEach(function (goal) {
      var result = computeGoalStatus(goal, state.selectedDate, entries);
      counts[result.status]++;
    });
    var parts = [];
    ["met", "partial", "missed", "pending"].forEach(function (st) {
      if (counts[st] > 0) parts.push(GOAL_STATUS_ICON[st] + counts[st]);
    });
    el.goalsSummary.textContent = parts.join(" ");
  }

  function setGoalsExpanded(expanded) {
    state.goalsExpanded = expanded;
    el.goalsToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    el.goalsBody.hidden = !expanded;
    if (!expanded) el.goalFormWrap.innerHTML = "";
  }

  function renderGoals(entries) {
    var goals = loadGoals();
    renderGoalsSummary(goals, entries);

    el.goalsList.innerHTML = "";
    el.noGoals.style.display = goals.length ? "none" : "block";

    goals.forEach(function (goal) {
      var result = computeGoalStatus(goal, state.selectedDate, entries);
      var row = document.createElement("div");
      row.className = "goal-row goal-" + result.status;
      row.innerHTML =
        '<span class="goal-status-icon" aria-hidden="true">' + GOAL_STATUS_ICON[result.status] + '</span>' +
        '<div class="goal-info">' +
        '<div class="goal-label">' + escapeHtml(goal.label || goal.keyword) + '</div>' +
        '<div class="goal-meta">' + escapeHtml(goalMetaText(goal)) + '</div>' +
        '<div class="goal-result">' + escapeHtml(goalResultText(result)) + '</div>' +
        '</div>' +
        '<div class="goal-actions">' +
        '<button type="button" class="goal-edit-btn" aria-label="Editar meta">✎</button>' +
        '<button type="button" class="goal-del-btn" aria-label="Eliminar meta">✕</button>' +
        '</div>';

      row.querySelector(".goal-del-btn").addEventListener("click", function () {
        if (confirm('Eliminar la meta "' + (goal.label || goal.keyword) + '"?')) {
          deleteGoal(goal.id);
          renderAll();
          showToast("Meta eliminada");
        }
      });

      row.querySelector(".goal-edit-btn").addEventListener("click", function () {
        openGoalForm(goal);
      });

      el.goalsList.appendChild(row);
    });
  }

  function openGoalForm(existingGoal) {
    var isNew = !existingGoal;
    var goal = existingGoal || { id: uid(), label: "", keyword: "", targetTime: "", toleranceMin: 30, minDuration: 0 };

    var form = document.createElement("div");
    form.className = "goal-form";
    form.innerHTML =
      '<div class="field">' +
        '<label>Nombre de la meta</label>' +
        '<input type="text" class="g-label" placeholder="p. ej. Cena" value="' + escapeHtml(goal.label || "") + '">' +
      '</div>' +
      '<div class="field">' +
        '<label>La tarea debe contener el texto</label>' +
        '<input type="text" class="g-keyword" list="taskHistory" placeholder="p. ej. cena" value="' + escapeHtml(goal.keyword || "") + '">' +
      '</div>' +
      '<label class="checkbox-field">' +
        '<input type="checkbox" class="g-has-time" ' + (goal.targetTime ? "checked" : "") + '>' +
        'Con hora objetivo' +
      '</label>' +
      '<div class="goal-form-row g-time-fields" style="display:' + (goal.targetTime ? "flex" : "none") + '">' +
        '<div class="field">' +
          '<label>Hora objetivo</label>' +
          '<input type="time" class="g-time" value="' + (goal.targetTime || "") + '">' +
        '</div>' +
        '<div class="field">' +
          '<label>Margen (± min)</label>' +
          '<input type="number" class="g-tolerance" min="0" step="5" value="' + (goal.toleranceMin != null ? goal.toleranceMin : 30) + '">' +
        '</div>' +
      '</div>' +
      '<div class="field">' +
        '<label>Duración mínima (min, 0 = sin mínimo)</label>' +
        '<input type="number" class="g-min-duration" min="0" step="5" value="' + (goal.minDuration || 0) + '">' +
      '</div>' +
      '<div class="goal-form-actions">' +
        (isNew ? "" : '<button type="button" class="goal-form-delete">Eliminar</button>') +
        '<button type="button" class="goal-form-cancel">Cancelar</button>' +
        '<button type="button" class="goal-form-save">Guardar</button>' +
      '</div>';

    el.goalFormWrap.innerHTML = "";
    el.goalFormWrap.appendChild(form);

    var hasTimeCb = form.querySelector(".g-has-time");
    var timeFields = form.querySelector(".g-time-fields");
    hasTimeCb.addEventListener("change", function () {
      timeFields.style.display = hasTimeCb.checked ? "flex" : "none";
    });

    form.querySelector(".g-label").focus();

    form.querySelector(".goal-form-cancel").addEventListener("click", function () {
      el.goalFormWrap.innerHTML = "";
    });

    if (!isNew) {
      form.querySelector(".goal-form-delete").addEventListener("click", function () {
        if (confirm('Eliminar la meta "' + (goal.label || goal.keyword) + '"?')) {
          deleteGoal(goal.id);
          el.goalFormWrap.innerHTML = "";
          renderAll();
          showToast("Meta eliminada");
        }
      });
    }

    form.querySelector(".goal-form-save").addEventListener("click", function () {
      var label = form.querySelector(".g-label").value.trim();
      var keyword = form.querySelector(".g-keyword").value.trim();
      var hasTime = hasTimeCb.checked;
      var time = hasTime ? form.querySelector(".g-time").value : "";
      var tolerance = parseInt(form.querySelector(".g-tolerance").value, 10);
      var minDuration = parseInt(form.querySelector(".g-min-duration").value, 10);

      if (!keyword) { showToast("Indica qué texto debe contener la tarea"); return; }
      if (hasTime && !time) { showToast("Indica la hora objetivo o desmarca la casilla"); return; }
      if (isNaN(tolerance) || tolerance < 0) tolerance = 30;
      if (isNaN(minDuration) || minDuration < 0) minDuration = 0;

      var newGoal = {
        id: goal.id,
        label: label || keyword,
        keyword: keyword,
        targetTime: hasTime ? time : "",
        toleranceMin: hasTime ? tolerance : 30,
        minDuration: minDuration
      };

      upsertGoal(newGoal);
      el.goalFormWrap.innerHTML = "";
      renderAll();
      showToast(isNew ? "Meta creada" : "Meta actualizada");
    });
  }

  // ---------------------------------------------------------------
  // Rendering: Day dial (signature visual)
  // ---------------------------------------------------------------
  function renderDial(segs, agg, isToday) {
    var size = 200, cx = size / 2, cy = size / 2, r = 78, sw = 30;
    var circ = 2 * Math.PI * r;

    var arcs = "";
    segs.forEach(function (s) {
      if (s.task === "Desconocido") return;
      var dur = s.end - s.start;
      if (dur <= 0) return;
      var len = (dur / DAY_MIN) * circ;
      var offset = (s.start / DAY_MIN) * circ;
      var color = taskColor(s.task);
      arcs += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r +
        '" fill="none" stroke="' + color + '" stroke-width="' + sw +
        '" stroke-dasharray="' + len.toFixed(2) + ' ' + (circ - len).toFixed(2) +
        '" stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')">' +
        "<title>" + escapeHtml(s.task) + ": " + toHHMM(s.start) + "–" + toHHMM(s.end) + "</title></circle>";
    });

    // Hour ticks at 0/6/12/18
    var ticks = "";
    [0, 6, 12, 18].forEach(function (h) {
      var angle = (h / 24) * 2 * Math.PI - Math.PI / 2;
      var rOuter = r + sw / 2 + 6;
      var rInner = r + sw / 2 + 1;
      var x1 = cx + rInner * Math.cos(angle), y1 = cy + rInner * Math.sin(angle);
      var x2 = cx + rOuter * Math.cos(angle), y2 = cy + rOuter * Math.sin(angle);
      ticks += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) +
        '" y2="' + y2.toFixed(1) + '" stroke="var(--muted-2)" stroke-width="1.5"/>';
      var lx = cx + (rOuter + 10) * Math.cos(angle), ly = cy + (rOuter + 10) * Math.sin(angle);
      var label = h === 0 ? "00" : h;
      ticks += '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) +
        '" fill="var(--muted-2)" font-size="9" font-family="var(--font-mono)" text-anchor="middle" dominant-baseline="middle">' + label + "</text>";
    });

    var nowLine = "";
    if (isToday) {
      var nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      var na = (nowMin / DAY_MIN) * 2 * Math.PI - Math.PI / 2;
      var nx1 = cx + (r - sw / 2 - 2) * Math.cos(na), ny1 = cy + (r - sw / 2 - 2) * Math.sin(na);
      var nx2 = cx + (r + sw / 2 + 2) * Math.cos(na), ny2 = cy + (r + sw / 2 + 2) * Math.sin(na);
      nowLine = '<line x1="' + nx1.toFixed(1) + '" y1="' + ny1.toFixed(1) + '" x2="' + nx2.toFixed(1) +
        '" y2="' + ny2.toFixed(1) + '" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/>';
    }

    var svg = '<svg viewBox="0 0 ' + size + " " + size + '" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="var(--bg-soft)" stroke-width="' + sw + '"/>' +
      arcs + ticks + nowLine + "</svg>";

    el.dialHolder.innerHTML = svg;

    var centerDiv = document.createElement("div");
    centerDiv.className = "dial-center";
    var trackedMin = DAY_MIN - (agg["Desconocido"] || 0);
    centerDiv.innerHTML = '<span class="dc-value">' + fmtDuration(trackedMin) + '</span><span class="dc-label">registrado</span>';
    el.dialHolder.appendChild(centerDiv);

    // legend
    var sorted = Object.keys(agg)
      .filter(function (t) { return t !== "Desconocido"; })
      .sort(function (a, b) { return agg[b] - agg[a]; });
    el.dialLegend.innerHTML = "";
    sorted.forEach(function (task) {
      var item = document.createElement("div");
      item.className = "legend-item";
      item.innerHTML = '<span class="legend-swatch" style="background:' + taskColor(task) + '"></span>' +
        escapeHtml(task) + " · " + fmtDuration(agg[task]);
      el.dialLegend.appendChild(item);
    });
  }

  // ---------------------------------------------------------------
  // Rendering: ranking bars
  // ---------------------------------------------------------------
  function renderRanking(agg) {
    var sorted = Object.keys(agg)
      .filter(function (t) { return t !== "Desconocido"; })
      .map(function (t) { return [t, agg[t]]; })
      .sort(function (a, b) { return b[1] - a[1]; });

    el.rankingList.innerHTML = "";

    if (sorted.length === 0) {
      el.rankingList.innerHTML = '<p class="empty-note">Aún no hay tareas registradas este día.</p>';
      return;
    }

    var max = sorted[0][1];

    sorted.forEach(function (pair) {
      var task = pair[0], min = pair[1];
      var pct = Math.round((min / DAY_MIN) * 100);
      var row = document.createElement("div");
      row.className = "ranking-row";
      row.innerHTML =
        '<div class="ranking-top"><span class="ranking-name">' + escapeHtml(task) +
        '</span><span class="ranking-meta">' + fmtDuration(min) + " · " + pct + '%</span></div>' +
        '<div class="ranking-bar-track"><div class="ranking-bar-fill" style="width:' +
        Math.max(2, (min / max) * 100) + '%;background:' + taskColor(task) + '"></div></div>';
      el.rankingList.appendChild(row);
    });
  }

  // ---------------------------------------------------------------
  // Rendering: weekly heatmap
  // ---------------------------------------------------------------
  function getHeatmapDays(baseDateStr) {
    var days = [];
    var base = strToDate(baseDateStr);
    for (var i = 13; i >= 0; i--) {
      var d = new Date(base);
      d.setDate(d.getDate() - i);
      days.push(dateToStr(d));
    }
    return days;
  }

  // Tarea dominante en una franja horaria, ignorando el tiempo "Desconocido".
  function bestTaskForHour(segs, hr) {
    var winStart = hr * 60, winEnd = winStart + 60;
    var byTask = {};
    segs.forEach(function (s) {
      if (s.task === "Desconocido") return;
      var ov = Math.min(s.end, winEnd) - Math.max(s.start, winStart);
      if (ov > 0) byTask[s.task] = (byTask[s.task] || 0) + ov;
    });
    var bestTask = null, bestMin = 0;
    Object.keys(byTask).forEach(function (t) {
      if (byTask[t] > bestMin) { bestMin = byTask[t]; bestTask = t; }
    });
    return bestTask ? { task: bestTask, min: bestMin } : null;
  }

  function renderHeatmap() {
    var grid = el.heatmapGrid;
    grid.innerHTML = "";

    // corner
    grid.appendChild(makeDiv("hm-corner", ""));
    for (var h = 0; h < 24; h++) {
      grid.appendChild(makeDiv("hm-hour-label", h % 3 === 0 ? String(h) : ""));
    }

    var days = getHeatmapDays(state.selectedDate);

    days.forEach(function (dateStr) {
      var label = document.createElement("div");
      label.className = "hm-day-label";
      label.textContent = dateStr.slice(5);
      grid.appendChild(label);

      var entries = getEntries(dateStr);
      var hasData = entries.length > 0;
      var segs = hasData ? computeDaySegments(entries) : [];

      for (var hr = 0; hr < 24; hr++) {
        var cell = document.createElement("div");
        cell.className = "hm-cell";
        cell.title = dateStr + " " + pad2(hr) + ":00";

        if (hasData) {
          var best = bestTaskForHour(segs, hr);
          if (best) {
            var opacity = 0.35 + 0.65 * (best.min / 60);
            cell.style.background = taskColor(best.task);
            cell.style.opacity = opacity.toFixed(2);
            cell.title += " — " + best.task + " (" + best.min + " min)";
          }
        }
        grid.appendChild(cell);
      }
    });
  }

  function makeDiv(cls, text) {
    var d = document.createElement("div");
    d.className = cls;
    d.textContent = text;
    return d;
  }

  // ---------------------------------------------------------------
  // Rendering: records list
  // ---------------------------------------------------------------
  function renderRecords(entries) {
    el.recordsList.innerHTML = "";
    var valid = entries.filter(function (e) { return toMin(e.start) < toMin(e.end); })
      .sort(function (a, b) { return toMin(b.start) - toMin(a.start); });

    el.noRecords.style.display = valid.length ? "none" : "block";

    valid.forEach(function (entry) {
      var row = document.createElement("div");
      row.className = "record-row";
      row.style.borderLeftColor = taskColor(entry.task);
      row.dataset.id = entry.id;

      var dur = toMin(entry.end) - toMin(entry.start);
      row.innerHTML =
        '<span class="record-time">' + entry.start + "–" + entry.end + '</span>' +
        '<span class="record-task">' + escapeHtml(entry.task) + '</span>' +
        '<span class="record-dur">' + fmtDuration(dur) + '</span>' +
        '<span class="record-actions">' +
        '<button type="button" class="edit-btn" aria-label="Editar">✎</button>' +
        '<button type="button" class="del-btn" aria-label="Eliminar">✕</button>' +
        "</span>";

      row.querySelector(".del-btn").addEventListener("click", function () {
        if (confirm('Eliminar "' + entry.task + '" (' + entry.start + "–" + entry.end + ")?")) {
          deleteEntry(state.selectedDate, entry.id);
          renderAll();
          showToast("Registro eliminado");
        }
      });

      row.querySelector(".edit-btn").addEventListener("click", function () {
        openEditRow(row, entry);
      });

      el.recordsList.appendChild(row);
    });
  }

  function openEditRow(row, entry) {
    var editRow = document.createElement("div");
    editRow.className = "edit-row";
    editRow.innerHTML =
      '<input type="text" class="e-task" value="' + escapeHtml(entry.task) + '">' +
      '<input type="time" class="e-start" value="' + entry.start + '">' +
      '<input type="time" class="e-end" value="' + entry.end + '">' +
      '<div class="edit-actions">' +
      '<button type="button" class="edit-cancel">Cancelar</button>' +
      '<button type="button" class="edit-save">Guardar</button>' +
      "</div>";

    row.replaceWith(editRow);

    editRow.querySelector(".edit-cancel").addEventListener("click", function () {
      renderAll();
    });

    editRow.querySelector(".edit-save").addEventListener("click", function () {
      var task = editRow.querySelector(".e-task").value.trim();
      var start = editRow.querySelector(".e-start").value;
      var end = editRow.querySelector(".e-end").value;
      if (!task || !start || !end) { showToast("Rellena todos los campos"); return; }
      if (toMin(end) <= toMin(start)) { showToast("La hora de fin debe ser posterior al inicio"); return; }
      updateEntry(state.selectedDate, entry.id, { task: task, start: start, end: end });
      renderAll();
      showToast("Registro actualizado");
    });
  }

  // ---------------------------------------------------------------
  // Master render
  // ---------------------------------------------------------------
  function renderAll() {
    renderDateNav();
    var entries = getEntries(state.selectedDate);
    var segs = computeDaySegments(entries);
    var agg = aggregateSegments(segs);
    var isToday = state.selectedDate === todayStr();

    renderStats(entries, segs, agg);
    renderGoals(entries);
    renderDial(segs, agg, isToday);
    renderRanking(agg);
    renderHeatmap();
    renderRecords(entries);
    refreshTaskHistory();
    prefillStart();
  }

  function refreshTaskHistory() {
    el.taskHistory.innerHTML = "";
    allTaskNames().forEach(function (name) {
      var opt = document.createElement("option");
      opt.value = name;
      el.taskHistory.appendChild(opt);
    });
  }

  function prefillStart() {
    var entries = getEntries(state.selectedDate).filter(function (e) { return toMin(e.start) < toMin(e.end); });
    if (entries.length) {
      var last = entries.sort(function (a, b) { return toMin(b.end) - toMin(a.end); })[0];
      el.startInput.value = last.end;
    } else if (state.selectedDate === todayStr()) {
      el.startInput.value = nowRounded5();
    } else {
      el.startInput.value = "";
    }
    el.endInput.value = "";
    clearChipSelection();
  }

  function clearChipSelection() {
    el.durationChips.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("chip-active"); });
  }

  // ---------------------------------------------------------------
  // Event wiring
  // ---------------------------------------------------------------
  function wireEvents() {
    el.dateInput.addEventListener("change", function () {
      if (el.dateInput.value) {
        state.selectedDate = el.dateInput.value;
        renderAll();
      }
    });

    el.prevDay.addEventListener("click", function () {
      state.selectedDate = addDays(state.selectedDate, -1);
      renderAll();
    });

    el.nextDay.addEventListener("click", function () {
      state.selectedDate = addDays(state.selectedDate, 1);
      renderAll();
    });

    el.todayBtn.addEventListener("click", function () {
      state.selectedDate = todayStr();
      renderAll();
    });

    el.savedDaysSelect.addEventListener("change", function () {
      if (el.savedDaysSelect.value) {
        state.selectedDate = el.savedDaysSelect.value;
        renderAll();
      }
    });

    document.querySelectorAll('[data-now-target]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        var target = document.getElementById(btn.dataset.nowTarget);
        target.value = nowRounded5();
      });
    });

    el.durationChips.querySelectorAll(".chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        if (!el.startInput.value) {
          el.startInput.value = state.selectedDate === todayStr() ? nowRounded5() : "09:00";
        }
        var mins = parseInt(chip.dataset.min, 10);
        var endMin = toMin(el.startInput.value) + mins;
        if (endMin >= DAY_MIN) endMin = DAY_MIN - 1;
        el.endInput.value = toHHMM(endMin);
        clearChipSelection();
        chip.classList.add("chip-active");
        validateForm();
      });
    });

    [el.startInput, el.endInput].forEach(function (input) {
      input.addEventListener("change", function () {
        clearChipSelection();
        validateForm();
      });
    });

    el.entryForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var task = el.taskInput.value.trim();
      var start = el.startInput.value;
      var end = el.endInput.value;

      if (!task) { showToast("Escribe el nombre de la tarea"); return; }
      if (!start || !end) { showToast("Indica inicio y fin"); return; }
      if (toMin(end) <= toMin(start)) { showToast("El fin debe ser posterior al inicio"); return; }

      addEntry(state.selectedDate, { id: uid(), task: task, start: start, end: end });
      el.taskInput.value = "";
      renderAll();
      el.taskInput.focus();
      showToast("Añadido: " + task);
    });

    el.goalsToggle.addEventListener("click", function () {
      setGoalsExpanded(!state.goalsExpanded);
    });

    el.addGoalBtn.addEventListener("click", function () {
      openGoalForm(null);
    });

    el.shareGoalsBtn.addEventListener("click", shareGoalsImage);

    el.shareDayBtn.addEventListener("click", shareDayImage);
    el.shareWeekBtn.addEventListener("click", shareWeekImage);
    el.exportBtn.addEventListener("click", exportData);
    el.importBtn.addEventListener("click", function () { el.importFile.click(); });
    el.importFile.addEventListener("change", handleImport);
    el.wipeBtn.addEventListener("click", wipeAll);

    el.settingsBtn.addEventListener("click", function () {
      el.settingsModal.hidden = false;
    });

    el.closeSettings.addEventListener("click", function () {
      el.settingsModal.hidden = true;
    });

    el.settingsModal.addEventListener("click", function (ev) {
      if (ev.target === el.settingsModal) el.settingsModal.hidden = true;
    });
  }

  function validateForm() {
    var start = el.startInput.value, end = el.endInput.value;
    if (start && end) {
      if (toMin(end) <= toMin(start)) {
        el.formHint.textContent = "El fin debe ser posterior al inicio.";
        el.formHint.classList.remove("ok");
      } else {
        el.formHint.textContent = "Duración: " + fmtDuration(toMin(end) - toMin(start));
        el.formHint.classList.add("ok");
      }
    } else {
      el.formHint.textContent = "";
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ---------------------------------------------------------------
  // Share day as image
  // ---------------------------------------------------------------
  function formatDateEs(dateStr) {
    var d = strToDate(dateStr);
    var s = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var words = text.split(" ");
    var line = "";
    var lines = [];
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = lines[maxLines - 1].replace(/\s+\S*$/, "") + "…";
    }
    lines.forEach(function (l, idx) {
      ctx.fillText(l, x, y + idx * lineHeight);
    });
    return lines.length;
  }

  function buildShareCanvas() {
    var W = 1080, H = 1350;
    var canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext("2d");

    var COL_BG = "#10142a";
    var COL_CARD = "#1b2145";
    var COL_TEXT = "#edeff9";
    var COL_MUTED = "#92a0c9";
    var COL_MUTED2 = "#5f6a94";
    var COL_ACCENT = "#f2b84b";
    var FONT_SANS = '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    var FONT_MONO = '"SFMono-Regular", Menlo, Consolas, monospace';

    // background + faint grid
    ctx.fillStyle = COL_BG;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(146,160,201,0.07)";
    ctx.lineWidth = 1;
    for (var gx = 0; gx <= W; gx += 36) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (var gy = 0; gy <= H; gy += 36) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    var entries = getEntries(state.selectedDate);
    var validEntries = entries.filter(function (e) { return toMin(e.start) < toMin(e.end); });
    var segs = computeDaySegments(entries);
    var agg = aggregateSegments(segs);
    var isToday = state.selectedDate === todayStr();
    var unknownMin = agg["Desconocido"] || 0;
    var trackedMin = DAY_MIN - unknownMin;
    var distinctTasks = Object.keys(agg).filter(function (t) { return t !== "Desconocido"; });

    // header
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = COL_ACCENT;
    ctx.font = "700 42px " + FONT_SANS;
    ctx.fillText("◐ Bitácora", 64, 96);

    ctx.fillStyle = COL_MUTED;
    ctx.font = "500 30px " + FONT_SANS;
    ctx.fillText(formatDateEs(state.selectedDate), 64, 140);

    // day dial
    var cx = W / 2, cy = 430, r = 225, ringW = 68;
    function angleFor(min) { return (min / DAY_MIN) * Math.PI * 2 - Math.PI / 2; }

    ctx.lineWidth = ringW;
    ctx.lineCap = "butt";
    if (segs.length === 0 || validEntries.length === 0) {
      ctx.strokeStyle = COL_CARD;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      segs.forEach(function (s) {
        if (s.task === "Desconocido") return;
        if (s.end - s.start <= 0) return;
        ctx.strokeStyle = taskColor(s.task);
        ctx.beginPath();
        ctx.arc(cx, cy, r, angleFor(s.start), angleFor(s.end));
        ctx.stroke();
      });
    }

    if (isToday) {
      var nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      var na = angleFor(nowMin);
      ctx.strokeStyle = COL_BG;
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx + (r - ringW / 2 - 4) * Math.cos(na), cy + (r - ringW / 2 - 4) * Math.sin(na));
      ctx.lineTo(cx + (r + ringW / 2 + 4) * Math.cos(na), cy + (r + ringW / 2 + 4) * Math.sin(na));
      ctx.stroke();
    }

    // center text
    ctx.textAlign = "center";
    ctx.fillStyle = COL_TEXT;
    ctx.font = "700 58px " + FONT_MONO;
    ctx.fillText(fmtDuration(trackedMin), cx, cy + 14);
    ctx.fillStyle = COL_MUTED;
    ctx.font = "600 22px " + FONT_SANS;
    ctx.fillText("REGISTRADO", cx, cy + 50);
    ctx.textAlign = "left";

    // stats row
    var statY = 760;
    var stats = [
      [fmtDuration(trackedMin), "Registrado"],
      [String(distinctTasks.length), "Tareas"],
      [String(validEntries.length), "Registros"]
    ];
    var colW = (W - 128) / 3;
    stats.forEach(function (st, i) {
      var x = 64 + colW * i + colW / 2;
      ctx.textAlign = "center";
      ctx.fillStyle = i === 0 ? COL_ACCENT : COL_TEXT;
      ctx.font = "700 34px " + FONT_MONO;
      ctx.fillText(st[0], x, statY);
      ctx.fillStyle = COL_MUTED;
      ctx.font = "600 18px " + FONT_SANS;
      ctx.fillText(st[1].toUpperCase(), x, statY + 30);
    });
    ctx.textAlign = "left";

    // divider
    ctx.strokeStyle = "rgba(146,160,201,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(64, 830); ctx.lineTo(W - 64, 830); ctx.stroke();

    // ranking
    var rankY = 890;
    ctx.fillStyle = COL_TEXT;
    ctx.font = "700 28px " + FONT_SANS;
    ctx.fillText("Reparto por tarea", 64, rankY);
    rankY += 42;

    var sorted = Object.keys(agg)
      .filter(function (t) { return t !== "Desconocido"; })
      .map(function (t) { return [t, agg[t]]; })
      .sort(function (a, b) { return b[1] - a[1]; });
    var maxMin = sorted.length ? sorted[0][1] : 1;
    var shown = sorted.slice(0, 6);

    if (shown.length === 0) {
      ctx.fillStyle = COL_MUTED;
      ctx.font = "500 22px " + FONT_SANS;
      ctx.fillText("Todavía no hay tareas registradas.", 64, rankY);
      rankY += 40;
    }

    shown.forEach(function (pair) {
      var task = pair[0], min = pair[1];
      var pct = Math.round((min / DAY_MIN) * 100);

      ctx.fillStyle = taskColor(task);
      roundRectPath(ctx, 64, rankY - 20, 20, 20, 5);
      ctx.fill();

      ctx.fillStyle = COL_TEXT;
      ctx.font = "600 24px " + FONT_SANS;
      var label = task.length > 26 ? task.slice(0, 25) + "…" : task;
      ctx.fillText(label, 96, rankY - 3);

      ctx.textAlign = "right";
      ctx.fillStyle = COL_MUTED;
      ctx.font = "600 22px " + FONT_MONO;
      ctx.fillText(fmtDuration(min) + " · " + pct + "%", W - 64, rankY - 3);
      ctx.textAlign = "left";

      var trackW = W - 128;
      ctx.fillStyle = "rgba(146,160,201,0.12)";
      roundRectPath(ctx, 64, rankY + 12, trackW, 12, 6);
      ctx.fill();

      ctx.fillStyle = taskColor(task);
      var fillW = Math.max(14, (min / maxMin) * trackW);
      roundRectPath(ctx, 64, rankY + 12, fillW, 12, 6);
      ctx.fill();

      rankY += 62;
    });

    if (sorted.length > 6) {
      ctx.fillStyle = COL_MUTED2;
      ctx.font = "500 20px " + FONT_SANS;
      ctx.fillText("+ " + (sorted.length - 6) + " tarea(s) más", 64, rankY + 4);
      rankY += 40;
    }

    // insight
    if (validEntries.length > 0) {
      var top = sorted[0];
      var pctTop = Math.round((top[1] / DAY_MIN) * 100);
      var insight = "Tarea principal: " + top[0] + " (" + fmtDuration(top[1]) + ", " + pctTop + "% del día).";
      ctx.fillStyle = COL_MUTED;
      ctx.font = "500 22px " + FONT_SANS;
      wrapCanvasText(ctx, insight, 64, rankY + 36, W - 128, 30, 2);
    }

    // footer
    ctx.fillStyle = COL_MUTED2;
    ctx.font = "500 20px " + FONT_SANS;
    ctx.textAlign = "center";
    ctx.fillText("Generado con Bitácora", W / 2, H - 40);
    ctx.textAlign = "left";

    return canvas;
  }

  function buildWeekShareCanvas() {
    var W = 1080, H = 1350;
    var canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext("2d");

    var COL_BG = "#10142a";
    var COL_TEXT = "#edeff9";
    var COL_MUTED = "#92a0c9";
    var COL_MUTED2 = "#5f6a94";
    var COL_ACCENT = "#f2b84b";
    var FONT_SANS = '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    var FONT_MONO = '"SFMono-Regular", Menlo, Consolas, monospace';

    // background + faint grid
    ctx.fillStyle = COL_BG;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(146,160,201,0.07)";
    ctx.lineWidth = 1;
    for (var gx = 0; gx <= W; gx += 36) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (var gy = 0; gy <= H; gy += 36) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    var days = getHeatmapDays(state.selectedDate);

    // Agregado del rango (ignorando "Desconocido") + segmentos por día para el grid
    var weekAgg = {};
    var daysWithData = 0;
    var totalTracked = 0;
    var perDaySegs = {};
    days.forEach(function (dateStr) {
      var entries = getEntries(dateStr);
      if (entries.length) {
        daysWithData++;
        var segs = computeDaySegments(entries);
        perDaySegs[dateStr] = segs;
        var agg = aggregateSegments(segs);
        Object.keys(agg).forEach(function (t) {
          if (t === "Desconocido") return;
          weekAgg[t] = (weekAgg[t] || 0) + agg[t];
          totalTracked += agg[t];
        });
      } else {
        perDaySegs[dateStr] = [];
      }
    });

    var distinctTasks = Object.keys(weekAgg);

    // header
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = COL_ACCENT;
    ctx.font = "700 42px " + FONT_SANS;
    ctx.fillText("◐ Bitácora", 64, 96);

    ctx.fillStyle = COL_MUTED;
    ctx.font = "500 26px " + FONT_SANS;
    ctx.fillText("Últimos 14 días · hasta " + formatDateEs(state.selectedDate), 64, 136);

    // stats row
    var statY = 200;
    var stats = [
      [fmtDuration(totalTracked), "Total registrado"],
      [daysWithData + "/14", "Días con registros"],
      [String(distinctTasks.length), "Tareas distintas"]
    ];
    var colW = (W - 128) / 3;
    stats.forEach(function (st, i) {
      var x = 64 + colW * i + colW / 2;
      ctx.textAlign = "center";
      ctx.fillStyle = i === 0 ? COL_ACCENT : COL_TEXT;
      ctx.font = "700 32px " + FONT_MONO;
      ctx.fillText(st[0], x, statY);
      ctx.fillStyle = COL_MUTED;
      ctx.font = "600 17px " + FONT_SANS;
      ctx.fillText(st[1].toUpperCase(), x, statY + 28);
    });
    ctx.textAlign = "left";

    ctx.strokeStyle = "rgba(146,160,201,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(64, 250); ctx.lineTo(W - 64, 250); ctx.stroke();

    // grid del mapa de calor
    var marginX = 64;
    var dayLabelW = 74;
    var cellW = 33, cellGap = 2;
    var cellH = 32, rowGap = 2;
    var gridLeft = marginX + dayLabelW;
    var gridTop = 300;

    ctx.fillStyle = COL_TEXT;
    ctx.font = "700 26px " + FONT_SANS;
    ctx.fillText("Mapa de calor por hora", marginX, gridTop - 20);

    // etiquetas de horas
    var hourLabelY = gridTop + 14;
    ctx.font = "600 14px " + FONT_MONO;
    ctx.fillStyle = COL_MUTED2;
    ctx.textAlign = "center";
    for (var h = 0; h < 24; h++) {
      if (h % 3 === 0) {
        var hx = gridLeft + h * (cellW + cellGap) + cellW / 2;
        ctx.fillText(String(h), hx, hourLabelY);
      }
    }
    ctx.textAlign = "left";

    var rowsTop = gridTop + 32;
    days.forEach(function (dateStr, idx) {
      var y = rowsTop + idx * (cellH + rowGap);
      ctx.fillStyle = COL_MUTED;
      ctx.font = "500 15px " + FONT_MONO;
      ctx.textAlign = "right";
      ctx.fillText(dateStr.slice(5), gridLeft - 10, y + cellH / 2 + 5);
      ctx.textAlign = "left";

      var segs = perDaySegs[dateStr];
      for (var hr = 0; hr < 24; hr++) {
        var x = gridLeft + hr * (cellW + cellGap);
        var best = segs.length ? bestTaskForHour(segs, hr) : null;
        if (best) {
          var opacity = 0.35 + 0.65 * (best.min / 60);
          ctx.globalAlpha = opacity;
          ctx.fillStyle = taskColor(best.task);
        } else {
          ctx.globalAlpha = 1;
          ctx.fillStyle = "rgba(146,160,201,0.08)";
        }
        roundRectPath(ctx, x, y, cellW, cellH, 4);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    });

    var gridBottom = rowsTop + 14 * (cellH + rowGap);

    // ranking de tareas del rango
    var rankY = gridBottom + 60;
    ctx.fillStyle = COL_TEXT;
    ctx.font = "700 28px " + FONT_SANS;
    ctx.fillText("Reparto por tarea (14 días)", 64, rankY);
    rankY += 42;

    var sorted = distinctTasks
      .map(function (t) { return [t, weekAgg[t]]; })
      .sort(function (a, b) { return b[1] - a[1]; });
    var maxMin = sorted.length ? sorted[0][1] : 1;
    var shown = sorted.slice(0, 6);

    if (shown.length === 0) {
      ctx.fillStyle = COL_MUTED;
      ctx.font = "500 22px " + FONT_SANS;
      ctx.fillText("Todavía no hay tareas registradas en este periodo.", 64, rankY);
      rankY += 40;
    }

    shown.forEach(function (pair) {
      var task = pair[0], min = pair[1];
      var pct = totalTracked > 0 ? Math.round((min / totalTracked) * 100) : 0;

      ctx.fillStyle = taskColor(task);
      roundRectPath(ctx, 64, rankY - 20, 20, 20, 5);
      ctx.fill();

      ctx.fillStyle = COL_TEXT;
      ctx.font = "600 24px " + FONT_SANS;
      var label = task.length > 24 ? task.slice(0, 23) + "…" : task;
      ctx.fillText(label, 96, rankY - 3);

      ctx.textAlign = "right";
      ctx.fillStyle = COL_MUTED;
      ctx.font = "600 22px " + FONT_MONO;
      ctx.fillText(fmtDuration(min) + " · " + pct + "%", W - 64, rankY - 3);
      ctx.textAlign = "left";

      var trackW = W - 128;
      ctx.fillStyle = "rgba(146,160,201,0.12)";
      roundRectPath(ctx, 64, rankY + 12, trackW, 12, 6);
      ctx.fill();

      ctx.fillStyle = taskColor(task);
      var fillW = Math.max(14, (min / maxMin) * trackW);
      roundRectPath(ctx, 64, rankY + 12, fillW, 12, 6);
      ctx.fill();

      rankY += 62;
    });

    if (sorted.length > 6) {
      ctx.fillStyle = COL_MUTED2;
      ctx.font = "500 20px " + FONT_SANS;
      ctx.fillText("+ " + (sorted.length - 6) + " tarea(s) más", 64, rankY + 4);
      rankY += 40;
    }

    // footer
    ctx.fillStyle = COL_MUTED2;
    ctx.font = "500 20px " + FONT_SANS;
    ctx.textAlign = "center";
    ctx.fillText("Generado con Bitácora", W / 2, H - 40);
    ctx.textAlign = "left";

    return canvas;
  }

  function roundRectPath(ctx, x, y, w, h, radius) {
    var r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function shareCanvasImage(canvas, filenameBase, shareTitle, shareText) {
    canvas.toBlob(function (blob) {
      if (!blob) { showToast("No se pudo generar la imagen"); return; }
      var filename = filenameBase + ".png";
      var fallbackToDownload = function (reason) {
        downloadBlob(blob, filename);
        showToast(reason || "Imagen descargada");
      };

      var file;
      try {
        file = new File([blob], filename, { type: "image/png" });
      } catch (e) {
        fallbackToDownload("Imagen descargada");
        return;
      }

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({
          files: [file],
          title: shareTitle,
          text: shareText
        }).catch(function (err) {
          if (err && err.name !== "AbortError") {
            fallbackToDownload("No se pudo compartir, imagen descargada");
          }
        });
      } else {
        fallbackToDownload("Tu navegador no admite compartir imágenes: descargada");
      }
    }, "image/png");
  }

  function shareDayImage() {
    var canvas;
    try {
      canvas = buildShareCanvas();
    } catch (e) {
      console.error(e);
      showToast("No se pudo generar la imagen");
      return;
    }

    shareCanvasImage(
      canvas,
      "bitacora-" + state.selectedDate,
      "Bitácora — " + state.selectedDate,
      "Así se reparte mi " + formatDateEs(state.selectedDate).toLowerCase() + " en Bitácora."
    );
  }

  function buildGoalsShareCanvas() {
    var goals = loadGoals();
    var entries = getEntries(state.selectedDate);
    var rows = goals.map(function (goal) {
      return { goal: goal, result: computeGoalStatus(goal, state.selectedDate, entries) };
    });

    var W = 1080;
    var COL_BG = "#10142a";
    var COL_TEXT = "#edeff9";
    var COL_MUTED = "#92a0c9";
    var COL_MUTED2 = "#5f6a94";
    var COL_ACCENT = "#f2b84b";
    var COL_TEAL = "#57d9c9";
    var COL_DANGER = "#ec6f7e";
    var FONT_SANS = '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    var FONT_MONO = '"SFMono-Regular", Menlo, Consolas, monospace';

    var STATUS_COLOR = { met: COL_TEAL, partial: COL_ACCENT, missed: COL_DANGER, pending: COL_MUTED2 };
    var STATUS_LABEL = { met: "CUMPLIDA", partial: "PARCIAL", missed: "NO CUMPLIDA", pending: "PENDIENTE" };

    var headerH = 200;
    var rowH = 140;
    var footerH = 70;
    var emptyH = 120;
    var H = headerH + (rows.length ? rows.length * rowH : emptyH) + footerH;

    var canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext("2d");

    ctx.fillStyle = COL_BG;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(146,160,201,0.07)";
    ctx.lineWidth = 1;
    for (var gx = 0; gx <= W; gx += 36) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (var gy = 0; gy <= H; gy += 36) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = COL_ACCENT;
    ctx.font = "700 42px " + FONT_SANS;
    ctx.fillText("◐ Bitácora", 64, 96);

    ctx.fillStyle = COL_MUTED;
    ctx.font = "500 28px " + FONT_SANS;
    ctx.fillText("Metas — " + formatDateEs(state.selectedDate), 64, 138);

    ctx.strokeStyle = "rgba(146,160,201,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(64, 168); ctx.lineTo(W - 64, 168); ctx.stroke();

    var y = headerH;

    if (rows.length === 0) {
      ctx.fillStyle = COL_MUTED;
      ctx.font = "500 26px " + FONT_SANS;
      ctx.fillText("Todavía no hay metas definidas.", 64, y + 60);
    } else {
      rows.forEach(function (r) {
        var color = STATUS_COLOR[r.result.status];

        // left color bar
        ctx.fillStyle = color;
        roundRectPath(ctx, 64, y + 14, 8, rowH - 34, 4);
        ctx.fill();

        var textX = 92;

        ctx.fillStyle = COL_TEXT;
        ctx.font = "700 30px " + FONT_SANS;
        var label = (r.goal.label || r.goal.keyword);
        if (label.length > 34) label = label.slice(0, 33) + "…";
        ctx.fillText(label, textX, y + 40);

        ctx.textAlign = "right";
        ctx.fillStyle = color;
        ctx.font = "700 20px " + FONT_MONO;
        ctx.fillText(STATUS_LABEL[r.result.status], W - 64, y + 38);
        ctx.textAlign = "left";

        ctx.fillStyle = COL_MUTED;
        ctx.font = "500 22px " + FONT_SANS;
        var meta = goalMetaText(r.goal);
        if (meta.length > 62) meta = meta.slice(0, 61) + "…";
        ctx.fillText(meta, textX, y + 72);

        ctx.fillStyle = color;
        ctx.font = "600 22px " + FONT_MONO;
        ctx.fillText(goalResultText(r.result), textX, y + 104);

        y += rowH;
      });
    }

    ctx.fillStyle = COL_MUTED2;
    ctx.font = "500 20px " + FONT_SANS;
    ctx.textAlign = "center";
    ctx.fillText("Generado con Bitácora", W / 2, H - 30);
    ctx.textAlign = "left";

    return canvas;
  }

  function shareGoalsImage() {
    var goals = loadGoals();
    if (goals.length === 0) {
      showToast("Todavía no tienes metas que compartir");
      return;
    }

    var canvas;
    try {
      canvas = buildGoalsShareCanvas();
    } catch (e) {
      console.error(e);
      showToast("No se pudo generar la imagen");
      return;
    }

    shareCanvasImage(
      canvas,
      "bitacora-metas-" + state.selectedDate,
      "Bitácora — Metas " + state.selectedDate,
      "Así van mis metas el " + formatDateEs(state.selectedDate).toLowerCase() + " en Bitácora."
    );
  }

  function shareWeekImage() {
    var canvas;
    try {
      canvas = buildWeekShareCanvas();
    } catch (e) {
      console.error(e);
      showToast("No se pudo generar la imagen");
      return;
    }

    shareCanvasImage(
      canvas,
      "bitacora-semana-" + state.selectedDate,
      "Bitácora — últimos 14 días",
      "Así se reparte mi tiempo en los últimos 14 días en Bitácora."
    );
  }

  // ---------------------------------------------------------------
  // Export / Import / Wipe
  // ---------------------------------------------------------------
  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportData() {
    var all = loadAll();
    var goals = loadGoals();
    var payload = { exportedAt: new Date().toISOString(), app: "bitacora", version: 2, data: all, goals: goals };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    downloadBlob(blob, "bitacora-backup-" + todayStr() + ".json");
    showToast("Exportado " + Object.keys(all).length + " día(s)");
  }

  function handleImport(ev) {
    var file = ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        var incoming = parsed && parsed.data ? parsed.data : parsed;
        if (!incoming || typeof incoming !== "object") throw new Error("Formato no reconocido");

        var dayCount = Object.keys(incoming).length;
        var incomingGoals = parsed && Array.isArray(parsed.goals) ? parsed.goals : null;
        var goalMsg = incomingGoals ? (" y " + incomingGoals.length + " meta(s)") : "";
        if (!confirm("Se importarán " + dayCount + " día(s)" + goalMsg + ". Los días que ya existan localmente se sobrescribirán. ¿Continuar?")) {
          el.importFile.value = "";
          return;
        }

        var all = loadAll();
        Object.keys(incoming).forEach(function (d) {
          if (Array.isArray(incoming[d])) all[d] = incoming[d];
        });
        saveAll(all);

        if (incomingGoals) {
          saveGoals(incomingGoals);
        }

        renderAll();
        showToast("Importado correctamente");
      } catch (e) {
        console.error(e);
        showToast("El archivo no es una copia válida");
      }
      el.importFile.value = "";
    };
    reader.readAsText(file);
  }

  function wipeAll() {
    if (!confirm("Esto borrará TODOS los días guardados en este dispositivo. Exporta antes si quieres conservarlos. ¿Seguro?")) return;
    if (!confirm("Última confirmación: se perderán todos los datos (incluidas las metas). ¿Continuar?")) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_GOALS);
    state.selectedDate = todayStr();
    renderAll();
    showToast("Datos borrados");
  }

  // ---------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", function () {
    cacheDom();
    wireEvents();
    renderAll();
  });
})();