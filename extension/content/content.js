// formKeep — content script : détection (US1), capture (US2), remplissage (US3).
// Le stockage est la source de vérité unique : la popup écrit, on se synchronise
// via chrome.storage.onChanged (research R5).
(function () {
  "use strict";

  const FP = globalThis.FormKeep.fingerprint;
  const Store = globalThis.FormKeep.storage;

  const ORIGIN = location.origin;
  const PATH = location.pathname;

  // id → { element, isForm, fields (avec refs DOM), occurrence, generatedLabel }
  const registry = new Map();
  // id → TrackedForm stocké, restreint aux formulaires présents sur cette page
  const tracked = new Map();

  // ---------- Détection (T009, research R2/R3) ----------

  // Sélecteur de « mécanisme de soumission » volontairement large : les apps
  // modernes utilisent souvent des <div>/<a> stylés en bouton (CSS modules,
  // Tailwind…) plutôt qu'un vrai <button>.
  const SUBMIT_CONTROL =
    'button, input[type="submit"], input[type="button"], [role="button"], ' +
    '[class*="btn" i], [class*="button" i], [class*="submit" i], ' +
    'a:not([href]), a[href="#"]';

  // Pseudo-formulaires : inputs hors <form> dont un conteneur ancêtre possède
  // un mécanisme de soumission. Conteneurs imbriqués dédupliqués.
  function findPseudoForms(doc) {
    const orphans = [...doc.querySelectorAll("input, select, textarea")].filter(
      (el) => !el.closest("form")
    );
    const containers = new Set();
    for (const el of orphans) {
      let node = el.parentElement;
      let depth = 0;
      // Profondeur 12 : les arbres de composants (React & co) sont profonds.
      while (node && depth < 12 && node !== doc.body && node !== doc.documentElement) {
        if (node.querySelector(SUBMIT_CONTROL)) {
          containers.add(node);
          break;
        }
        node = node.parentElement;
        depth++;
      }
    }
    return [...containers].filter(
      (c) => ![...containers].some((other) => other !== c && other.contains(c))
    );
  }

  function scan() {
    registry.clear();
    const candidates = [];
    const realForms = document.querySelectorAll("form");
    for (const form of realForms) {
      candidates.push({ element: form, isForm: true });
    }
    const pseudo = findPseudoForms(document);
    for (const el of pseudo) {
      candidates.push({ element: el, isForm: false });
    }
    // Diagnostic visible en console (niveau Verbose) à chaque scan.
    const controls = document.querySelectorAll("input, select, textarea");
    const orphanCount = [...controls].filter((el) => !el.closest("form")).length;
    console.debug(
      `[formKeep] scan ${location.pathname} — ${realForms.length} <form>, ` +
        `${pseudo.length} pseudo-formulaire(s), ${controls.length} champ(s) dont ${orphanCount} hors <form>`
    );

    const occurrences = new Map(); // baseHash → compteur (formulaires identiques)
    for (const cand of candidates) {
      const fields = FP.extractFields(cand.element);
      if (fields.length === 0) continue;
      const base = FP.baseHash(ORIGIN, PATH, fields);
      const occ = occurrences.get(base) || 0;
      occurrences.set(base, occ + 1);
      registry.set(`${base}_${occ}`, {
        element: cand.element,
        isForm: cand.isForm,
        fields,
        occurrence: occ,
        generatedLabel: FP.generatedLabel(cand.element, fields),
      });
    }
  }

  async function refreshTracked() {
    tracked.clear();
    const all = await Store.getAllForms();
    const now = Date.now();
    const orphans = [];
    for (const form of all) {
      if (registry.has(form.id)) {
        tracked.set(form.id, form);
        // lastSeenAt : au plus une écriture par minute pour éviter les boucles
        // d'événements onChanged (le rafraîchissement relit sans réécrire).
        if (now - (form.lastSeenAt || 0) > 60000) {
          form.lastSeenAt = now;
          await Store.saveForm(form);
        }
      } else if (form.origin === ORIGIN && form.path === PATH) {
        // Enregistrement suivi de CETTE page dont l'empreinte ne correspond
        // plus : la structure du formulaire a probablement changé (site en dev).
        orphans.push(form);
      }
    }
    await adoptOrphan(orphans, now);
    sendStatus();
    // Un souci d'affichage du chip ne doit JAMAIS casser détection/capture.
    try {
      updateChips();
    } catch (err) {
      console.warn("[formKeep] chip:", err);
    }
  }

  // Auto-réparation d'identité : quand la structure d'un formulaire suivi a
  // dérivé (rebuild du site en dev), son empreinte change et l'enregistrement
  // devient orphelin. On le ré-associe prudemment au formulaire actuel de la
  // page : un seul orphelin, meilleur candidat non suivi avec ≥ 50 % de champs
  // communs et sans ambiguïté. Les jeux de données sont ainsi préservés.
  async function adoptOrphan(orphans, now) {
    if (orphans.length !== 1) return;
    const orphan = orphans[0];
    const oldKeys = new Set((orphan.fields || []).map((f) => `${f.key}|${f.type}`));
    const scored = [...registry.entries()]
      .filter(([id]) => !tracked.has(id))
      .map(([id, entry]) => {
        const keys = entry.fields.map((f) => `${f.key}|${f.type}`);
        const common = keys.filter((k) => oldKeys.has(k)).length;
        return { id, entry, score: common / (Math.max(oldKeys.size, keys.length) || 1) };
      })
      .filter((c) => c.score >= 0.5)
      .sort((a, b) => b.score - a.score);
    if (!scored.length) return;
    if (scored.length > 1 && scored[0].score === scored[1].score) return; // ambigu
    const { id: newId, entry } = scored[0];
    const oldId = orphan.id;
    orphan.id = newId;
    orphan.occurrence = entry.occurrence;
    orphan.fields = FP.toPlainFields(entry.fields);
    orphan.lastSeenAt = now;
    await Store.deleteForm(oldId);
    await Store.saveForm(orphan);
    tracked.set(newId, orphan);
    console.debug(`[formKeep] identité migrée ${oldId} → ${newId} (« ${orphan.label} »)`);
  }

  async function rescan() {
    scan();
    await refreshTracked();
  }

  // ---------- Badge (T020, research R9) ----------

  function sendStatus() {
    let count = 0;
    for (const form of tracked.values()) {
      if (Object.keys(form.datasets || {}).length > 0) count++;
    }
    try {
      chrome.runtime.sendMessage({ type: "PAGE_STATUS", trackedFormsWithData: count });
    } catch {
      // Extension rechargée : le contexte n'existe plus, sans conséquence.
    }
  }

  // ---------- Observation du DOM (research R3) ----------

  let debounceTimer = null;
  // Nos propres nœuds (chips in-page) sont exclus pour éviter les boucles de rescan.
  const isOurs = (n) =>
    n.nodeType === 1 && (n.dataset?.formkeep || n.closest?.("[data-formkeep]"));
  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((m) =>
      [...m.addedNodes, ...m.removedNodes].some(
        (n) =>
          n.nodeType === 1 &&
          !isOurs(n) &&
          (n.matches?.("form, input, select, textarea, button") ||
            n.querySelector?.("form, input, select, textarea, button"))
      )
    );
    if (!relevant) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(rescan, 300);
  });

  // ---------- Capture à la soumission (T016/T017, research R4) ----------

  // Sérialisation synchrone des valeurs (encodage data-model.md FieldValue).
  function currentValues(entry) {
    const values = {};
    for (const field of entry.fields) {
      const els = field.elements.filter((el) => el.isConnected);
      if (els.length === 0) continue;
      const first = els[0];
      switch (field.type) {
        case "checkbox":
          values[field.key] =
            els.length > 1
              ? els.filter((el) => el.checked).map((el) => el.value)
              : first.checked;
          break;
        case "radio": {
          const checked = els.find((el) => el.checked);
          values[field.key] = checked ? checked.value : "";
          break;
        }
        case "select-multiple":
          values[field.key] = [...first.selectedOptions].map((o) => o.value);
          break;
        default:
          values[field.key] = first.value;
      }
    }
    return values;
  }

  // Lecture 100 % synchrone des valeurs (avant toute navigation éventuelle),
  // puis persistance asynchrone (research R4).
  function capture(id) {
    const entry = registry.get(id);
    if (!entry) return;
    // La structure a pu dériver depuis le tag : on relit les champs à jour.
    entry.fields = FP.extractFields(entry.element);
    const values = currentValues(entry);
    persistCapture(id, entry, values);
  }

  async function persistCapture(id, entry, values) {
    const form = await Store.getForm(id);
    if (!form) return;
    const now = Date.now();
    const active = form.activeDatasetId ? form.datasets[form.activeDatasetId] : null;
    if (active) {
      // Dataset actif mis à jour en place (hypothèse documentée de la spec)
      active.values = values;
      active.updatedAt = now;
    } else {
      const dsId = Store.newDatasetId();
      const stamp = new Date(now);
      const name = Store.uniqueDatasetName(
        form,
        `Capture ${stamp.toISOString().slice(0, 10)} ${stamp.toTimeString().slice(0, 5)}`
      );
      form.datasets[dsId] = { id: dsId, name, values, createdAt: now, updatedAt: now };
      form.activeDatasetId = dsId;
    }
    form.fields = FP.toPlainFields(entry.fields);
    form.lastSeenAt = now;
    await Store.saveForm(form);
  }

  // Jamais de preventDefault : la soumission du site n'est pas altérée (US2 scén. 5).
  document.addEventListener(
    "submit",
    (e) => {
      for (const [id, entry] of registry) {
        if (entry.isForm && entry.element === e.target && tracked.has(id)) {
          capture(id);
          break;
        }
      }
    },
    true
  );

  // Pseudo-formulaires : la « soumission » est un clic sur leur bouton.
  document.addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest?.('button, [type="submit"], [role="button"]');
      if (!btn) return;
      for (const [id, entry] of registry) {
        if (!entry.isForm && entry.element.contains(btn) && tracked.has(id)) {
          capture(id);
          break;
        }
      }
    },
    true
  );

  // ---------- Remplissage (T018, FR-015) ----------

  function setFieldValue(field, value) {
    const els = field.elements.filter((el) => el.isConnected);
    if (els.length === 0) return false;
    const fire = (el) => {
      // input + change pour la réactivité des frameworks (React, Vue…)
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    switch (field.type) {
      case "checkbox":
        if (els.length > 1) {
          const arr = Array.isArray(value) ? value : [];
          for (const el of els) {
            el.checked = arr.includes(el.value);
            fire(el);
          }
        } else {
          els[0].checked = value === true;
          fire(els[0]);
        }
        return true;
      case "radio": {
        if (typeof value !== "string") return false;
        for (const el of els) el.checked = el.value === value;
        const sel = els.find((el) => el.checked);
        if (sel) fire(sel);
        return true;
      }
      case "select-multiple": {
        const arr = Array.isArray(value) ? value : [];
        for (const opt of els[0].options) opt.selected = arr.includes(opt.value);
        fire(els[0]);
        return true;
      }
      default:
        if (typeof value !== "string") return false;
        els[0].value = value;
        fire(els[0]);
        return true;
    }
  }

  async function fillForm(formId, datasetId) {
    const entry = registry.get(formId);
    if (!entry) return { ok: false, error: "FORM_NOT_FOUND" };
    const form = await Store.getForm(formId);
    const ds = form?.datasets?.[datasetId || form?.activeDatasetId];
    if (!ds) return { ok: false, error: "DATASET_NOT_FOUND" };
    entry.fields = FP.extractFields(entry.element);
    const byKey = new Map(entry.fields.map((f) => [f.key, f]));
    let filled = 0;
    let skipped = 0;
    for (const [key, value] of Object.entries(ds.values)) {
      const field = byKey.get(key);
      if (field && setFieldValue(field, value)) filled++;
      else skipped++; // entrée sans champ correspondant : ignorée sans erreur
    }
    return { ok: true, filled, skipped };
  }

  // ---------- Surlignage temporaire (T013) ----------

  function highlight(formId) {
    const entry = registry.get(formId);
    if (!entry) return { ok: false, error: "FORM_NOT_FOUND" };
    const el = entry.element;
    const prev = { outline: el.style.outline, offset: el.style.outlineOffset };
    el.style.outline = "3px solid #0f7a57";
    el.style.outlineOffset = "2px";
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => {
      el.style.outline = prev.outline;
      el.style.outlineOffset = prev.offset;
    }, 1500);
    return { ok: true };
  }

  // ---------- Messages (T012/T013, contracts/messages.md) ----------

  function handleMessage(msg) {
    switch (msg?.type) {
      case "GET_FORMS": {
        const forms = [];
        for (const [id, entry] of registry) {
          const t = tracked.get(id);
          forms.push({
            id,
            tracked: !!t,
            label: t ? t.label : entry.generatedLabel,
            generatedLabel: entry.generatedLabel,
            fieldCount: entry.fields.length,
            hasDatasets: !!t && Object.keys(t.datasets || {}).length > 0,
            activeDatasetId: t ? t.activeDatasetId : null,
            occurrence: entry.occurrence,
          });
        }
        return { forms };
      }
      case "GET_FORM_FIELDS": {
        const entry = registry.get(msg.formId);
        if (!entry) return { ok: false, error: "FORM_NOT_FOUND" };
        entry.fields = FP.extractFields(entry.element);
        return { ok: true, fields: FP.toPlainFields(entry.fields) };
      }
      case "HIGHLIGHT_FORM":
        return highlight(msg.formId);
      case "FILL_FORM":
        return fillForm(msg.formId, msg.datasetId);
      default:
        return undefined;
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const result = handleMessage(msg);
    if (result === undefined) return false;
    Promise.resolve(result).then(sendResponse);
    return true; // réponse asynchrone possible (FILL_FORM)
  });

  // Popup et captures écrivent dans le stockage → on se resynchronise.
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === "local") refreshTracked();
  });

  // ---------- Chip in-page « Remplir » (US3/FR-016, décision utilisateur 2026-07-02) ----------
  // Petit badge ancré au coin supérieur droit de chaque formulaire suivi ayant
  // des données. Hébergé dans document.body (aucun impact sur la mise en page du
  // site) et marqué data-formkeep pour être ignoré par le MutationObserver.
  // Le remplissage reste déclenché par un clic utilisateur (Constitution II).

  const chips = new Map(); // formId → { host, btn, menu }
  const CHIP_LABEL = "fK · Remplir";

  function positionChip(host, el) {
    const rect = el.getBoundingClientRect();
    host.style.top = `${Math.max(0, rect.top + window.scrollY - 12)}px`;
    host.style.left = `${rect.right + window.scrollX - 8}px`;
  }

  function closeChipMenus() {
    for (const chip of chips.values()) {
      if (chip.menu) {
        chip.menu.remove();
        chip.menu = null;
      }
    }
  }

  function removeChip(id) {
    const chip = chips.get(id);
    if (chip) {
      chip.host.remove();
      chips.delete(id);
    }
  }

  async function fillFromChip(id, datasetId, chip) {
    const res = await fillForm(id, datasetId);
    chip.btn.textContent = res.ok ? `✓ ${res.filled} champ(s)` : "⚠ échec";
    setTimeout(() => {
      chip.btn.textContent = CHIP_LABEL;
    }, 1600);
  }

  async function onChipClick(id) {
    const chip = chips.get(id);
    const form = await Store.getForm(id);
    if (!chip || !form) return;
    const datasets = Object.values(form.datasets || {});
    if (datasets.length <= 1) {
      fillFromChip(id, form.activeDatasetId, chip);
      return;
    }
    // Plusieurs jeux : petit menu de choix sous le chip
    if (chip.menu) {
      chip.menu.remove();
      chip.menu = null;
      return;
    }
    closeChipMenus();
    const menu = document.createElement("div");
    Object.assign(menu.style, {
      position: "absolute",
      top: "100%",
      right: "0",
      marginTop: "4px",
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: "8px",
      boxShadow: "0 6px 20px rgba(0,0,0,.2)",
      minWidth: "170px",
      overflow: "hidden",
    });
    const sorted = datasets.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    for (const ds of sorted) {
      const item = document.createElement("button");
      item.type = "button";
      item.textContent = (ds.id === form.activeDatasetId ? "● " : "") + ds.name;
      Object.assign(item.style, {
        all: "initial",
        display: "block",
        width: "100%",
        boxSizing: "border-box",
        fontFamily: "system-ui, 'Segoe UI', sans-serif",
        fontSize: "12px",
        padding: "6px 10px",
        cursor: "pointer",
        color: "#1f2430",
        background: "#fff",
      });
      item.addEventListener("mouseenter", () => (item.style.background = "#e3f4ec"));
      item.addEventListener("mouseleave", () => (item.style.background = "#fff"));
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.remove();
        chip.menu = null;
        fillFromChip(id, ds.id, chip);
      });
      menu.append(item);
    }
    chip.menu = menu;
    chip.host.append(menu);
  }

  function createChip(id, entry) {
    const host = document.createElement("div");
    host.setAttribute("data-formkeep", "chip");
    Object.assign(host.style, {
      position: "absolute",
      zIndex: "2147483646",
      transform: "translateX(-100%)",
    });
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = CHIP_LABEL;
    btn.title = "formKeep : remplir ce formulaire";
    Object.assign(btn.style, {
      all: "initial",
      fontFamily: "system-ui, 'Segoe UI', sans-serif",
      fontSize: "12px",
      fontWeight: "600",
      color: "#fff",
      background: "#0f7a57",
      borderRadius: "999px",
      padding: "3px 10px",
      cursor: "pointer",
      boxShadow: "0 1px 4px rgba(0,0,0,.25)",
      userSelect: "none",
      whiteSpace: "nowrap",
    });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onChipClick(id);
    });
    host.append(btn);
    document.body.append(host);
    positionChip(host, entry.element);
    chips.set(id, { host, btn, menu: null });
  }

  // Synchronise les chips avec l'état courant (appelé après chaque rescan
  // et chaque changement de stockage, via refreshTracked).
  function updateChips() {
    if (!document.body) return;
    for (const id of [...chips.keys()]) {
      const entry = registry.get(id);
      const form = tracked.get(id);
      const hasData = form && Object.keys(form.datasets || {}).length > 0;
      if (!entry || !entry.element.isConnected || !hasData) removeChip(id);
    }
    for (const [id, form] of tracked) {
      if (Object.keys(form.datasets || {}).length === 0) continue;
      const entry = registry.get(id);
      if (!entry || !entry.element.isConnected) continue;
      if (chips.has(id)) positionChip(chips.get(id).host, entry.element);
      else createChip(id, entry);
    }
  }

  window.addEventListener(
    "resize",
    () => {
      for (const [id, chip] of chips) {
        const entry = registry.get(id);
        if (entry) positionChip(chip.host, entry.element);
      }
    },
    { passive: true }
  );

  // Fermer les menus ouverts au clic ailleurs dans la page.
  document.addEventListener("click", (e) => {
    if (!e.target.closest?.("[data-formkeep]")) closeChipMenus();
  });

  // ---------- Démarrage ----------
  // L'observer démarre même si le scan initial échoue : les formulaires
  // injectés plus tard (SPA) doivent rester détectables quoi qu'il arrive.

  rescan()
    .catch((err) => console.warn("[formKeep] scan initial:", err))
    .finally(() => {
      console.debug(`[formKeep] actif — ${registry.size} formulaire(s) détecté(s) sur ${location.pathname}`);
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    });
})();
