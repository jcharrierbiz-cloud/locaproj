/*
 * Mode démo : utilisé tant que config.js ne contient pas l'adresse du
 * serveur Google. Mêmes règles que le vrai serveur (assets/logic.js),
 * mais avec des séances et des réservations fictives, gardées en mémoire.
 */
(function () {
  'use strict';
  const L = window.Logic;
  const cfg = L.lireConfig([]);

  function maintenant() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return L.parseLocal(d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()));
  }

  // Prochain jour de la semaine voulu (0 = dimanche), au moins `apres` jours plus tard.
  function prochain(jourSemaine, apres, heure) {
    let j = L.debutDuJour(maintenant()) + apres * L.MIN_JOUR;
    while (L.jourSemaine(j) !== jourSemaine) j += L.MIN_JOUR;
    return j + heure;
  }

  const seanceFoot = prochain(3, 2, 20 * 60 + 45);   // mercredi 20h45
  const seanceJeu = prochain(5, 2, 21 * 60);          // vendredi 21h
  const location = prochain(2, 1, 7 * 60 + 15);       // mardi 7h15

  const donnees = {
    seances: [
      { id: L.formatLocal(seanceFoot), debut: seanceFoot, genre: 'film', titre: 'Soirée Ligue des champions', placesMax: 8, annulee: false },
      { id: L.formatLocal(seanceJeu), debut: seanceJeu, genre: 'jeu', titre: 'Tournoi de foot sur PS4', placesMax: 4, annulee: false }
    ],
    reservations: [
      { debut: location, fin: L.finLocation(location, 1, cfg), statut: 'Confirmée', instagram: 'demo.1' },
      { seanceId: L.formatLocal(seanceFoot), personnes: 5, statut: 'Confirmée', debut: null, fin: null, instagram: 'demo.2' },
      { seanceId: L.formatLocal(seanceJeu), personnes: 3, statut: 'Confirmée', debut: null, fin: null, instagram: 'demo.3' }
    ],
    indispos: []
  };
  let compteur = 0;

  const attendre = (valeur) => new Promise((ok) => setTimeout(() => ok(valeur), 450));

  window.LocaprojDemo = {
    init() {
      return attendre(L.etatPublic(maintenant(), donnees, cfg));
    },
    post(corps) {
      if (corps.action !== 'reserver') return attendre({ ok: true });
      if (corps.site) return attendre({ ok: true });
      const verdict = L.valider(corps, maintenant(), donnees, cfg);
      if (!verdict.ok) return attendre(verdict);
      const r = verdict.resa;
      r.id = 'DEMO-' + String(++compteur).padStart(3, '0');
      donnees.reservations.push({
        debut: r.debut, fin: r.fin, seanceId: r.seanceId, personnes: r.personnes,
        statut: 'Confirmée', instagram: r.instagram
      });
      return attendre({ ok: true, reservation: L.resumePublic(r, cfg) });
    }
  };
})();
