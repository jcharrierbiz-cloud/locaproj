// Teste dist/Code.gs (exactement le fichier collé dans Google) dans un faux
// environnement Apps Script : faux Google Sheet en paramètres français,
// faux Gmail, faux Agenda.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CODE = fs.readFileSync(path.join(__dirname, '..', 'dist', 'Code.gs'), 'utf8');

// ---------- Faux Google Sheet ----------

function deux(n) { return String(n).padStart(2, '0'); }

/** Imite la saisie dans une cellule d'un Sheet en français. */
function saisir(cellule, v) {
  cellule.formule = null;
  if (typeof v !== 'string') { cellule.v = v; return; }
  if (v.startsWith("'")) { cellule.v = v.slice(1); return; }
  if (v.startsWith('=')) { cellule.formule = v; cellule.v = '#FORMULE'; return; }
  if (cellule.fmt === '@') { cellule.v = v; return; }
  let m;
  if (/^\d+$/.test(v)) { cellule.v = Number(v); return; } // perd le 0 du début
  if (/^\d+,\d+$/.test(v)) { cellule.v = Number(v.replace(',', '.')); return; }
  if ((m = v.match(/^(\d{1,2})\.(\d{1,2})$/))) { cellule.v = new Date(2026, Number(m[2]) - 1, Number(m[1])); return; } // « 1.5 » = 1er mai
  if ((m = v.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/))) { cellule.v = new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]); return; }
  if ((m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) { cellule.v = new Date(+m[3], m[2] - 1, +m[1]); return; }
  cellule.v = v;
}

function afficher(c) {
  const v = c.v;
  if (v === '' || v === null || v === undefined) return '';
  if (v === true) return 'VRAI';
  if (v === false) return 'FAUX';
  if (typeof v === 'number') return String(v).replace('.', ',');
  if (v instanceof Date) {
    const d = deux(v.getDate()) + '/' + deux(v.getMonth() + 1) + '/' + v.getFullYear();
    return c.fmt === 'dd/mm/yyyy' ? d : d + ' ' + deux(v.getHours()) + ':' + deux(v.getMinutes()) + ':00';
  }
  return String(v);
}

function chainable(cible) {
  return new Proxy(cible, {
    get(t, p) { return p in t ? t[p] : () => chainable(t); }
  });
}

class FauxOnglet {
  constructor(nom) { this.nom = nom; this.lignes = []; }
  cell(r, c) {
    while (this.lignes.length < r) this.lignes.push([]);
    const l = this.lignes[r - 1];
    while (l.length < c) l.push({ v: '', fmt: this.fmtCol[l.length + 1] || null, formule: null });
    return l[c - 1];
  }
  get fmtCol() { return (this._fmt = this._fmt || {}); }
  getName() { return this.nom; }
  getMaxRows() { return 1000; }
  getLastRow() {
    for (let r = this.lignes.length; r > 0; r--) if (this.lignes[r - 1].some((c) => c.v !== '' && c.v !== null)) return r;
    return 0;
  }
  getLastColumn() {
    let max = 0;
    this.lignes.forEach((l) => l.forEach((c, i) => { if (c.v !== '' && c.v !== null) max = Math.max(max, i + 1); }));
    return max;
  }
  appendRow(valeurs) {
    const r = this.getLastRow() + 1;
    valeurs.forEach((v, i) => saisir(this.cell(r, i + 1), v));
  }
  getRange(a, b, nr, nc) {
    if (typeof a === 'string') {
      const [d] = a.split(':');
      const m = d.match(/^([A-Z]+)(\d+)$/);
      const col = m[1].split('').reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0);
      return this.getRange(Number(m[2]), col, 1, 1);
    }
    const onglet = this;
    nr = nr || 1; nc = nc || 1;
    const cases = (fn) => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) fn(onglet.cell(a + i, b + j), i, j); };
    const range = {
      setValues(vals) { cases((c, i, j) => saisir(c, vals[i][j])); return prox; },
      setValue(v) { cases((c) => saisir(c, v)); return prox; },
      getValues() { const res = []; for (let i = 0; i < nr; i++) { res.push([]); for (let j = 0; j < nc; j++) res[i].push(onglet.cell(a + i, b + j).v); } return res; },
      getDisplayValues() { const res = []; for (let i = 0; i < nr; i++) { res.push([]); for (let j = 0; j < nc; j++) res[i].push(afficher(onglet.cell(a + i, b + j))); } return res; },
      getFormula() { return onglet.cell(a, b).formule || ''; },
      setNumberFormat(f) {
        if (nr > 100) { for (let j = 0; j < nc; j++) onglet.fmtCol[b + j] = f; }
        cases((c) => { c.fmt = f; });
        return prox;
      },
      insertCheckboxes() { if (nr < 100) cases((c) => { if (c.v === '') c.v = false; }); return prox; }
    };
    const prox = chainable(range);
    return prox;
  }
}

