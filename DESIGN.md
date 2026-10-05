# Design — locaproj

Système relevé sur le site construit (index.html, avis.html, assets/style.css), le 2026-10-01.

## Monde

Le comptoir confiserie d'un cinéma. Réserver, c'est commander au comptoir : un auvent rayé, un tableau-menu rétroéclairé, deux rayons (« À emporter » = location, « Sur place » = séance dans la chambre), et un ticket de caisse avec un numéro de commande.

Refus : la page « streaming noire + néon » et l'agenda blanc façon Calendly.

## Couleurs (stratégie « Committed » : le rouge porte la page)

| Jeton | Valeur | Rôle |
|---|---|---|
| `--rouge` | `#c8102e` | Fond de page, rayures de l'auvent, prix sur fond beurre |
| `--rouge-fonce` | `#8f0a20` | Relief des titres, encart « Retour », panneaux secondaires sur rouge |
| `--rouge-nuit` | `#5c0614` | Relief du prix géant |
| `--nuit` | `#1d0b0d` | Tableau-menu, enseigne, boutons d'heure, pied de page |
| `--nuit-2` / `--nuit-3` | `#2b1215` / `#3d1c1f` | Survol, bord intérieur du tableau |
| `--beurre` | `#ffc629` | Action principale, sélection « allumée », prix sur fond nuit |
| `--blanc` | `#fffdf8` | Texte sur rouge et nuit, rayures, bon de commande |
| `--encre` / `--encre-2` | `#1d0b0d` / `#5e4c47` | Texte sur papier (bon, ticket) |

Règles :
- Jaune beurre sur rouge seulement en grand texte (≥ 19 px gras) : le contraste est de 3,7:1.
- Le texte secondaire sur rouge est en `#ffd9de`, jamais en gris.

## Typographie

- **Bungee** (enseigne) : titres, logo, prix, numéro de commande, bouton principal. Toujours en capitales.
- **Bricolage Grotesque** (variable, `wdth` 92) : tout le reste. Chiffres en `tabular-nums` pour les heures et les prix.

## Composants

- **Auvent** : rayures de 28 px rouge/blanc, festons en `radial-gradient` sous le bord. L'enseigne nuit « locaproj » est posée dessus.
- **Article du tableau-menu** : nom, pointillés de menu, prix Bungee jaune, détail en dessous. Une fois choisi, l'article s'« allume » en fond beurre, prix rouge.
- **Jour** : carte papier blanche (jour de la semaine en rouge, date en Bungee, mois). Choisi : fond beurre.
- **Heure** : pastille nuit, chiffres tabulaires. Choisie : fond beurre avec halo.
- **Bon de commande** : carte papier blanche, `color-scheme: light`, champs bordés `#e2d6cf` passant au rouge au focus, préfixe « @ » rouge pour Instagram.
- **Ticket / reçu** : papier blanc, séparateurs en tirets, bas dentelé (masque `radial-gradient`), total en Bungee rouge.
- **Bouton principal** : beurre, Bungee, ombre décalée doublée d'un flou, enfoncement de 4 px au clic.

## Mouvement

Un seul moment écrit : le reçu sort de la fente de l'imprimante en saccades à la confirmation (`@keyframes imprimer`, 1,6 s). Tout est coupé avec `prefers-reduced-motion`.

## Mise en page

- Mobile d'abord : une colonne de 40 rem maximum, marges de 1 rem.
- À partir de 64 rem : deux colonnes. L'enseigne (accroche) reste collée à gauche, le comptoir (tableau-menu → Quand → Qui) est à droite.

## Surfaces navigateur

- Sélection de texte : beurre sur nuit.
- Focus : contour beurre de 3 px.
- Curseur de saisie : rouge.
- Barre de défilement : beurre sur nuit.
- Cases à cocher : `accent-color` rouge.
