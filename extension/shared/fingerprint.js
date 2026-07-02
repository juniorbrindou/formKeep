// formKeep — fingerprinting déterministe des formulaires (research R2).
// Script « plain » partagé : chargé par le content script (via manifest) et la popup.
(function () {
  "use strict";

  // Types de contrôles jamais capturés/remplis (dont `file` : FR-014, edge case spec)
  const IGNORED_INPUT_TYPES = new Set(["file", "submit", "button", "reset", "image"]);

  // Hash FNV-1a 32 bits → base36. Suffisant pour un usage personnel, zéro dépendance.
  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  }

  function fieldType(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === "textarea") return "textarea";
    if (tag === "select") return el.multiple ? "select-multiple" : "select";
    return (el.getAttribute("type") || "text").toLowerCase();
  }

  function fieldLabel(el) {
    if (el.id) {
      const lab = el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab && lab.textContent.trim()) return lab.textContent.trim();
    }
    const wrap = el.closest("label");
    if (wrap && wrap.textContent.trim()) return wrap.textContent.trim();
    return el.getAttribute("aria-label") || el.getAttribute("placeholder") || null;
  }

  // Descripteurs ordonnés des champs d'un formulaire (data-model.md FormField).
  // Les éléments partageant un `name` (groupes radio/checkbox) sont regroupés
  // sous un seul descripteur dont `elements` contient tout le groupe.
  function extractFields(root) {
    const controls = root.querySelectorAll("input, select, textarea");
    const byKey = new Map();
    let index = 0;
    for (const el of controls) {
      const type = fieldType(el);
      if (IGNORED_INPUT_TYPES.has(type)) continue;
      const name = el.getAttribute("name");
      const key = name || `#${index}:${type}`;
      index++;
      const existing = byKey.get(key);
      if (existing) {
        existing.elements.push(el);
      } else {
        byKey.set(key, { key, type, label: fieldLabel(el), elements: [el] });
      }
    }
    return [...byKey.values()];
  }

  // Version sérialisable (sans références DOM) pour storage et messages.
  function toPlainFields(fields) {
    return fields.map(({ key, type, label }) => ({ key, type, label }));
  }

  // Empreinte de structure : origin + pathname + composition ordonnée des champs.
  // Query string exclue ; attributs cosmétiques (class/style) jamais pris en compte.
  function baseHash(origin, pathname, fields) {
    const desc = fields.map((f) => `${f.key}|${f.type}`).join(",");
    return fnv1a(`${origin}${pathname}::${desc}`);
  }

  // ID final : empreinte + index d'occurrence (formulaires identiques sur une même page).
  function formId(origin, pathname, fields, occurrence) {
    return `${baseHash(origin, pathname, fields)}_${occurrence}`;
  }

  // Label lisible proposé pour un formulaire non encore tagué (US1).
  function generatedLabel(el, fields) {
    const name = el.getAttribute && (el.getAttribute("name") || el.id);
    if (name) return `Formulaire « ${name} »`;
    const btn = el.querySelector('button[type="submit"], input[type="submit"], button');
    const btnText = btn ? (btn.textContent || btn.value || "").trim() : "";
    if (btnText) return `Formulaire « ${btnText} »`;
    return `Formulaire (${fields.length} champs)`;
  }

  globalThis.FormKeep = globalThis.FormKeep || {};
  globalThis.FormKeep.fingerprint = {
    extractFields,
    toPlainFields,
    baseHash,
    formId,
    generatedLabel,
  };
})();
