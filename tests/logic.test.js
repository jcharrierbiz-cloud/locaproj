const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../assets/logic.js');

// Jeudi 1er octobre 2026, 8h00 (heure de Paris)
const MAINTENANT = L.parseLocal('2026-10-01T08:00');
// Configuration de test à 3 créneaux par jour, pour couvrir le cas « plusieurs créneaux ».
// Le réglage réel par défaut (7h-8h seulement) est testé plus bas avec L.lireConfig([]).
// Elle garde enchainer_meme_matin = non pour tester la marge entre deux locations.
const TROIS_CRENEAUX = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi']
  .map((j) => ['horaires_' + j, '07:00-08:00, 12:30-13:30, 17:30-18:30'])
  .concat([['enchainer_meme_matin', 'non']]);
const conf = (extra) => L.lireConfig(TROIS_CRENEAUX.concat(extra || []));
const cfg = conf();
const vide = () => ({ reservations: [], seances: [], indispos: [] });
const t = (s) => L.parseLocal(s);
const f = (liste) => liste.map(L.formatLocal);

test('dates : lecture et écriture aller-retour', () => {
  assert.equal(L.formatLocal(t('2026-10-05T12:30')), '2026-10-05T12:30');
  assert.equal(t('2026-10-05 12:30'), t('2026-10-05T12:30'));
  assert.equal(t('05/10/2026 12:30'), t('2026-10-05T12:30'));
  assert.equal(t('05/10/2026 12:30:00'), t('2026-10-05T12:30'));
  assert.equal(L.parseDate('5/10/26'), t('2026-10-05T00:00'));
  assert.equal(L.parseLocal(''), null);
  assert.equal(L.parseLocal('31/02/2026'), null);
  assert.equal(L.parseLocal('pas une date'), null);
  assert.equal(L.parseHeure('20h30'), 20 * 60 + 30);
  assert.equal(L.parseHeure('20h'), 20 * 60);
  assert.equal(L.parseHeure('25:00'), null);
  assert.equal(L.jourSemaine(MAINTENANT), 4); // jeudi
});

test('dates : affichage en français', () => {
  assert.equal(L.formatHumain(t('2026-10-05T12:30')), 'lundi 5 octobre à 12h30');
  assert.equal(L.formatHumain(t('2026-10-08T20:00')), 'jeudi 8 octobre à 20h');
  assert.equal(L.formatJourCourt(t('2026-10-02T00:00')), 'ven. 2 oct.');
  assert.equal(L.formatPrix(1.5), '1,50 €');
  assert.equal(L.formatPrix(2), '2 €');
});

test('horaires : formats acceptés dans le Google Sheet', () => {
  assert.deepEqual(L.parseHoraires('12:30-13:30, 17:30-18:30'), [[750, 810], [1050, 1110]]);
  assert.deepEqual(L.parseHoraires('12h-14h'), [[720, 840]]);
  assert.deepEqual(L.parseHoraires('12h30 à 13h30 / 17h30 - 18h'), [[750, 810], [1050, 1080]]);
  assert.deepEqual(L.parseHoraires(''), []);
  assert.deepEqual(L.parseHoraires('14:00-12:00'), []);
});

test('config : virgules décimales, valeurs invalides ignorées, clés inconnues ignorées', () => {
  const c = L.lireConfig([['prix_jour', '2,5'], ['delai_min_heures', 'abc'], ['inconnue', 'x'], ['lieu', ' devant le CDI '], ['horizon_jours', 0]]);
  assert.equal(c.prix_jour, 2.5);
  assert.equal(c.delai_min_heures, cfg.delai_min_heures);
  assert.equal(c.inconnue, undefined);
  assert.equal(c.lieu, 'devant le CDI');
  assert.equal(c.horizon_jours, 0);
});

