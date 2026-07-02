// formKeep — accès au stockage local (data-model.md, research R6) et
// logique d'export/import (contracts/export-format.md).
// Script « plain » partagé : chargé par le content script (via manifest) et la popup.
(function () {
  "use strict";

  const FORM_PREFIX = "form:";
  const FORMAT_VERSION = 1;
  const local = chrome.storage.local;

  async function initMeta() {
    const { meta } = await local.get("meta");
    if (!meta) await local.set({ meta: { formatVersion: FORMAT_VERSION } });
  }

  async function getForm(id) {
    const key = FORM_PREFIX + id;
    const res = await local.get(key);
    return res[key] || null;
  }

  async function getAllForms() {
    const all = await local.get(null);
    return Object.keys(all)
      .filter((k) => k.startsWith(FORM_PREFIX))
      .map((k) => all[k]);
  }

  async function saveForm(form) {
    await local.set({ [FORM_PREFIX + form.id]: form });
  }

  async function deleteForm(id) {
    await local.remove(FORM_PREFIX + id);
  }

  // Invariant data-model.md : activeDatasetId ∈ datasets, ou null.
  function ensureActiveInvariant(form) {
    const ids = Object.keys(form.datasets || {});
    if (!form.activeDatasetId || !ids.includes(form.activeDatasetId)) {
      form.activeDatasetId = ids[0] || null;
    }
    return form;
  }

  function newDatasetId() {
    return "ds_" + Math.random().toString(36).slice(2, 10);
  }

  // Noms de datasets uniques par formulaire, suffixe « (2) » en cas de collision.
  function uniqueDatasetName(form, base) {
    const names = new Set(Object.values(form.datasets || {}).map((d) => d.name));
    if (!names.has(base)) return base;
    let n = 2;
    while (names.has(`${base} (${n})`)) n++;
    return `${base} (${n})`;
  }

  // ---------- Export / Import (Constitution III, FR-011/FR-012) ----------

  async function buildExportBundle() {
    return {
      formatVersion: FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      forms: await getAllForms(),
    };
  }

  function isFieldValue(v) {
    return (
      typeof v === "string" ||
      typeof v === "boolean" ||
      (Array.isArray(v) && v.every((x) => typeof x === "string"))
    );
  }

  // Validation structurelle complète AVANT toute écriture (FR-012).
  function validateBundle(bundle) {
    const fail = (error) => ({ ok: false, error });
    if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
      return fail("Fichier invalide : structure racine incorrecte");
    }
    if (bundle.formatVersion !== FORMAT_VERSION) {
      return fail(`Version de format non supportée : ${bundle.formatVersion}`);
    }
    if (!Array.isArray(bundle.forms)) {
      return fail("Fichier invalide : liste « forms » absente");
    }
    for (const f of bundle.forms) {
      if (!f || typeof f !== "object") return fail("Entrée de formulaire invalide");
      if (typeof f.id !== "string" || !f.id) return fail("Formulaire sans id");
      if (typeof f.label !== "string" || !f.label) return fail(`Formulaire ${f.id} : label manquant`);
      if (typeof f.origin !== "string" || typeof f.path !== "string") {
        return fail(`Formulaire ${f.id} : origin/path manquant`);
      }
      if (!Array.isArray(f.fields)) return fail(`Formulaire ${f.id} : « fields » invalide`);
      if (!f.datasets || typeof f.datasets !== "object" || Array.isArray(f.datasets)) {
        return fail(`Formulaire ${f.id} : « datasets » invalide`);
      }
      if (f.activeDatasetId != null && !(f.activeDatasetId in f.datasets)) {
        return fail(`Formulaire ${f.id} : dataset actif inconnu`);
      }
      for (const ds of Object.values(f.datasets)) {
        if (!ds || typeof ds !== "object" || typeof ds.id !== "string") {
          return fail(`Formulaire ${f.id} : dataset invalide`);
        }
        if (typeof ds.name !== "string" || !ds.name) {
          return fail(`Formulaire ${f.id} : dataset sans nom`);
        }
        if (!ds.values || typeof ds.values !== "object" || Array.isArray(ds.values)) {
          return fail(`Dataset « ${ds.name} » : « values » invalide`);
        }
        for (const v of Object.values(ds.values)) {
          if (!isFieldValue(v)) return fail(`Dataset « ${ds.name} » : type de valeur invalide`);
        }
      }
    }
    return { ok: true };
  }

  // mode: "replace" (tout effacer puis écrire) | "merge" (upsert, l'importé gagne par id)
  async function applyImport(bundle, mode) {
    const check = validateBundle(bundle);
    if (!check.ok) throw new Error(check.error);
    if (mode === "replace") {
      const all = await local.get(null);
      const keys = Object.keys(all).filter((k) => k.startsWith(FORM_PREFIX));
      if (keys.length) await local.remove(keys);
    }
    const payload = { meta: { formatVersion: FORMAT_VERSION } };
    for (const f of bundle.forms) payload[FORM_PREFIX + f.id] = f;
    await local.set(payload);
  }

  globalThis.FormKeep = globalThis.FormKeep || {};
  globalThis.FormKeep.storage = {
    FORM_PREFIX,
    FORMAT_VERSION,
    initMeta,
    getForm,
    getAllForms,
    saveForm,
    deleteForm,
    ensureActiveInvariant,
    newDatasetId,
    uniqueDatasetName,
    buildExportBundle,
    validateBundle,
    applyImport,
  };
})();