function environnement() {
  const onglets = [];
  const mails = [];
  const evenements = [];
  const declencheurs = [];
  const quota = { restant: 100 };
  const ss = chainable({
    getSheetByName: (n) => onglets.find((o) => o.nom === n) || null,
    insertSheet: (n, idx) => { const o = chainable(new FauxOnglet(n)); idx === 0 ? onglets.unshift(o) : onglets.push(o); return o; },
    getSheets: () => onglets.slice(),
    deleteSheet: (o) => onglets.splice(onglets.indexOf(o), 1),
    getUrl: () => 'https://docs.google.com/spreadsheets/d/FAUX'
  });
  const tzParties = (date, tz) => {
    const p = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date).forEach((x) => { p[x.type] = x.value; });
    return p;
  };
  const ctx = {
    console: { log() {}, error() {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      flush() {},
      newDataValidation: () => chainable({}),
      getUi: () => chainable({})
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    MailApp: { sendEmail: (m) => { mails.push(m); quota.restant--; }, getRemainingDailyQuota: () => quota.restant },
    CalendarApp: {
      getDefaultCalendar: () => ({
        createEvent: (titre, debut, fin, o) => evenements.push({ titre, debut, fin, o, supprime: false }),
        getEvents: (a, b) => evenements.filter((e) => !e.supprime && e.debut < b && e.fin > a)
          .map((e) => ({ getTitle: () => e.titre, deleteEvent: () => { e.supprime = true; } }))
      })
    },
    ScriptApp: {
      getProjectTriggers: () => declencheurs.map((fn) => ({ getHandlerFunction: () => fn })),
      newTrigger: (fn) => { const b = { timeBased: () => b, everyDays: () => b, atHour: () => b, create: () => declencheurs.push(fn) }; return b; }
    },
    Utilities: {
      formatDate(date, tz, fmt) {
        const p = tzParties(date, tz);
        return fmt.replace("'T'", 'T').replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute);
      },
      parseDate(texte, tz) {
        const m = texte.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
        const voulu = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]);
        const p = tzParties(new Date(voulu), tz);
        const lu = Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute);
        return new Date(voulu - (lu - voulu));
      }
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s) => ({ contenu: s, setMimeType() { return this; } })
    }
  };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx);
  ctx.maintenant_ = () => ctx.Logic.parseLocal('2026-10-01T08:00'); // jeudi 1er octobre 2026, 8h
  ctx.installer();
  const onglet = (n) => ss.getSheetByName(n);
  const lignes = (n) => {
    const o = onglet(n);
    return o.getRange(1, 1, o.getLastRow(), o.getLastColumn()).getDisplayValues();
  };
  const objets = (n) => { const [h, ...rest] = lignes(n); return rest.map((l) => Object.fromEntries(h.map((k, i) => [k, l[i]]))); };
  const get = () => JSON.parse(ctx.doGet({ parameter: {} }).contenu);
  const post = (corps) => JSON.parse(ctx.doPost({ postData: { contents: typeof corps === 'string' ? corps : JSON.stringify(corps) } }).contenu);
  return { ctx, ss, onglet, lignes, objets, get, post, mails, evenements, declencheurs, quota };
}

const location = (extra) => Object.assign({
  action: 'reserver', offre: 'jour', jours: 1, debut: '2026-10-05T07:00',
  prenom: 'Léa', nom: 'Martin', instagram: '@Lea.Mrt', classe: '1re G3', interne: true,
  telephone: '06 12 34 56 78', email: 'lea@exemple.fr', engagement: true, site: ''
}, extra);

// ---------- Tests ----------