test('prix : grille validée par Johan', () => {
  assert.equal(L.prixLocation('jour', 1, false, cfg), 2);
  assert.equal(L.prixLocation('jour', 1, true, cfg), 1.5);
  assert.equal(L.prixLocation('2jours', 2, true, cfg), 3);
  assert.equal(L.prixLocation('weekend', 3, false, cfg), 4);
  assert.equal(L.prixLocation('longue', 3, false, cfg), 4.5);
  assert.equal(L.prixLocation('longue', 7, false, cfg), 10.5); // 3 € + 5 × 1,50 €
  assert.equal(L.prixLocation('longue', 8, false, cfg), null);
  assert.equal(L.prixLocation('longue', 2, false, cfg), null);
  assert.equal(L.prixLocation('longue', 3.5, false, cfg), null);
  assert.equal(L.prixSeance(3, cfg), 1.5);
});

test('créneaux 1 journée : retour un jour de remise, pas de vendredi', () => {
  const c = f(L.creneaux('jour', 1, MAINTENANT, vide(), cfg));
  // Jeudi : 8 créneaux (4 le midi, 4 le soir), retour vendredi
  assert.deepEqual(c.filter((s) => s.startsWith('2026-10-01')), [
    '2026-10-01T12:30', '2026-10-01T12:45', '2026-10-01T13:00', '2026-10-01T13:15',
    '2026-10-01T17:30', '2026-10-01T17:45', '2026-10-01T18:00', '2026-10-01T18:15'
  ]);
  // Vendredi → samedi : impossible. Week-end : rien.
  assert.equal(c.filter((s) => /^2026-10-0[234]/.test(s)).length, 0);
  assert.ok(c.includes('2026-10-05T12:30'));
});

test('créneaux : délai minimum avant la remise', () => {
  const midi = t('2026-10-01T12:00');
  const c = f(L.creneaux('jour', 1, midi, vide(), cfg));
  assert.equal(c[0], '2026-10-01T17:30'); // 12h30-13h15 sont à moins de 2 h
});

test('créneaux : horizon de réservation', () => {
  const c = L.creneaux('jour', 1, MAINTENANT, vide(), cfg);
  const max = MAINTENANT + (cfg.horizon_jours + 1) * L.MIN_JOUR;
  assert.ok(c.every((m) => m < max));
});

test('créneaux week-end : uniquement le vendredi, retour le lundi', () => {
  const c = L.creneaux('weekend', 3, MAINTENANT, vide(), cfg);
  assert.ok(c.length > 0);
  assert.ok(c.every((m) => L.jourSemaine(m) === 5));
  assert.equal(L.formatLocal(c[0]), '2026-10-02T07:00');
});

test('créneaux 2 journées : pas de départ jeudi ni vendredi', () => {
  const c = f(L.creneaux('2jours', 2, MAINTENANT, vide(), cfg));
  assert.ok(!c.some((s) => s.startsWith('2026-10-01') || s.startsWith('2026-10-02')));
  assert.ok(c.includes('2026-10-05T12:30')); // lundi → mercredi
});

test('créneaux location longue : 3 jours depuis le vendredi = retour lundi', () => {
  const c = f(L.creneaux('longue', 3, MAINTENANT, vide(), cfg));
  assert.ok(c.includes('2026-10-02T17:30'));
  assert.deepEqual(L.creneaux('longue', 9, MAINTENANT, vide(), cfg), []);
});

test('conflit : une location bloque le projecteur jusqu\'au retour du matin (marge comprise)', () => {
  const d = vide();
  // Remise lundi 17h30, retour mardi matin (fin du créneau : 8h)
  d.reservations.push({ debut: t('2026-10-05T17:30'), fin: t('2026-10-06T08:00'), statut: 'Confirmée' });
  const c = f(L.creneaux('jour', 1, MAINTENANT, d, cfg));
  assert.ok(!c.includes('2026-10-05T07:00'), 'serait rendu mardi matin, pendant la location');
  assert.ok(!c.includes('2026-10-05T12:30'));
  assert.ok(!c.includes('2026-10-05T17:30'));
  assert.ok(!c.some((s) => s.startsWith('2026-10-06T07')), 'mardi matin : le projecteur revient à peine');
  assert.ok(c.includes('2026-10-06T12:30'), 'mardi midi : de nouveau libre');
  assert.ok(c.includes('2026-10-01T17:30'), 'jeudi soir → vendredi matin : avant la location');
});

