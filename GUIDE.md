# Guide locaproj : mettre le site en route

Le site est en ligne : **https://jcharrierbiz-cloud.github.io/locaproj/**

Pour l'instant il est en **mode démo** : il fonctionne, mais rien n'est enregistré. Pour qu'il prenne de vraies réservations, il reste l'étape 1 (le Google Sheet), puis le lien en bio.

---

## Étape 1 — Le Google Sheet et son serveur (≈ 15 min, sur ordinateur)

C'est lui qui reçoit les réservations, bloque les créneaux, t'envoie un mail et remplit ton Google Agenda.

1. Connecte-toi à **Locaproj.85@gmail.com** dans ton navigateur.
2. Va sur **sheets.new**. Nomme la feuille `locaproj — réservations`.
3. Menu **Extensions → Apps Script**. Un éditeur s'ouvre. Nomme le projet `locaproj` (en haut à gauche).
4. Copie le code du serveur : ouvre [dist/Code.gs sur GitHub](https://github.com/jcharrierbiz-cloud/locaproj/blob/main/dist/Code.gs) et clique l'icône **Copy raw file** (les deux carrés, en haut à droite du code). Dans l'éditeur Apps Script, efface le contenu de `Code.gs` (Ctrl+A, Suppr), colle (Ctrl+V), puis **Enregistrer** (icône disquette).
5. En haut, dans la liste des fonctions, choisis **`installer`**, puis clique **Exécuter**.
   - Google demande une autorisation : **Examiner les autorisations**, puis choisis le compte Locaproj.
   - L'écran « Google n'a pas validé cette application » est normal, c'est ton propre script. Clique **Paramètres avancés**, puis **Accéder à locaproj (non sécurisé)**, puis **Autoriser**.
   - Reviens sur le Sheet : 6 onglets sont créés (Tableau de bord, Réservations, Séances, Indisponibilités, Config, Avis).
6. Dans l'éditeur Apps Script : **Déployer → Nouveau déploiement** → roue dentée → **Application Web**.
   - Description : `v1`
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde**
   - **Déployer**, puis copie l'**URL de l'application Web** (elle finit par `/exec`).
7. Test : colle cette URL dans un nouvel onglet. Tu dois voir un texte qui commence par `{"ok":true`.
8. Envoie-moi l'URL (ou colle-la dans `config.js` entre les guillemets). Le site quitte alors le mode démo.

> Si Google bloque une étape, dis-le-moi : on passera par une autre solution.

## Étape 2 — Le site en ligne (fait, gratuit, GitHub Pages)

Le site est un simple dossier de fichiers, publié gratuitement par GitHub à partir du dépôt `jcharrierbiz-cloud/locaproj`.

- **Mettre à jour le site :** chaque modification envoyée sur la branche `main` est en ligne 1 à 2 minutes plus tard.
- **Changer d'adresse plus tard :** pour avoir `locaproj.github.io`, crée une organisation GitHub gratuite nommée `locaproj`, puis on y déplace le dépôt.
- **Moteurs de recherche :** les pages demandent à Google de ne pas les référencer (`noindex`). Le site se trouve par le lien en bio, pas par une recherche.

## Étape 3 — Partager et annoncer

- **Ton pote** : dans le Sheet, **Partager** → son Gmail → **Éditeur**. Pour l'agenda : Google Agenda → paramètres de l'agenda Locaproj → **Partager avec des personnes**.
- **Instagram** : mets l'adresse du site dans la bio de @locaproj.roc.
- **Carte d'évaluation** : la page d'avis est `…/avis.html`. Une fois le site en ligne, je te génère le QR code à imprimer sur la carte.

---

## Au quotidien (tout se passe dans le Google Sheet)

| Tu veux… | Où | Quoi faire |
|---|---|---|
| Organiser une séance dans votre chambre | Onglet **Séances** | Une ligne : Date (`08/10/2026`), Heure (`20:30`), Type, Titre (ex. « Soirée Ligue des champions »), Places max. Elle apparaît tout de suite sur le site, **sauf si elle tombe pendant une location** (le projecteur ne sera pas là). |
| Annuler une séance | **Séances** | Colonne **Annulée** → `oui`. |
| Noter une location prise en direct (sans le site) | **Réservations** | Une ligne avec au moins **Remise** au format `2026-10-05 07:15` (et **Retour** si ce n'est pas le lendemain matin). Elle bloque le créneau. ⚠️ Une date mal écrite bloque **toutes** les locations par prudence : si plus aucun créneau n'apparaît sur le site, vérifie ce format. |
| Bloquer des dates (vacances, projecteur prêté…) | Onglet **Indisponibilités** | Du / Au / Raison. **Pense aux vacances scolaires.** |
| Annuler une réservation | **Réservations** | Statut → **Annulée**. Le créneau se libère. Supprime aussi l'événement dans l'Agenda. |
| Suivre une location | **Réservations** | Statut → **Remis** à la remise, puis **Rendu** au retour. Coche **Payé** quand c'est payé. |
| Voir où vous en êtes | **Tableau de bord** | Encaissé, reste à gagner pour rembourser les 45 €, nombre de réservations, note moyenne. |
| Changer les horaires ou les prix | Onglet **Config** | Modifie la colonne Valeur. Ex. `horaires_mercredi` = `07:00-08:00` (vide = ni remise ni retour ce jour-là). Le retour, c'est `horaires_retour`. |
| Tenir la promesse « on efface après 3 mois » | Rien à faire | Chaque nuit, le script efface les infos perso des réservations de plus de 3 mois, dans le Sheet et dans l'Agenda. Les mails de notification restent dans Gmail : supprime-les de temps en temps. |
| Bloquer le spam | Onglet **Config** | Par défaut : 6 réservations par heure, 15 par jour, 2 en cours par compte Instagram ou e-mail. Une fausse réservation → Statut **Annulée**. |

**Horaires par défaut :**
- **Remise** du lundi au vendredi, le matin de 7h à 8h (créneaux de 15 min). Pour ajouter un créneau un jour précis : `horaires_mercredi` = `07:00-08:00, 12:30-13:30`.
- **Retour** toujours le matin qui suit la dernière journée, entre 7h et 8h (`horaires_retour`). Exemple : remise lundi à 7h15 en location 1 journée → retour mardi matin entre 7h et 8h.
- **Le matin d'un retour** (`enchainer_meme_matin`) :
  - `oui` (par défaut) : le client suivant peut le prendre le même matin, juste après le retour. Vous récupérez le projecteur, puis vous le donnez au suivant. Si le premier client est en retard, le suivant attend.
  - `non` : le projecteur ne repart pas le matin où il revient. Une location 1 journée prise lundi bloque donc lundi et mardi matin, et le client suivant le prend mercredi.

## Modifier le site plus tard

- **Serveur** (après une modification de `assets/logic.js` ou `apps-script/server.js`) : lance `npm test`, recolle `dist/Code.gs` dans l'éditeur, puis **Déployer → Gérer les déploiements → crayon → Version : Nouvelle version → Déployer**. L'URL ne change pas.
- **Logo** : quand tu l'as, envoie-le-moi. Je remplace le texte « locaproj » de l'enseigne par ton image.