test('installer : crée les 6 onglets et la config par défaut', () => {
  const env = environnement();
  const noms = env.ss.getSheets().map((o) => o.getName());
  for (const n of ['Tableau de bord', 'Réservations', 'Séances', 'Indisponibilités', 'Config', 'Avis']) assert.ok(noms.includes(n), n);
  // « 1.5 » ne doit pas être devenu une date (piège des paramètres français)
  const cfg = env.ctx.config_();
  assert.equal(cfg.prix_jour_interne, 1.5);
  assert.equal(cfg.prix_seance_personne, 0.5);
  assert.equal(cfg.horaires_lundi, '07:00-08:00');
  assert.equal(cfg.enchainer_meme_matin, 'oui');
  assert.equal(cfg.horaires_retour, '07:00-08:00');
  assert.match(env.onglet('Tableau de bord').getRange(3, 2).getFormula(), /^=SUMIFS\('Réservations'!Q:Q,'Réservations'!S:S,TRUE\)$/);
  // Relancer installer ne duplique rien
  env.ctx.installer();
  assert.equal(env.objets('Config').length, Object.keys(env.ctx.Logic.DEFAUTS).length);
});

test('doGet : renvoie les créneaux sans donnée personnelle', () => {
  const env = environnement();
  env.post(location());
  const etat = env.get();
  assert.equal(etat.ok, true);
  assert.ok(etat.creneaux.jour.length > 0);
  assert.ok(!etat.creneaux.jour.includes('2026-10-05T07:00'));
  assert.ok(!JSON.stringify(etat).toLowerCase().includes('lea'));
});

test('réserver : ligne écrite, mails envoyés, agenda rempli', () => {
  const env = environnement();
  const r = env.post(location());
  assert.equal(r.ok, true, r.erreur);
  assert.equal(r.reservation.id, 'LP-0001');
  assert.equal(r.reservation.prix, 1.5);
  assert.equal(r.reservation.fin, '2026-10-06T08:00');
  assert.equal(r.reservation.retour, 'mardi 6 octobre au matin, entre 7h et 8h');
  const [ligne] = env.objets('Réservations');
  assert.equal(ligne['Instagram'], '@lea.mrt');
  assert.equal(ligne['Téléphone'], '0612345678');
  assert.equal(ligne['Remise'], '2026-10-05 07:00');
  assert.equal(ligne['Statut'], 'Confirmée');
  assert.equal(ligne['Payé'], 'FAUX');
  assert.equal(ligne['Prix (€)'], '1,5');
  assert.equal(env.mails.length, 2);
  assert.equal(env.mails[0].to, 'Locaproj.85@gmail.com');
  assert.equal(env.mails[1].to, 'lea@exemple.fr');
  assert.match(env.mails[1].htmlBody, /lundi 5 octobre à 7h/);
  assert.match(env.mails[1].htmlBody, /mardi 6 octobre au matin, entre 7h et 8h/);
  assert.equal(env.evenements.length, 2);
  assert.match(env.evenements[0].titre, /^📽️ Remise — Léa M\./);
  // 7h à Paris le 5 octobre (heure d'été) = 5h UTC
  assert.equal(env.evenements[0].debut.toISOString(), '2026-10-05T05:00:00.000Z');
  // Retour : mardi 7h-8h à Paris = 5h-6h UTC
  assert.equal(env.evenements[1].debut.toISOString(), '2026-10-06T05:00:00.000Z');
  assert.equal(env.evenements[1].fin.toISOString(), '2026-10-06T06:00:00.000Z');
});

test('réserver : un créneau pris ne peut pas être repris (relu depuis le Sheet)', () => {
  const env = environnement();
  assert.equal(env.post(location()).ok, true);
  const bis = env.post(location({ instagram: 'autre.personne', debut: '2026-10-05T07:15' }));
  assert.equal(bis.ok, false);
  assert.equal(bis.code, 'CRENEAU_INDISPO');
  const ter = env.post(location({ instagram: 'autre.personne', debut: '2026-10-07T07:00' }));
  assert.equal(ter.ok, true, ter.erreur);
  assert.equal(ter.reservation.id, 'LP-0002');
});

test('réserver : une location annulée dans le Sheet libère le créneau', () => {
  const env = environnement();
  env.post(location());
  const resas = env.onglet('Réservations');
  const colStatut = env.lignes('Réservations')[0].indexOf('Statut') + 1;
  resas.getRange(2, colStatut).setValue('Annulée');
  assert.ok(env.get().creneaux.jour.includes('2026-10-05T07:00'));
});