test('conflit : une location annulée ou rendue ne bloque plus', () => {
  const d = vide();
  d.reservations.push({ debut: t('2026-10-05T17:30'), fin: t('2026-10-06T17:30'), statut: 'Annulée' });
  d.reservations.push({ debut: t('2026-10-07T12:30'), fin: t('2026-10-08T12:30'), statut: 'Rendu' });
  const c = f(L.creneaux('jour', 1, MAINTENANT, d, cfg));
  assert.ok(c.includes('2026-10-05T17:30'));
  assert.ok(c.includes('2026-10-07T12:30'));
});

test('conflit : une séance bloque le projecteur 4 h', () => {
  const d = vide();
  d.seances.push({ id: '2026-10-07T20:30', debut: t('2026-10-07T20:30'), genre: 'film', annulee: false });
  const c = f(L.creneaux('jour', 1, MAINTENANT, d, cfg));
  assert.ok(c.includes('2026-10-06T17:30'), 'rendu mercredi 17h30, avant la séance');
  assert.ok(!c.includes('2026-10-07T12:30'), 'serait dehors pendant la séance');
  assert.ok(c.includes('2026-10-08T12:30'));
});

test('conflit : vacances (indisponibilités) bloquent départs, retours et traversées', () => {
  const d = vide();
  d.indispos.push({ du: L.parseDate('19/10/2026'), au: L.parseDate('30/10/2026') });
  const jour = f(L.creneaux('jour', 1, MAINTENANT, d, cfg));
  assert.ok(!jour.some((s) => s >= '2026-10-18' && s < '2026-10-31'));
  assert.ok(jour.includes('2026-10-15T12:30'));
  const we = f(L.creneaux('weekend', 3, MAINTENANT, d, cfg));
  assert.ok(!we.includes('2026-10-16T12:30'), 'retour le lundi 19, en vacances');
});

test('séances : places restantes et séances passées ou annulées masquées', () => {
  const d = vide();
  d.seances.push(
    { id: '2026-10-08T20:30', debut: t('2026-10-08T20:30'), genre: 'film', titre: 'Soirée foot', placesMax: 6, annulee: false },
    { id: '2026-09-30T20:30', debut: t('2026-09-30T20:30'), genre: 'film', placesMax: 6, annulee: false },
    { id: '2026-10-09T20:30', debut: t('2026-10-09T20:30'), genre: 'jeu', placesMax: null, annulee: true }
  );
  d.reservations.push(
    { seanceId: '2026-10-08T20:30', personnes: 2, statut: 'Confirmée', debut: null, fin: null },
    { seanceId: '2026-10-08T20:30', personnes: 3, statut: 'Confirmée', debut: null, fin: null },
    { seanceId: '2026-10-08T20:30', personnes: 4, statut: 'Annulée', debut: null, fin: null }
  );
  const s = L.seancesAVenir(MAINTENANT, d, cfg);
  assert.equal(s.length, 1);
  assert.equal(s[0].placesRestantes, 1);
  assert.equal(s[0].titre, 'Soirée foot');
});

const demandeLocation = (extra) => Object.assign({
  offre: 'jour', jours: 1, debut: '2026-10-05T12:30', prenom: 'Léa', nom: 'Martin',
  instagram: '@Lea.Mrt', classe: '1re G3', interne: true, engagement: true
}, extra);

