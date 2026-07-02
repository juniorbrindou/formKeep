// formKeep — popup : liste des formulaires (US1), remplissage (US3),
// gestion des jeux de données (US4), export/import (US5).
// La popup écrit directement dans le stockage ; le content script se
// resynchronise via chrome.storage.onChanged (research R5).
(function () {
  "use strict";

  const Store = globalThis.FormKeep.storage;

  let activeTab = null;

  // ---------- Helpers DOM ----------

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "class") el.className = value;
      else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
      else if (value !== null && value !== undefined) el.setAttribute(key, value);
    }
    for (const child of children) {
      el.append(child instanceof Node ? child : document.createTextNode(child));
    }
    return el;
  }

  let toastTimer = null;
  function toast(text) {
    const el = document.getElementById("toast");
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  // ---------- Dialogues (confirm/prompt/choix maison, fiables en popup) ----------

  function openDialog(build) {
    const root = document.getElementById("dialog-root");
    const overlay = h("div", { class: "overlay" });
    const dialog = h("div", { class: "dialog" });
    const close = () => overlay.remove();
    build(dialog, close);
    overlay.append(dialog);
    root.append(overlay);
    return close;
  }

  function uiConfirm(message, confirmLabel = "Confirmer") {
    return new Promise((resolve) => {
      openDialog((dialog, close) => {
        dialog.append(
          h("h3", {}, message),
          h("div", { class: "dialog-actions" },
            h("button", { onclick: () => { close(); resolve(false); } }, "Annuler"),
            h("button", { class: "primary danger", onclick: () => { close(); resolve(true); } }, confirmLabel)
          )
        );
      });
    });
  }

  function uiPrompt(message, initial = "") {
    return new Promise((resolve) => {
      openDialog((dialog, close) => {
        const input = h("input", { type: "text", value: initial });
        const submit = () => { close(); resolve(input.value.trim() || null); };
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
        dialog.append(
          h("h3", {}, message),
          input,
          h("div", { class: "dialog-actions" },
            h("button", { onclick: () => { close(); resolve(null); } }, "Annuler"),
            h("button", { class: "primary", onclick: submit }, "OK")
          )
        );
        setTimeout(() => input.focus(), 0);
      });
    });
  }

  function uiChoice(message, choices) {
    // choices: [{ label, value, primary? }] — résout null si annulé
    return new Promise((resolve) => {
      openDialog((dialog, close) => {
        dialog.append(
          h("h3", {}, message),
          h("div", { class: "dialog-actions" },
            h("button", { onclick: () => { close(); resolve(null); } }, "Annuler"),
            ...choices.map((c) =>
              h("button", { class: c.primary ? "primary" : "", onclick: () => { close(); resolve(c.value); } }, c.label)
            )
          )
        );
      });
    });
  }

  // ---------- Communication avec l'onglet actif ----------

  async function sendToTab(msg) {
    if (!activeTab?.id) return null;
    try {
      return await chrome.tabs.sendMessage(activeTab.id, msg);
    } catch {
      return null; // pages chrome://, store, onglet sans content script…
    }
  }

  // ---------- Rendu ----------

  async function refresh() {
    await Promise.all([renderPageForms(), renderAllForms()]);
  }

  async function renderPageForms() {
    const root = document.getElementById("page-forms");
    root.textContent = "";
    const res = await sendToTab({ type: "GET_FORMS" });
    if (!res) {
      root.append(h("p", { class: "muted" }, "formKeep n'a pas accès à cette page."));
      return;
    }
    if (!res.forms.length) {
      root.append(h("p", { class: "muted" }, "Aucun formulaire détecté sur cette page."));
      return;
    }
    const stored = new Map((await Store.getAllForms()).map((f) => [f.id, f]));
    for (const info of res.forms) {
      root.append(pageFormCard(info, stored.get(info.id) || null));
    }
  }

  function pageFormCard(info, form) {
    const title = h("div", { class: "title-row" },
      h("strong", {}, info.label + (info.occurrence > 0 ? ` (#${info.occurrence + 1})` : "")),
      info.tracked ? h("span", { class: "badge" }, "suivi") : "",
      h("span", { class: "meta" }, `${info.fieldCount} champs`)
    );

    const actions = h("div", { class: "actions" },
      h("button", { title: "Repérer sur la page", onclick: () => sendToTab({ type: "HIGHLIGHT_FORM", formId: info.id }) }, "Repérer")
    );

    if (!info.tracked) {
      actions.append(h("button", { class: "primary", onclick: () => tagForm(info) }, "Suivre"));
      return h("div", { class: "card" }, title, actions);
    }

    // Formulaire suivi : remplissage (US3) + gestion (US4)
    const datasets = Object.values(form?.datasets || {});
    if (form && datasets.length > 0) {
      let picker = null;
      if (datasets.length > 1) {
        picker = h("select", {},
          ...datasets
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
            .map((ds) => {
              const opt = h("option", { value: ds.id }, ds.name);
              if (ds.id === form.activeDatasetId) opt.selected = true;
              return opt;
            })
        );
        actions.append(picker);
      }
      actions.append(
        h("button", { class: "primary", onclick: () => doFill(info.id, picker ? picker.value : form.activeDatasetId) }, "Remplir")
      );
    }

    if (form) {
      actions.append(
        h("button", { onclick: () => renameForm(form) }, "Renommer"),
        h("button", { class: "danger", onclick: () => untrackForm(form) }, "Ne plus suivre")
      );
    }

    const card = h("div", { class: "card" }, title, actions);
    if (form) card.append(datasetPanel(form));
    return card;
  }

  async function renderAllForms() {
    const root = document.getElementById("all-forms");
    root.textContent = "";
    const forms = await Store.getAllForms();
    if (!forms.length) {
      root.append(h("p", { class: "muted" }, "Aucun formulaire suivi pour l'instant."));
      return;
    }
    forms.sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
    for (const form of forms) root.append(trackedFormCard(form));
  }

  function trackedFormCard(form) {
    const count = Object.keys(form.datasets || {}).length;
    return h("div", { class: "card" },
      h("div", { class: "title-row" },
        h("strong", {}, form.label),
        h("span", { class: "meta" }, `${count} jeu(x)`)
      ),
      h("div", { class: "meta" }, `${form.origin}${form.path}`),
      h("div", { class: "actions" },
        h("button", { onclick: () => renameForm(form) }, "Renommer"),
        h("button", { class: "danger", onclick: () => untrackForm(form) }, "Supprimer")
      ),
      datasetPanel(form)
    );
  }

  // ---------- Actions formulaires (T015) ----------

  async function tagForm(info) {
    const res = await sendToTab({ type: "GET_FORM_FIELDS", formId: info.id });
    if (!res?.ok) {
      toast("Impossible de lire les champs du formulaire.");
      return;
    }
    const url = new URL(activeTab.url);
    const now = Date.now();
    await Store.saveForm({
      id: info.id,
      label: info.generatedLabel,
      origin: url.origin,
      path: url.pathname,
      occurrence: info.occurrence,
      fields: res.fields,
      activeDatasetId: null,
      datasets: {},
      createdAt: now,
      lastSeenAt: now,
    });
    toast("Formulaire suivi.");
    refresh();
  }

  async function renameForm(form) {
    const name = await uiPrompt("Nouveau nom du formulaire :", form.label);
    if (!name) return;
    form.label = name;
    await Store.saveForm(form);
    refresh();
  }

  async function untrackForm(form) {
    const ok = await uiConfirm(
      `Ne plus suivre « ${form.label} » ? Tous ses jeux de données seront supprimés.`,
      "Supprimer"
    );
    if (!ok) return;
    await Store.deleteForm(form.id);
    refresh();
  }

  // ---------- Remplissage (T019) ----------

  async function doFill(formId, datasetId) {
    const res = await sendToTab({ type: "FILL_FORM", formId, datasetId });
    if (res?.ok) {
      toast(`${res.filled} champ(s) rempli(s)` + (res.skipped ? `, ${res.skipped} ignoré(s)` : ""));
    } else {
      toast("Échec du remplissage.");
    }
  }

  // ---------- Jeux de données (T021–T023) ----------

  function datasetPanel(form) {
    const panel = h("div", { class: "panel" });
    const datasets = Object.values(form.datasets || {}).sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
    );

    if (!datasets.length) {
      panel.append(h("p", { class: "muted" }, "Aucun jeu de données."));
    }

    for (const ds of datasets) {
      const radio = h("input", {
        type: "radio",
        name: `active-${form.id}`,
        title: "Jeu actif",
        onchange: () => setActiveDataset(form, ds.id),
      });
      radio.checked = ds.id === form.activeDatasetId;
      panel.append(
        h("div", { class: "ds-row" },
          radio,
          h("span", { class: "ds-name" }, ds.name),
          h("span", { class: "ds-date" }, new Date(ds.updatedAt || ds.createdAt).toLocaleDateString()),
          h("button", { onclick: () => openEditor(form, ds) }, "Modifier"),
          h("button", { onclick: () => renameDataset(form, ds) }, "Renommer"),
          h("button", { class: "danger", onclick: () => deleteDataset(form, ds) }, "Suppr.")
        )
      );
    }

    panel.append(
      h("button", { class: "ghost", onclick: () => openEditor(form, null) }, "+ Nouveau jeu de données")
    );
    return panel;
  }

  async function setActiveDataset(form, dsId) {
    form.activeDatasetId = dsId;
    await Store.saveForm(form);
    toast("Jeu actif modifié.");
    refresh();
  }

  async function renameDataset(form, ds) {
    const name = await uiPrompt("Nouveau nom du jeu :", ds.name);
    if (!name) return;
    ds.name = Store.uniqueDatasetName(form, name);
    ds.updatedAt = Date.now();
    await Store.saveForm(form);
    refresh();
  }

  async function deleteDataset(form, ds) {
    const ok = await uiConfirm(`Supprimer le jeu « ${ds.name} » ?`, "Supprimer");
    if (!ok) return;
    delete form.datasets[ds.id];
    Store.ensureActiveInvariant(form); // répare activeDatasetId (data-model.md)
    await Store.saveForm(form);
    refresh();
  }

  // Éditeur : création (T023) et modification champ par champ (T022).
  function openEditor(form, dataset) {
    openDialog((dialog, close) => {
      dialog.append(h("h3", {}, dataset ? `Modifier « ${dataset.name} »` : "Nouveau jeu de données"));

      const nameInput = h("input", {
        type: "text",
        value: dataset ? dataset.name : `Jeu ${Object.keys(form.datasets || {}).length + 1}`,
      });
      dialog.append(
        h("div", { class: "field-row" }, h("label", {}, "Nom du jeu"), nameInput)
      );

      // Un widget par champ connu du formulaire, selon son type et la valeur courante.
      const readers = [];
      for (const field of form.fields || []) {
        const value = dataset?.values?.[field.key];
        const row = h("div", { class: "field-row" });
        row.append(h("label", {}, field.label || field.key));

        if (field.type === "checkbox" && !Array.isArray(value)) {
          const cb = h("input", { type: "checkbox" });
          cb.checked = value === true;
          row.append(cb);
          readers.push({ key: field.key, read: () => cb.checked });
        } else if (field.type === "select-multiple" || Array.isArray(value)) {
          const input = h("input", {
            type: "text",
            value: Array.isArray(value) ? value.join(", ") : "",
          });
          row.append(input, h("div", { class: "hint" }, "Valeurs séparées par des virgules"));
          readers.push({
            key: field.key,
            read: () => input.value.split(",").map((s) => s.trim()).filter(Boolean),
          });
        } else {
          const input = h("input", { type: "text", value: typeof value === "string" ? value : "" });
          row.append(input);
          readers.push({ key: field.key, read: () => input.value });
        }
        dialog.append(row);
      }

      const save = async () => {
        const values = {};
        for (const r of readers) values[r.key] = r.read();
        const now = Date.now();
        if (dataset) {
          const requested = nameInput.value.trim() || dataset.name;
          if (requested !== dataset.name) dataset.name = Store.uniqueDatasetName(form, requested);
          dataset.values = values;
          dataset.updatedAt = now;
        } else {
          const id = Store.newDatasetId();
          const name = Store.uniqueDatasetName(form, nameInput.value.trim() || "Nouveau jeu");
          form.datasets[id] = { id, name, values, createdAt: now, updatedAt: now };
          if (!form.activeDatasetId) form.activeDatasetId = id;
        }
        await Store.saveForm(form);
        close();
        toast("Jeu de données enregistré.");
        refresh();
      };

      dialog.append(
        h("div", { class: "dialog-actions" },
          h("button", { onclick: close }, "Annuler"),
          h("button", { class: "primary", onclick: save }, "Enregistrer")
        )
      );
    });
  }

  // ---------- Export / Import (T025/T026) ----------

  async function doExport() {
    const bundle = await Store.buildExportBundle();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: `formkeep-export-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast("Export téléchargé.");
  }

  function doImport(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      let bundle;
      try {
        bundle = JSON.parse(reader.result);
      } catch {
        toast("Fichier illisible : JSON invalide. Données inchangées.");
        return;
      }
      const check = Store.validateBundle(bundle);
      if (!check.ok) {
        toast(`${check.error}. Données inchangées.`);
        return;
      }
      const mode = await uiChoice(
        `Importer ${bundle.forms.length} formulaire(s) ? « Remplacer tout » efface les données actuelles.`,
        [
          { label: "Fusionner", value: "merge" },
          { label: "Remplacer tout", value: "replace", primary: true },
        ]
      );
      if (!mode) return;
      try {
        await Store.applyImport(bundle, mode);
        toast("Import réussi.");
        refresh();
      } catch (err) {
        toast(`Échec de l'import : ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  // ---------- Démarrage ----------

  async function init() {
    await Store.initMeta();
    [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    document.getElementById("export-btn").addEventListener("click", doExport);
    const fileInput = document.getElementById("import-file");
    document.getElementById("import-btn").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      if (fileInput.files[0]) doImport(fileInput.files[0]);
      fileInput.value = "";
    });

    await refresh();
  }

  init();
})();
