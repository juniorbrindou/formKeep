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

  // Pseudo-formulaires : inputs hors <form> dont un conteneur proche possède
  // un mécanisme de soumission (bouton). Conteneurs imbriqués dédupliqués.
  function findPseudoForms(doc) {
    const orphans = [...doc.querySelectorAll("input, select, textarea")].filter(
      (el) => !el.closest("form")
    );
    const containers = new Set();
    for (const el of orphans) {
      let node = el.parentElement;
      let depth = 0;
      while (node && depth < 6 && node !== doc.body && node !== doc.documentElement) {
        if (node.querySelector('button, [type="submit"], [role="button"]')) {
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
    for (const form of document.querySelectorAll("form")) {
      candidates.push({ element: form, isForm: true });
    }
    for (const el of findPseudoForms(document)) {
      candidates.push({ element: el, isForm: false });
    }

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
    for (const form of all) {
      if (!registry.has(form.id)) continue;
      tracked.set(form.id, form);
      // lastSeenAt : au plus une écriture par minute pour éviter les boucles
      // d'événements onChanged (le rafraîchissement relit sans réécrire).
      if (now - (form.lastSeenAt || 0) > 60000) {
        form.lastSeenAt = now;
        await Store.saveForm(form);
      }
    }
    sendStatus();
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
  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((m) =>
      [...m.addedNodes, ...m.removedNodes].some(
        (n) =>
          n.nodeType === 1 &&
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

  async function capture(id) {
    const entry = registry.get(id);
    const form = await Store.getForm(id);
    if (!entry || !form) return;
    // La structure a pu dériver depuis le tag : on relit les champs à jour.
    entry.fields = FP.extractFields(entry.element);
    const values = currentValues(entry);
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
    el.style.outline = "3px solid #7c3aed";
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

  // ---------- Démarrage ----------

  rescan().then(() => {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  });
})();