test('validation : location correcte → prix et retour recalculés', () => {
  const r = L.valider(demandeLocation({ prix: 0 }), MAINTENANT, vide(), cfg);
  assert.equal(r.ok, true, r.erreur);
  assert.equal(r.resa.prix, 1.5); // le prix envoyé par le navigateur est ignoré
  assert.equal(L.formatLocal(r.resa.fin), '2026-10-06T08:00');
  assert.equal(r.resa.instagram, 'lea.mrt');
});

test('validation : champs obligatoires et formats', () => {
  const cas = [
    [{ prenom: '' }, 'CHAMP'], [{ nom: '  ' }, 'CHAMP'], [{ instagram: 'pas valide !' }, 'CHAMP'],
    [{ classe: '' }, 'CHAMP'], [{ telephone: '12' }, 'CHAMP'], [{ email: 'lea@' }, 'CHAMP'],
    [{ engagement: false }, 'ENGAGEMENT'], [{ offre: 'inconnue' }, 'OFFRE'],
    [{ debut: '2026-10-02T12:30' }, 'CRENEAU_INDISPO'], [{ debut: '2026-10-05T12:31' }, 'CRENEAU_INDISPO'],
    [{ offre: 'longue', jours: 12 }, 'DUREE']
  ];
  for (const [extra, code] of cas) {
    const r = L.valider(demandeLocation(extra), MAINTENANT, vide(), cfg);
    assert.equal(r.ok, false, JSON.stringify(extra));
    assert.equal(r.code, code, JSON.stringify(extra));
  }
  const ok = L.valider(demandeLocation({ telephone: '06 12 34 56 78', email: 'Lea@Mail.fr' }), MAINTENANT, vide(), cfg);
  assert.equal(ok.ok, true);
  assert.equal(ok.resa.telephone, '0612345678');
  assert.equal(ok.resa.email, 'lea@mail.fr');
});

test('validation : créneau déjà pris → refusé', () => {
  const d = vide();
  d.reservations.push({ debut: t('2026-10-05T12:30'), fin: t('2026-10-06T12:30'), statut: 'Confirmée', instagram: 'autre' });
  const r = L.valider(demandeLocation(), MAINTENANT, d, cfg);
  assert.equal(r.code, 'CRENEAU_INDISPO');
});

test('validation : 2 réservations en cours maximum par compte Instagram', () => {
  const d = vide();
  d.reservations.push(
    { debut: t('2026-10-12T12:30'), fin: t('2026-10-13T12:30'), statut: 'Confirmée', instagram: '@lea.mrt' },
    { seanceId: '2026-10-08T20:30', personnes: 1, statut: 'Confirmée', debut: null, fin: null, instagram: 'LEA.MRT' },
    { debut: t('2026-09-20T12:30'), fin: t('2026-09-21T12:30'), statut: 'Rendu', instagram: 'lea.mrt' }
  );
  assert.equal(L.valider(demandeLocation(), MAINTENANT, d, cfg).code, 'LIMITE');
  d.reservations[0].statut = 'Annulée';
  assert.equal(L.valider(demandeLocation(), MAINTENANT, d, cfg).ok, true);
});

test('validation : location longue de 4 jours', () => {
  const r = L.valider(demandeLocation({ offre: 'longue', jours: 4, debut: '2026-10-05T17:30' }), MAINTENANT, vide(), cfg);
  assert.equal(r.ok, true, r.erreur);
  assert.equal(r.resa.prix, 6);
  assert.equal(L.formatLocal(r.resa.fin), '2026-10-09T08:00');
});