test('réserver : le champ piège bloque les robots sans rien écrire', () => {
  const env = environnement();
  const r = env.post(location({ site: 'http://spam' }));
  assert.equal(r.ok, false);
  assert.match(r.erreur, /Instagram/);
  assert.equal(env.objets('Réservations').length, 0);
  assert.equal(env.mails.length, 0);
});

test('réserver : pas de formule injectée, HTML échappé dans les mails', () => {
  const env = environnement();
  const r = env.post(location({ nom: '=HYPERLINK("http://x";"clic")', prenom: '<b>Léa</b>' }));
  assert.equal(r.ok, true, r.erreur);
  const resas = env.onglet('Réservations');
  const colNom = env.lignes('Réservations')[0].indexOf('Nom') + 1;
  assert.equal(resas.getRange(2, colNom).getFormula(), '');
  assert.match(env.lignes('Réservations')[1][colNom - 1], /^ =HYPERLINK/);
  assert.ok(env.mails[0].htmlBody.includes('&lt;b&gt;Léa&lt;/b&gt;'));
  assert.ok(!env.mails[0].htmlBody.includes('<b>Léa</b>'));
});

test('séance : inscription, compteur d\'inscrits, séance complète', () => {
  const env = environnement();
  env.onglet('Séances').appendRow(['08/10/2026', '20:30', 'Film / série / match', 'Soirée foot', '3']);
  const etat = env.get();
  assert.equal(etat.seances.length, 1);
  assert.deepEqual(etat.seances[0], { id: '2026-10-08T20:30', debut: '2026-10-08T20:30', genre: 'film', titre: 'Soirée foot', placesRestantes: 3, complet: false });
  const base = { action: 'reserver', offre: 'seance-film', seance: '2026-10-08T20:30', prenom: 'Tom', nom: 'B', classe: 'Tle', site: '' };
  const r = env.post(Object.assign({ instagram: 'tom', personnes: 2 }, base));
  assert.equal(r.ok, true, r.erreur);
  assert.equal(r.reservation.prix, 1);
  assert.equal(env.objets('Séances')[0]['Inscrits'], '2');
  assert.equal(env.evenements.length, 0, 'pas d\'événement agenda pour une séance');
  assert.equal(env.post(Object.assign({ instagram: 'zoe', personnes: 2 }, base)).code, 'COMPLET');
  assert.equal(env.get().seances[0].placesRestantes, 1);
  // La séance du jeudi 20h30 bloque la location jeudi 7h → vendredi, pas celle de mercredi → jeudi matin
  const jour = env.get().creneaux.jour;
  assert.ok(!jour.includes('2026-10-08T07:00'));
  assert.ok(jour.includes('2026-10-07T07:00'));
});

test('config : agenda désactivé depuis le Sheet', () => {
  const env = environnement();
  const config = env.onglet('Config');
  const ligne = env.lignes('Config').findIndex((l) => l[0] === 'agenda') + 1;
  config.getRange(ligne, 2).setValue('non');
  assert.equal(env.post(location()).ok, true);
  assert.equal(env.evenements.length, 0);
});

test('avis : enregistré, note invalide refusée', () => {
  const env = environnement();
  assert.equal(env.post({ action: 'avis', note: 4, plu: 'Image top', ameliorer: '', reviendrait: true, prenom: 'Léa' }).ok, true);
  assert.equal(env.post({ action: 'avis', note: 9 }).ok, false);
  const [avis] = env.objets('Avis');
  assert.equal(avis['Note /5'], '4');
  assert.equal(avis['Reviendrait'], 'oui');
});

test('requêtes invalides', () => {
  const env = environnement();
  assert.equal(env.post('pas du json').ok, false);
  assert.equal(env.post({ action: 'pirater' }).ok, false);
  assert.equal(JSON.parse(env.ctx.doGet({ parameter: { action: 'tout' } }).contenu).ok, false);
});

test('anonymiser : efface les infos perso après 3 mois, garde le prix', () => {
  const env = environnement();
  env.post(location());
  env.ctx.maintenant_ = () => env.ctx.Logic.parseLocal('2027-02-01T08:00');
  assert.equal(env.ctx.anonymiser(), 1);
  const [ligne] = env.objets('Réservations');
  assert.equal(ligne['Nom'], '—');
  assert.equal(ligne['Instagram'], '—');
  assert.equal(ligne['Prix (€)'], '1,5');
  assert.equal(env.ctx.anonymiser(), 0);
});

// ---------- Correctifs après relecture ----------

