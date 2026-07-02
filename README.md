# formKeep

Extension Chrome personnelle pour **taguer, sauvegarder et pré-remplir en un clic** les
formulaires que vous remplissez à longueur de journée (environnements de dev, back-offices…).

**100 % local** : toutes les données restent dans votre navigateur (`chrome.storage.local`).
Aucune requête réseau, aucun compte, aucune dépendance, aucun build.

## Installation

1. Ouvrir `chrome://extensions`
2. Activer le **Mode développeur** (en haut à droite)
3. Cliquer **Charger l'extension non empaquetée** et sélectionner le dossier `extension/`
4. Épingler formKeep à la barre d'outils

## Usage quotidien

1. **Taguer** — Sur une page contenant un formulaire, ouvrir la popup : les formulaires
   détectés sont listés (« Repérer » les surligne sur la page). Cliquer **Suivre**.
2. **Sauvegarder** — Remplir le formulaire et le soumettre normalement : les valeurs sont
   capturées automatiquement dans un jeu de données local (la soumission n'est jamais bloquée).
3. **Re-remplir** — En revenant sur la page, un petit chip vert **« fK · Remplir »** est
   ancré au coin du formulaire : un clic et le formulaire est restauré (menu de choix si
   plusieurs jeux). Le badge de l'icône et le bouton **Remplir** de la popup restent
   disponibles. *(Jamais d'injection automatique : c'est toujours vous qui déclenchez.)*

## Jeux de données

Chaque formulaire suivi peut avoir **plusieurs jeux de données** ; un seul est *actif*
(c'est lui qui est mis à jour à chaque soumission et proposé au remplissage).

Depuis la popup (section « Tous les formulaires suivis », accessible depuis n'importe quel
onglet) : créer, modifier champ par champ, renommer, supprimer (avec confirmation) et
choisir le jeu actif.

## Export / Import

- **Exporter (JSON)** : télécharge un instantané complet (`formkeep-export-AAAA-MM-JJ.json`).
- **Importer…** : restaure un export, en mode **Remplacer tout** ou **Fusionner** (l'importé
  gagne en cas de conflit). Un fichier invalide est rejeté sans toucher aux données.

## Limites connues (v1)

- Formulaires dans des iframes non pris en charge (page principale uniquement)
- Champs `file` ignorés (le navigateur interdit leur remplissage programmatique)
- Les mots de passe sont sauvegardés comme les autres champs — outil personnel de dev,
  à ne pas utiliser avec des credentials de production sensibles

## Validation

Scénarios de validation manuelle (V1–V9) et pages de test : voir
[specs/001-formkeep-core/quickstart.md](specs/001-formkeep-core/quickstart.md) et
[tests/fixtures/](tests/fixtures/).

## Documentation projet

- Constitution : [.specify/memory/constitution.md](.specify/memory/constitution.md)
- Spécification : [specs/001-formkeep-core/spec.md](specs/001-formkeep-core/spec.md)
- Plan & design : [specs/001-formkeep-core/plan.md](specs/001-formkeep-core/plan.md)