test('validation : inscription à une séance', () => {
  const d = vide();
  d.seances.push({ id: '2026-10-08T20:30', debut: t('2026-10-08T20:30'), genre: 'film', placesMax: 4, annulee: false });
  const base = { offre: 'seance-film', seance: '2026-10-08T20:30', prenom: 'Tom', nom: 'B', instagram: 'tom', classe: 'Tle' };
  const ok = L.valider(Object.assign({ personnes: 3 }, base), MAINTENANT, d, cfg);
  assert.equal(ok.ok, true, ok.erreur);
  assert.equal(ok.resa.prix, 1.5);
  assert.equal(ok.resa.debut, null);
  assert.equal(L.valider(Object.assign({ personnes: 5 }, base), MAINTENANT, d, cfg).code, 'COMPLET');
  assert.equal(L.valider(Object.assign({ personnes: 0 }, base), MAINTENANT, d, cfg).code, 'PERSONNES');
  assert.equal(L.valider(Object.assign({}, base, { personnes: 1, offre: 'seance-jeu' }), MAINTENANT, d, cfg).code, 'SEANCE');
  assert.equal(L.valider(Object.assign({}, base, { personnes: 1, seance: '2026-10-09T20:30' }), MAINTENANT, d, cfg).code, 'SEANCE');
});

test('état public : toutes les formules, aucune donnée personnelle', () => {
  const d = vide();
  d.reservations.push({ debut: t('2026-10-05T17:30'), fin: t('2026-10-06T17:30'), statut: 'Confirmée',
    instagram: 'secret.handle', prenom: 'Secret', telephone: '0611111111' });
  const e = L.etatPublic(MAINTENANT, d, cfg);
  assert.equal(e.offres.length, 6);
  for (const cle of ['jour', '2jours', 'weekend', 'longue-3', 'longue-7']) assert.ok(Array.isArray(e.creneaux[cle]), cle);
  const json = JSON.stringify(e);
  assert.ok(!json.includes('secret') && !json.includes('0611111111'));
});

test('échappement HTML des saisies', () => {
  assert.equal(L.echapperHtml('<b>"x"</b> & \'y\''), '&lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; &#39;y&#39;');
});

// ---------- Correctifs après relecture ----------

test('retour : le jour du retour doit être un jour de remise', () => {
  const c2 = conf([['horaires_mercredi', '']]);
  const c = f(L.creneaux('jour', 1, MAINTENANT, vide(), c2));
  assert.ok(!c.some((x) => x.startsWith('2026-10-06')), 'mardi → mercredi : pas de retour possible');
  assert.ok(!c.some((x) => x.startsWith('2026-10-07')), 'mercredi : pas de remise');
  assert.ok(c.includes('2026-10-05T17:30'), 'lundi → mardi matin : OK');
  assert.deepEqual(L.creneaux('jour', 1, MAINTENANT, vide(), conf([['horaires_retour', '']])), [], 'sans créneau de retour, pas de location');
});

test('séances : marge avec les locations, et séance masquée si elle tombe pendant une location', () => {
  const d = vide();
  d.reservations.push({ debut: t('2026-10-06T12:30'), fin: t('2026-10-07T12:30'), statut: 'Confirmée' });
  d.seances.push(
    { id: '2026-10-07T12:45', debut: t('2026-10-07T12:45'), genre: 'film', annulee: false },
    { id: '2026-10-06T20:30', debut: t('2026-10-06T20:30'), genre: 'film', annulee: false },
    { id: '2026-10-08T20:30', debut: t('2026-10-08T20:30'), genre: 'film', annulee: false }
  );
  assert.deepEqual(L.seancesAVenir(MAINTENANT, d, cfg).map((s) => s.id), ['2026-10-08T20:30']);
  const r = L.valider({ offre: 'seance-film', seance: '2026-10-06T20:30', personnes: 1, prenom: 'A', nom: 'B', instagram: 'ab', classe: 'Tle' }, MAINTENANT, d, cfg);
  assert.equal(r.code, 'SEANCE');
  // La marge s'applique aussi entre une séance et une location qui démarre juste après
  const d2 = vide();
  d2.seances.push({ id: '2026-10-05T08:30', debut: t('2026-10-05T08:30'), genre: 'film', annulee: false });
  const c = f(L.creneaux('jour', 1, MAINTENANT, d2, conf([['blocage_seance_heures', '4']])));
  assert.ok(!c.includes('2026-10-05T12:30') && c.includes('2026-10-05T13:00'), '8h30 + 4 h + 30 min de marge = 13h');
});

