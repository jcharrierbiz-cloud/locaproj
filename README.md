# locaproj

Site de réservation du vidéoprojecteur locaproj : location (1 jour, 2 jours, week-end, 3 à 7 jours) et inscription aux séances ciné / PS4. Remise au Roc.

- **Mise en route :** voir [GUIDE.md](GUIDE.md).
- **Site :** HTML/CSS/JS statique, sans build (`index.html`, `avis.html`, `assets/`). Publié sur GitHub Pages.
- **Serveur :** Google Apps Script relié à un Google Sheet (`apps-script/server.js`). On colle `dist/Code.gs` dans l'éditeur Apps Script.
- **Logique partagée :** `assets/logic.js` (prix, créneaux, validation), utilisée par le site, le serveur et les tests.
- **Mode démo :** tant que `config.js` est vide, le site tourne avec des données fictives en mémoire.

```bash
npm test
```

Cette commande régénère `dist/Code.gs`, puis lance les tests de la logique et du serveur. Le serveur tourne dans un faux Google Sheet en paramètres français.
