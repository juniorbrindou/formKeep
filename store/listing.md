# Fiche store — formKeep

Textes prêts à coller dans les formulaires de publication (Chrome Web Store /
Edge Add-ons / Firefox AMO).

---

## Nom
formKeep

## Résumé court (max 132 caractères)
Taguer, sauvegarder et pré-remplir en un clic les formulaires du quotidien (données 100 % locales).

## Catégorie suggérée
Productivité (ou Outils pour développeurs)

## Langue principale
Français

## Description détaillée

Né d'un besoin personnel : j'ai conçu formKeep pour mes propres développements
et les formulaires répétitifs que je remplis au quotidien. Je le partage tel
quel, dans l'espoir qu'il vous rende le même service.

formKeep vous fait gagner du temps sur les formulaires que vous remplissez à
longueur de journée : environnements de développement, back-offices, panneaux
d'administration, formulaires de connexion internes…

• Taguer — Sur une page contenant un formulaire, ouvrez la popup : les
  formulaires détectés sont listés. Un clic sur « Suivre » et il est mémorisé.

• Sauvegarder — Remplissez le formulaire et soumettez-le normalement : les
  valeurs sont capturées dans un « jeu de données » local. La soumission n'est
  jamais bloquée.

• Re-remplir — De retour sur la page, un petit bouton ancré au formulaire (ou le
  bouton « Remplir » de la popup) restaure vos valeurs en un clic. Plusieurs
  jeux de données ? Un menu vous laisse choisir. Le remplissage est toujours
  déclenché par vous, jamais automatique.

• Plusieurs jeux par formulaire — Gardez par exemple un compte « admin » et un
  compte « test » pour le même écran, et basculez de l'un à l'autre.

• Export / Import — Sauvegardez ou transférez vos données via un simple fichier
  JSON.

100 % local et privé : toutes les données restent dans votre navigateur. Aucune
requête réseau, aucun compte, aucune télémétrie, aucune dépendance.

Limites connues : les formulaires dans des iframes et les champs de type
« fichier » ne sont pas pris en charge.

---

## Justification des permissions (à recopier dans la revue)

- **storage** : enregistrer localement les formulaires suivis et leurs jeux de
  données. Aucune donnée n'est transmise.

- **activeTab** : lire la structure et remplir le formulaire de l'onglet actif,
  uniquement suite à une action de l'utilisateur (clic sur Suivre / Remplir).

- **Accès à tous les sites (`<all_urls>`)** : l'extension doit pouvoir détecter
  les formulaires et proposer le remplissage sur n'importe quel site que
  l'utilisateur choisit de suivre (outils internes, back-offices sur des
  domaines variés). Aucune donnée de page n'est lue ou stockée en dehors des
  formulaires explicitement suivis par l'utilisateur, et rien n'est envoyé sur
  le réseau.

## Divulgation de l'usage des données (Chrome Web Store)

- Données personnelles / d'authentification : **traitées localement** si
  l'utilisateur choisit de suivre un formulaire en contenant.
- Vendues à des tiers : **Non**.
- Utilisées/transférées à des fins sans rapport avec la fonctionnalité : **Non**.
- Utilisées/transférées pour déterminer une solvabilité ou à des fins de prêt : **Non**.
- URL de la politique de confidentialité : https://juniorbrindou.github.io/formKeep/privacy.html
  (activer GitHub Pages : Settings → Pages → branche master, dossier /docs)

## Assets visuels à fournir (hors paquet)

- Icône store 128×128 (déjà dans le paquet : icons/icon-128.png).
- 1 à 5 captures d'écran 1280×800 ou 640×400 (popup en action).
- Petite image promo 440×280 (facultative, Chrome).