test('ligne illisible saisie à la main : plus aucune location proposée (prudence)', () => {
  const d = vide();
  d.reservations.push({ illisible: true, statut: 'Confirmée', debut: null, fin: null });
  assert.deepEqual(L.creneaux('jour', 1, MAINTENANT, d, cfg), []);
  assert.equal(L.valider(demandeLocation(), MAINTENANT, d, cfg).code, 'CRENEAU_INDISPO');
  d.reservations[0].statut = 'Annulée';
  assert.ok(L.creneaux('jour', 1, MAINTENANT, d, cfg).length > 0);
});

test('anti-abus : débit global par heure et par jour', () => {
  const d = vide();
  for (let i = 0; i < 6; i++) d.reservations.push({ creeLe: MAINTENANT - 10, statut: 'Annulée', instagram: 'x' + i });
  assert.equal(L.valider(demandeLocation(), MAINTENANT, d, cfg).code, 'SATURE');
  d.reservations.forEach((r) => { r.creeLe = MAINTENANT - 120; });
  assert.equal(L.valider(demandeLocation(), MAINTENANT, d, cfg).ok, true);
  for (let i = 0; i < 9; i++) d.reservations.push({ creeLe: MAINTENANT - 600, statut: 'Annulée', instagram: 'y' + i });
  assert.equal(L.valider(demandeLocation(), MAINTENANT, d, cfg).code, 'SATURE');
});

test('anti-abus : 2 réservations en cours maximum par e-mail aussi', () => {
  const d = vide();
  d.reservations.push(
    { debut: t('2026-10-12T12:30'), fin: t('2026-10-13T12:30'), statut: 'Confirmée', instagram: 'a', email: 'Lea@Mail.fr' },
    { debut: t('2026-10-14T12:30'), fin: t('2026-10-15T12:30'), statut: 'Confirmée', instagram: 'b', email: 'lea@mail.fr' }
  );
  assert.equal(L.valider(demandeLocation({ email: 'lea@mail.fr' }), MAINTENANT, d, cfg).code, 'LIMITE');
  assert.equal(L.valider(demandeLocation({ email: '' }), MAINTENANT, d, cfg).ok, true);
});

test('Instagram : apostrophe ou espaces parasites ignorés', () => {
  assert.equal(L.normaliserInsta("'@Lea.Mrt"), 'lea.mrt');
  assert.equal(L.normaliserInsta('  @@lea'), 'lea');
});

// ---------- Retour le matin qui suit la dernière journée (demande du 2026-10-01) ----------

test('retour : le matin qui suit la dernière journée, entre 7h et 8h', () => {
  assert.equal(L.formatLocal(L.finLocation(t('2026-10-05T17:30'), 1, cfg)), '2026-10-06T08:00');
  assert.equal(L.formatLocal(L.finLocation(t('2026-10-05T07:00'), 1, cfg)), '2026-10-06T08:00');
  assert.equal(L.formatLocal(L.finLocation(t('2026-10-02T07:00'), 3, cfg)), '2026-10-05T08:00', 'week-end : lundi matin');
  assert.equal(L.formatLocal(L.debutRetour(t('2026-10-06T08:00'), cfg)), '2026-10-06T07:00');
  assert.equal(L.formatRetour(t('2026-10-06T08:00'), cfg), 'mardi 6 octobre au matin, entre 7h et 8h');
  assert.equal(L.formatRetour(t('2026-10-06T19:00'), L.lireConfig([['horaires_retour', '18:00-19:00']])), 'mardi 6 octobre, entre 18h et 19h');
});