const ligneManuelle = (valeurs) => {
  const cols = ['ID', 'Créée le', 'Formule', 'Remise', 'Retour', 'Jours', 'Séance', 'Personnes', 'Prénom', 'Nom', 'Instagram',
    'Classe', 'Interne', 'Téléphone', 'Email', 'Message', 'Prix (€)', 'Statut', 'Payé', 'Notes'];
  return cols.map((c) => (c in valeurs ? valeurs[c] : ''));
};

test('ligne ajoutée à la main sans ID ni retour : elle bloque jusqu\'au lendemain matin', () => {
  const env = environnement();
  env.onglet('Réservations').appendRow(ligneManuelle({ Remise: '2026-10-05 07:00', Prénom: 'Ami' }));
  const jour = env.get().creneaux.jour;
  assert.ok(!jour.includes('2026-10-05T07:00'));
  assert.ok(jour.includes('2026-10-06T07:00'), 'retour supposé mardi matin : il peut repartir après');
  assert.ok(!jour.some((s) => s.startsWith('2026-10-05')), 'lundi : déjà pris');
  assert.equal(env.post(location()).code, 'CRENEAU_INDISPO');
});

test('date illisible saisie à la main : plus aucune location tant que ce n\'est pas corrigé', () => {
  const env = environnement();
  env.onglet('Réservations').appendRow(ligneManuelle({ Remise: '05/10 12:30', Retour: '06/10 12:30', Statut: 'Confirmée' }));
  const etat = env.get();
  assert.deepEqual(etat.creneaux.jour, []);
  assert.equal(env.post(location()).ok, false);
});

test('quota mail bas : la réservation passe, seule votre alerte part', () => {
  const env = environnement();
  env.quota.restant = 10;
  assert.equal(env.post(location()).ok, true);
  assert.equal(env.mails.length, 1);
  assert.equal(env.mails[0].to, 'Locaproj.85@gmail.com');
});

test('agenda : ni téléphone ni message dans l\'événement', () => {
  const env = environnement();
  env.post(location({ message: 'devant le CDI' }));
  const desc = env.evenements[0].o.description;
  assert.ok(!desc.includes('0612345678') && !desc.includes('CDI'));
});

test('avis : 10 par heure maximum', () => {
  const env = environnement();
  for (let i = 0; i < 10; i++) assert.equal(env.post({ action: 'avis', note: 5 }).ok, true, 'avis ' + i);
  assert.equal(env.post({ action: 'avis', note: 5 }).ok, false);
});

test('installer : déclencheur d\'anonymisation nocturne créé une seule fois', () => {
  const env = environnement();
  env.ctx.installer();
  assert.deepEqual(env.declencheurs, ['anonymiser']);
});

test('anonymiser : supprime aussi les événements d\'agenda de plus de 3 mois', () => {
  const env = environnement();
  env.post(location());
  assert.equal(env.evenements.length, 2);
  env.ctx.anonymiser();
  assert.ok(env.evenements.every((e) => !e.supprime), 'récents : gardés');
  env.ctx.maintenant_ = () => env.ctx.Logic.parseLocal('2027-02-01T08:00');
  env.ctx.anonymiser();
  assert.ok(env.evenements.every((e) => e.supprime), 'anciens : supprimés');
});

test('séance annulée avec « oui » : elle disparaît du site', () => {
  const env = environnement();
  env.onglet('Séances').appendRow(['08/10/2026', '20:30', 'Jeu PS4', 'Tournoi', '4', '', 'oui']);
  assert.equal(env.get().seances.length, 0);
});

test('config : enchaîner le même matin (oui par défaut, non depuis le Sheet)', () => {
  const env = environnement();
  const ligne = env.lignes('Config').findIndex((l) => l[0] === 'enchainer_meme_matin') + 1;
  assert.ok(ligne > 0, 'le réglage est créé par installer');
  assert.equal(env.post(location()).ok, true);
  assert.ok(env.get().creneaux.jour.includes('2026-10-06T07:00'), 'oui : il repart mardi matin');
  assert.equal(env.post(location({ instagram: 'suivant', debut: '2026-10-06T07:30' })).ok, true);
  env.onglet('Config').getRange(ligne, 2).setValue('non');
  assert.ok(!env.get().creneaux.jour.some((s) => s.startsWith('2026-10-07')), 'non : mercredi matin bloqué par le retour du 2e');
});
