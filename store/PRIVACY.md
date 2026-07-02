# Politique de confidentialité — formKeep

_Dernière mise à jour : 2026-07-02_

formKeep est une extension de navigateur qui aide à taguer, sauvegarder et
pré-remplir les formulaires web. Cette politique décrit quelles données
l'extension traite et comment.

## Résumé

**formKeep ne collecte, ne transmet et ne vend aucune donnée.**
Toutes les données restent stockées **localement dans votre navigateur**
(`chrome.storage.local`). Il n'y a aucun serveur, aucun compte, aucune analyse
d'usage (analytics), aucune dépendance tierce et aucune requête réseau.

## Données traitées

Lorsque **vous** décidez de suivre un formulaire, l'extension enregistre
localement :

- l'origine et le chemin de la page (URL) du formulaire suivi ;
- une étiquette (label) et la structure des champs du formulaire ;
- les valeurs que vous saisissez dans ces champs au moment où vous soumettez le
  formulaire, regroupées en « jeux de données » que vous nommez.

Ces valeurs peuvent inclure des informations personnelles ou d'authentification
(par exemple un identifiant ou un mot de passe) **si vous choisissez de suivre un
formulaire qui en contient**. Ces données ne quittent jamais votre appareil.

## Ce que formKeep NE fait pas

- Aucune donnée n'est envoyée vers un serveur ou un tiers.
- Aucun suivi publicitaire, aucune télémétrie, aucun identifiant de suivi.
- Aucune injection automatique : le remplissage est toujours déclenché par vous.
- Le contenu des pages n'est jamais lu ni stocké en dehors des formulaires que
  vous choisissez explicitement de suivre.

## Contrôle et suppression

- Vous pouvez à tout moment supprimer un jeu de données, cesser de suivre un
  formulaire (ce qui supprime ses jeux), ou tout effacer.
- La fonction **Exporter (JSON)** produit un fichier local que vous seul
  contrôlez ; **Importer** lit un fichier que vous fournissez.
- La désinstallation de l'extension supprime toutes les données stockées.

## Permissions et justification

- `storage` — enregistrer localement vos formulaires suivis et jeux de données.
- `activeTab` — lire et remplir le formulaire de l'onglet courant, uniquement
  lorsque vous en faites la demande.
- Accès aux pages (`<all_urls>`) — détecter les formulaires et proposer le
  remplissage sur les sites que **vous** choisissez de suivre. Aucune donnée de
  page n'est collectée en dehors de cette action volontaire.

## Contact

Pour toute question relative à cette politique : **225juniorbrindou@gmail.com**