test('remise : le matin entre 7h et 8h, ou à un autre créneau proposé', () => {
  const c = f(L.creneaux('jour', 1, MAINTENANT, vide(), cfg));
  for (const h of ['07:00', '07:15', '07:30', '07:45', '12:30', '17:30']) assert.ok(c.includes('2026-10-05T' + h), h);
  assert.ok(!c.includes('2026-10-05T08:00'), '8h = fin du créneau du matin');
});

test('état public : le site reçoit le créneau de retour', () => {
  const e = L.etatPublic(MAINTENANT, vide(), cfg);
  assert.equal(e.horairesRetour, '07:00-08:00');
  const r = L.valider(demandeLocation(), MAINTENANT, vide(), cfg);
  const pub = L.resumePublic(Object.assign({ id: 'LP-0001' }, r.resa), cfg);
  assert.equal(pub.retour, 'mardi 6 octobre au matin, entre 7h et 8h');
  assert.equal(pub.retourDebut, '2026-10-06T07:00');
});

// ---------- Réglage réel : remise de 7h à 8h seulement (demande du 2026-10-01) ----------

const reel = L.lireConfig([]);

test('réglage par défaut : remise uniquement le matin entre 7h et 8h', () => {
  const c = f(L.creneaux('jour', 1, MAINTENANT, vide(), reel));
  assert.ok(c.length > 0);
  assert.ok(c.every((s) => /T07:(00|15|30|45)$/.test(s)), 'que des créneaux 7h, 7h15, 7h30, 7h45');
  assert.equal(c[0], '2026-10-05T07:00', 'jeudi 7h est passé ; vendredi → samedi impossible ; donc lundi');
});

test('enchaîner le même matin = non : le projecteur repart le surlendemain', () => {
  const non = L.lireConfig([['enchainer_meme_matin', 'non']]);
  const d = vide();
  // Location lundi 7h15 → retour mardi matin
  d.reservations.push({ debut: t('2026-10-05T07:15'), fin: L.finLocation(t('2026-10-05T07:15'), 1, non), statut: 'Confirmée' });
  const c = f(L.creneaux('jour', 1, MAINTENANT, d, non));
  assert.ok(!c.some((s) => s.startsWith('2026-10-06')), 'mardi matin : il revient, il ne repart pas');
  assert.ok(c.includes('2026-10-07T07:00'), 'mercredi matin : libre');
  // Et une location ne peut pas finir le matin où une autre commence
  assert.ok(!f(L.creneaux('weekend', 3, MAINTENANT, d, non)).some((s) => s.startsWith('2026-10-02')),
    'le week-end se rendrait lundi matin, le jour où il repart');
});

test('enchaîner le même matin = oui (par défaut) : le client suivant le prend le matin du retour', () => {
  const oui = reel;
  assert.equal(oui.enchainer_meme_matin, 'oui');
  const d = vide();
  d.reservations.push({ debut: t('2026-10-05T07:15'), fin: L.finLocation(t('2026-10-05T07:15'), 1, oui), statut: 'Confirmée' });
  const c = f(L.creneaux('jour', 1, MAINTENANT, d, oui));
  assert.ok(c.includes('2026-10-06T07:00'), 'mardi matin : il repart après le retour');
  assert.ok(!c.some((s) => s.startsWith('2026-10-05')), 'lundi : déjà loué');
  // Le week-end d'avant peut se rendre le lundi matin où il repart
  assert.ok(f(L.creneaux('weekend', 3, MAINTENANT, d, oui)).includes('2026-10-02T07:00'));
  // Le client d'après (mardi matin) ne gêne pas
  const r = L.valider(demandeLocation({ debut: '2026-10-06T07:30' }), MAINTENANT, d, oui);
  assert.equal(r.ok, true, r.erreur);
  // Deux locations le même lundi restent impossibles
  assert.equal(L.valider(demandeLocation({ debut: '2026-10-05T07:45' }), MAINTENANT, d, oui).code, 'CRENEAU_INDISPO');
});
