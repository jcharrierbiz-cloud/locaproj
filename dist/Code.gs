// ================================================================
// locaproj — Code.gs (fichier généré : ne pas modifier à la main)
// Source : assets/logic.js + apps-script/server.js
// Regénérer avec : npm run build
// ================================================================
/*
 * locaproj — logique de réservation (fichier unique, sans dépendance).
 *
 * Utilisé à trois endroits :
 *   - le site (navigateur), pour les prix, les dates et le mode démo ;
 *   - le serveur Google Apps Script (copié dans dist/Code.gs par scripts/build-gs.js) ;
 *   - les tests Node (tests/).
 *
 * Convention sur les dates : tout est en heure de Paris « murale ».
 * Une date = un nombre de minutes (Date.UTC lu comme heure locale), ce qui
 * évite tout décalage de fuseau ou de changement d'heure dans les calculs.
 */
var Logic = (function () {
  'use strict';

  var MIN_JOUR = 1440;
  var CLES_JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
    'septembre', 'octobre', 'novembre', 'décembre'];
  var MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août',
    'sept.', 'oct.', 'nov.', 'déc.'];

  var DEFAUTS = {
    lieu: 'au Roc',
    prix_projecteur: 45,
    prix_jour: 2,
    prix_jour_interne: 1.5,
    prix_2jours: 3,
    prix_weekend: 4,
    prix_jour_sup: 1.5,
    prix_seance_personne: 0.5,
    horaires_lundi: '07:00-08:00',
    horaires_mardi: '07:00-08:00',
    horaires_mercredi: '07:00-08:00',
    horaires_jeudi: '07:00-08:00',
    horaires_vendredi: '07:00-08:00',
    horaires_samedi: '',
    horaires_dimanche: '',
    horaires_retour: '07:00-08:00',
    enchainer_meme_matin: 'oui',
    pas_creneau_min: 15,
    delai_min_heures: 2,
    horizon_jours: 21,
    marge_entre_locations_min: 30,
    blocage_seance_heures: 4,
    duree_max_jours: 7,
    max_resas_actives_par_insta: 2,
    max_resas_par_heure: 6,
    max_resas_par_jour: 15,
    places_max_par_resa: 10,
    email_notif: 'Locaproj.85@gmail.com',
    agenda: 'oui'
  };

  // ---------- Dates ----------

  function depuisParties(annee, mois, jour, heure, minute) {
    var d = new Date(Date.UTC(annee, mois - 1, jour, heure || 0, minute || 0));
    // Rejette les dates impossibles (31/02, 25h…)
    if (d.getUTCFullYear() !== annee || d.getUTCMonth() !== mois - 1 || d.getUTCDate() !== jour) return null;
    return Math.round(d.getTime() / 60000);
  }

  function parties(min) {
    var d = new Date(min * 60000);
    return {
      annee: d.getUTCFullYear(), mois: d.getUTCMonth() + 1, jour: d.getUTCDate(),
      heure: d.getUTCHours(), minute: d.getUTCMinutes(), jourSemaine: d.getUTCDay()
    };
  }

  /** "20:30", "20h30", "20h", "20" → minutes depuis minuit. */
  function parseHeure(texte) {
    var m = String(texte == null ? '' : texte).trim().match(/^(\d{1,2})\s*(?:[:hH]\s*(\d{2})?)?(?::\d{2})?$/);
    if (!m) return null;
    var h = Number(m[1]), mi = Number(m[2] || 0);
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }

  /** "05/10/2026", "5/10/26", "2026-10-05" → minutes à minuit. */
  function parseDate(texte) {
    var s = String(texte == null ? '' : texte).trim();
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return depuisParties(Number(m[1]), Number(m[2]), Number(m[3]));
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (m) {
      var annee = Number(m[3]);
      if (annee < 100) annee += 2000;
      return depuisParties(annee, Number(m[2]), Number(m[1]));
    }
    return null;
  }

  /** "2026-10-05T12:30", "2026-10-05 12:30", "05/10/2026 12:30" → minutes. Vide → null. */
  function parseLocal(texte) {
    var s = String(texte == null ? '' : texte).trim();
    if (!s) return null;
    var m = s.match(/^(\S+?)(?:[T ]+(\S+))?$/);
    if (!m) return null;
    var jour = parseDate(m[1]);
    if (jour === null) return null;
    if (!m[2]) return jour;
    var heure = parseHeure(m[2]);
    return heure === null ? null : jour + heure;
  }

  function deux(n) { return (n < 10 ? '0' : '') + n; }

  /** minutes → "2026-10-05T12:30" (format d'échange site ↔ serveur). */
  function formatLocal(min) {
    var p = parties(min);
    return p.annee + '-' + deux(p.mois) + '-' + deux(p.jour) + 'T' + deux(p.heure) + ':' + deux(p.minute);
  }

  /** minutes → "2026-10-05 12:30" (format stocké dans le Google Sheet). */
  function formatSheet(min) {
    return formatLocal(min).replace('T', ' ');
  }

  function formatHeure(min) {
    var p = parties(min);
    return p.heure + 'h' + (p.minute ? deux(p.minute) : '');
  }

  /** "lundi 5 octobre" */
  function formatJour(min) {
    var p = parties(min);
    return CLES_JOURS[p.jourSemaine] + ' ' + p.jour + ' ' + MOIS[p.mois - 1];
  }

  /** "lun. 5 oct." */
  function formatJourCourt(min) {
    var p = parties(min);
    return JOURS_COURTS[p.jourSemaine] + ' ' + p.jour + ' ' + MOIS_COURTS[p.mois - 1];
  }

  /** "lundi 5 octobre à 12h30" */
  function formatHumain(min) {
    return formatJour(min) + ' à ' + formatHeure(min);
  }

  function debutDuJour(min) { return min - (((min % MIN_JOUR) + MIN_JOUR) % MIN_JOUR); }
  function jourSemaine(min) { return parties(min).jourSemaine; }

  // ---------- Petits utilitaires ----------

  function formatPrix(n) {
    var arrondi = Math.round(n * 100) / 100;
    return (arrondi % 1 === 0 ? String(arrondi) : arrondi.toFixed(2).replace('.', ',')) + ' €';
  }

  function sansAccents(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function estOui(v) {
    return v === true || /^(true|vrai|oui|x|1|yes)$/i.test(String(v == null ? '' : v).trim());
  }

  function normaliserInsta(v) {
    return String(v == null ? '' : v).trim().replace(/^['\s@]+/, '').toLowerCase();
  }

  function echapperHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function arrondi2(n) { return Math.round(n * 100) / 100; }

  // ---------- Configuration ----------

  /** "12:30-13:30, 17:30-18:30" → [[750, 810], [1050, 1110]] (minutes depuis minuit). */
  function parseHoraires(texte) {
    var res = [];
    var re = /(\d{1,2}\s*(?:[:hH]\s*\d{0,2})?)\s*(?:-|–|à)\s*(\d{1,2}\s*(?:[:hH]\s*\d{0,2})?)/g;
    var m;
    var s = String(texte == null ? '' : texte);
    while ((m = re.exec(s)) !== null) {
      var debut = parseHeure(m[1].replace(/\s+/g, ''));
      var fin = parseHeure(m[2].replace(/\s+/g, ''));
      if (debut !== null && fin !== null && fin > debut) res.push([debut, fin]);
    }
    return res;
  }

  /** Fusionne les lignes [clé, valeur] de l'onglet Config avec les valeurs par défaut. */
  function lireConfig(lignes) {
    var cfg = {};
    Object.keys(DEFAUTS).forEach(function (k) { cfg[k] = DEFAUTS[k]; });
    (lignes || []).forEach(function (ligne) {
      var cle = String(ligne[0] == null ? '' : ligne[0]).trim();
      if (!Object.prototype.hasOwnProperty.call(DEFAUTS, cle)) return;
      var brut = ligne[1];
      if (typeof DEFAUTS[cle] === 'number') {
        var n = typeof brut === 'number' ? brut : Number(String(brut).replace(/\s/g, '').replace(',', '.'));
        if (String(brut).trim() !== '' && isFinite(n) && n >= 0) cfg[cle] = n;
      } else {
        cfg[cle] = String(brut == null ? '' : brut).trim();
      }
    });
    return cfg;
  }

  // ---------- Offres et prix ----------

  function offres(cfg) {
    return [
      { id: 'jour', type: 'location', nom: 'Location 1 journée', jours: 1,
        prix: cfg.prix_jour, prixInterne: cfg.prix_jour_interne },
      { id: '2jours', type: 'location', nom: 'Location 2 journées', jours: 2, prix: cfg.prix_2jours },
      { id: 'weekend', type: 'location', nom: 'Location week-end', jours: 3, prix: cfg.prix_weekend },
      { id: 'longue', type: 'location', nom: 'Location longue', joursMin: 3, joursMax: cfg.duree_max_jours,
        prix: cfg.prix_2jours, prixJourSup: cfg.prix_jour_sup },
      { id: 'seance-film', type: 'seance', genre: 'film', nom: 'Séance ciné', prixPersonne: cfg.prix_seance_personne },
      { id: 'seance-jeu', type: 'seance', genre: 'jeu', nom: 'Séance jeu PS4', prixPersonne: cfg.prix_seance_personne }
    ];
  }

  function trouverOffre(id, cfg) {
    var liste = offres(cfg);
    for (var i = 0; i < liste.length; i++) if (liste[i].id === id) return liste[i];
    return null;
  }

  /** Nombre de jours de location, ou null si la combinaison est invalide. */
  function dureeJours(offreId, jours, cfg) {
    if (offreId === 'jour') return 1;
    if (offreId === '2jours') return 2;
    if (offreId === 'weekend') return 3;
    if (offreId === 'longue') {
      var n = Number(jours);
      if (Math.floor(n) === n && n >= 3 && n <= cfg.duree_max_jours) return n;
    }
    return null;
  }

  function prixLocation(offreId, jours, interne, cfg) {
    var duree = dureeJours(offreId, jours, cfg);
    if (duree === null) return null;
    if (offreId === 'jour') return interne ? cfg.prix_jour_interne : cfg.prix_jour;
    if (offreId === '2jours') return cfg.prix_2jours;
    if (offreId === 'weekend') return cfg.prix_weekend;
    return arrondi2(cfg.prix_2jours + (duree - 2) * cfg.prix_jour_sup);
  }

  function prixSeance(personnes, cfg) {
    return arrondi2(personnes * cfg.prix_seance_personne);
  }

  // ---------- Disponibilités ----------

  function statutBloque(statut) {
    var s = sansAccents(statut).toLowerCase().trim();
    return s.indexOf('annul') !== 0 && s !== 'rendu';
  }

  function chevauche(a0, a1, b0, b1) { return a0 < b1 && b0 < a1; }

  function dansIndispo(jourMin, indispos) {
    return (indispos || []).some(function (p) {
      return p.du !== null && p.au !== null && jourMin >= p.du && jourMin <= p.au;
    });
  }

  /** Fenêtres de remise d'un jour donné ([] si pas de remise ce jour-là). */
  function fenetresDuJour(jourMin, cfg, indispos) {
    if (dansIndispo(jourMin, indispos)) return [];
    return parseHoraires(cfg['horaires_' + CLES_JOURS[jourSemaine(jourMin)]]);
  }

  /**
   * Occupation d'une location. Par défaut, du début (moins la marge) jusqu'à la fin du
   * créneau de retour (plus la marge) : le projecteur ne repart pas le matin où il revient.
   * Avec enchainer_meme_matin = oui, l'occupation s'arrête au début du créneau de retour :
   * le client suivant peut le prendre le même matin, après le retour.
   */
  function occupation(debut, fin, cfg) {
    if (estOui(cfg.enchainer_meme_matin)) return { debut: debut, fin: debutRetour(fin, cfg) };
    var marge = cfg.marge_entre_locations_min;
    return { debut: debut - marge, fin: fin + marge };
  }

  function intervallesLocations(donnees, cfg) {
    var res = [];
    (donnees.reservations || []).forEach(function (r) {
      if (!statutBloque(r.statut)) return;
      // Ligne saisie à la main avec une date illisible : par prudence, plus rien n'est louable.
      if (r.illisible) { res.push({ debut: -Infinity, fin: Infinity }); return; }
      if (r.debut === null || r.debut === undefined || r.fin === null || r.fin === undefined) return;
      res.push(occupation(r.debut, r.fin, cfg));
    });
    return res;
  }

  function intervalleSeance(s, cfg) {
    var marge = cfg.marge_entre_locations_min;
    return { debut: s.debut - marge, fin: s.debut + cfg.blocage_seance_heures * 60 + marge };
  }

  // ---------- Retour : le matin qui suit la dernière journée ----------

  /** Créneau de retour [début, fin] en minutes depuis minuit, ou null si non configuré. */
  function fenetreRetour(cfg) {
    var f = parseHoraires(cfg.horaires_retour);
    return f.length ? f[0] : null;
  }

  /** Fin d'une location : jour de remise + N jours, à la fin du créneau de retour (ex. 8h). */
  function finLocation(debut, jours, cfg) {
    var f = fenetreRetour(cfg);
    if (f === null || debut === null) return null;
    return debutDuJour(debut) + jours * MIN_JOUR + f[1];
  }

  /** Début du créneau de retour (ex. 7h) à partir de la fin de location (ex. 8h). */
  function debutRetour(fin, cfg) {
    var f = fenetreRetour(cfg);
    return f === null ? fin : debutDuJour(fin) + f[0];
  }

  /** "mardi 6 octobre au matin, entre 7h et 8h" */
  function formatRetour(fin, cfg) {
    var f = fenetreRetour(cfg);
    if (f === null) return formatHumain(fin);
    var jour = debutDuJour(fin);
    return formatJour(jour) + (f[0] < 12 * 60 ? ' au matin' : '') +
      ', entre ' + formatHeure(jour + f[0]) + ' et ' + formatHeure(jour + f[1]);
  }

  /** Périodes pendant lesquelles le projecteur n'est pas disponible. */
  function blocages(donnees, cfg) {
    var res = intervallesLocations(donnees, cfg);
    (donnees.seances || []).forEach(function (s) {
      if (s.annulee || s.debut === null) return;
      res.push(intervalleSeance(s, cfg));
    });
    (donnees.indispos || []).forEach(function (p) {
      if (p.du === null || p.au === null) return;
      res.push({ debut: p.du, fin: p.au + MIN_JOUR });
    });
    return res;
  }

  /**
   * Heures de remise libres pour une formule de location.
   * Règles : remise un jour de remise, à une heure proposée ; retour le matin
   * qui suit la dernière journée (créneau horaires_retour), un jour de remise lui aussi ;
   * pas de chevauchement avec une autre location (marge comprise), une séance
   * ou une indisponibilité ; au moins `delai_min_heures` à l'avance.
   */
  function creneaux(offreId, jours, maintenant, donnees, cfg) {
    var duree = dureeJours(offreId, jours, cfg);
    if (duree === null) return [];
    var bl = blocages(donnees, cfg);
    var limite = maintenant + cfg.delai_min_heures * 60;
    var pas = Math.max(5, cfg.pas_creneau_min);
    var jour0 = debutDuJour(maintenant);
    var res = [];
    for (var d = 0; d <= cfg.horizon_jours; d++) {
      var jour = jour0 + d * MIN_JOUR;
      if (offreId === 'weekend' && jourSemaine(jour) !== 5) continue;
      var fenetres = fenetresDuJour(jour, cfg, donnees.indispos);
      if (!fenetres.length) continue;
      if (!fenetresDuJour(jour + duree * MIN_JOUR, cfg, donnees.indispos).length) continue;
      var fin = finLocation(jour, duree, cfg);
      if (fin === null) return [];
      fenetres.forEach(function (f) {
        for (var t = f[0]; t + pas <= f[1]; t += pas) {
          var debut = jour + t;
          if (debut < limite) continue;
          var occ = estOui(cfg.enchainer_meme_matin) ? { debut: debut, fin: debutRetour(fin, cfg) } : { debut: debut, fin: fin };
          var pris = bl.some(function (b) { return chevauche(occ.debut, occ.fin, b.debut, b.fin); });
          if (!pris) res.push(debut);
        }
      });
    }
    return res;
  }

  function placesPrises(seanceId, reservations) {
    return (reservations || []).reduce(function (total, r) {
      return r.seanceId === seanceId && statutBloque(r.statut) ? total + (Number(r.personnes) || 0) : total;
    }, 0);
  }

  /** Séances ouvertes à l'inscription. Une séance qui tombe pendant une location est masquée. */
  function seancesAVenir(maintenant, donnees, cfg) {
    var locations = intervallesLocations(donnees, cfg);
    return (donnees.seances || [])
      .filter(function (s) {
        if (s.annulee || s.debut === null || s.debut <= maintenant) return false;
        var i = intervalleSeance(s, cfg);
        return !locations.some(function (b) { return chevauche(i.debut, i.fin, b.debut, b.fin); });
      })
      .sort(function (a, b) { return a.debut - b.debut; })
      .map(function (s) {
        var restantes = s.placesMax ? Math.max(0, s.placesMax - placesPrises(s.id, donnees.reservations)) : null;
        return {
          id: s.id, debut: s.debut, genre: s.genre, titre: s.titre || '',
          placesMax: s.placesMax || null, placesRestantes: restantes, complet: restantes === 0
        };
      });
  }

  // ---------- Validation d'une réservation ----------

  function erreur(code, message) { return { ok: false, code: code, erreur: message }; }

  function texte(v, max) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function reservationsActives(memePersonne, maintenant, reservations) {
    return (reservations || []).filter(function (r) {
      if (!memePersonne(r) || !statutBloque(r.statut)) return false;
      if (r.fin !== null && r.fin !== undefined) return r.fin > maintenant;
      var seance = parseLocal(r.seanceId);
      return seance !== null && seance > maintenant;
    }).length;
  }

  /**
   * Vérifie une demande envoyée par le site. Recalcule tout (prix, disponibilité)
   * côté serveur : on ne fait jamais confiance au navigateur.
   */
  function valider(demande, maintenant, donnees, cfg) {
    demande = demande || {};
    var offre = trouverOffre(demande.offre, cfg);
    if (!offre) return erreur('OFFRE', 'Choisis une formule.');

    var prenom = texte(demande.prenom, 40);
    var nom = texte(demande.nom, 40);
    var classe = texte(demande.classe, 20);
    var insta = normaliserInsta(demande.instagram);
    var telephone = String(demande.telephone == null ? '' : demande.telephone).replace(/[\s.\-]/g, '');
    var email = texte(demande.email, 100).toLowerCase();
    var message = texte(demande.message, 300);

    if (!/\p{L}/u.test(prenom)) return erreur('CHAMP', 'Indique ton prénom.');
    if (!/\p{L}/u.test(nom)) return erreur('CHAMP', 'Indique ton nom.');
    if (!/^[a-z0-9._]{1,30}$/.test(insta)) return erreur('CHAMP', 'Ton compte Instagram ne semble pas valide (ex. @locaproj.roc).');
    if (!classe) return erreur('CHAMP', 'Indique ta classe.');
    if (telephone && !/^\+?\d{10,13}$/.test(telephone)) return erreur('CHAMP', 'Ton numéro de téléphone ne semble pas valide.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return erreur('CHAMP', 'Ton e-mail ne semble pas valide.');

    // Anti-abus : débit global (une personne seule ne peut pas remplir le planning)
    var creees = function (depuis) {
      return (donnees.reservations || []).filter(function (r) {
        return typeof r.creeLe === 'number' && r.creeLe > maintenant - depuis;
      }).length;
    };
    if (creees(60) >= cfg.max_resas_par_heure || creees(MIN_JOUR) >= cfg.max_resas_par_jour) {
      return erreur('SATURE', 'Beaucoup de réservations en ce moment. Réessaie plus tard ou écris-nous sur Instagram.');
    }
    var memeInsta = function (r) { return normaliserInsta(r.instagram) === insta; };
    var memeEmail = function (r) { return !!email && String(r.email || '').trim().toLowerCase() === email; };
    if (reservationsActives(memeInsta, maintenant, donnees.reservations) >= cfg.max_resas_actives_par_insta ||
        reservationsActives(memeEmail, maintenant, donnees.reservations) >= cfg.max_resas_actives_par_insta) {
      return erreur('LIMITE', 'Tu as déjà ' + cfg.max_resas_actives_par_insta +
        ' réservations en cours. Écris-nous sur Instagram pour en ajouter une.');
    }

    var resa = {
      type: offre.type, offre: offre.id, offreNom: offre.nom,
      prenom: prenom, nom: nom, instagram: insta, classe: classe,
      interne: demande.interne === true, telephone: telephone, email: email, message: message,
      debut: null, fin: null, jours: null, seanceId: null, personnes: null, prix: null
    };

    if (offre.type === 'location') {
      if (demande.engagement !== true) {
        return erreur('ENGAGEMENT', 'Coche la case : en cas de casse, le projecteur est à rembourser.');
      }
      var duree = dureeJours(offre.id, demande.jours, cfg);
      if (duree === null) return erreur('DUREE', 'Choisis une durée entre 3 et ' + cfg.duree_max_jours + ' jours.');
      var debut = parseLocal(demande.debut);
      if (debut === null) return erreur('CRENEAU_INDISPO', 'Choisis une heure de remise.');
      if (creneaux(offre.id, duree, maintenant, donnees, cfg).indexOf(debut) === -1) {
        return erreur('CRENEAU_INDISPO', 'Ce créneau vient d\'être pris ou n\'est plus disponible. Choisis-en un autre.');
      }
      resa.debut = debut;
      resa.fin = finLocation(debut, duree, cfg);
      resa.jours = duree;
      resa.prix = prixLocation(offre.id, duree, resa.interne, cfg);
      return { ok: true, resa: resa };
    }

    var seance = null;
    seancesAVenir(maintenant, donnees, cfg).forEach(function (s) {
      if (s.id === demande.seance && s.genre === offre.genre) seance = s;
    });
    if (!seance) return erreur('SEANCE', 'Cette séance n\'existe plus. Choisis-en une autre.');
    var personnes = Number(demande.personnes);
    if (Math.floor(personnes) !== personnes || personnes < 1 || personnes > cfg.places_max_par_resa) {
      return erreur('PERSONNES', 'Indique un nombre de personnes entre 1 et ' + cfg.places_max_par_resa + '.');
    }
    if (seance.placesRestantes !== null && personnes > seance.placesRestantes) {
      return erreur('COMPLET', seance.placesRestantes === 0
        ? 'Cette séance est complète.'
        : 'Il ne reste que ' + seance.placesRestantes + ' place(s) pour cette séance.');
    }
    resa.seanceId = seance.id;
    resa.seanceDebut = seance.debut;
    resa.seanceTitre = seance.titre;
    resa.personnes = personnes;
    resa.prix = prixSeance(personnes, cfg);
    return { ok: true, resa: resa };
  }

  // ---------- Ce que le site reçoit ----------

  /** État public envoyé au site : aucune donnée personnelle, seulement des disponibilités. */
  function etatPublic(maintenant, donnees, cfg) {
    var liste = offres(cfg);
    var dispo = {};
    liste.forEach(function (o) {
      if (o.type !== 'location') return;
      if (o.id === 'longue') {
        for (var n = o.joursMin; n <= o.joursMax; n++) {
          dispo['longue-' + n] = creneaux('longue', n, maintenant, donnees, cfg).map(formatLocal);
        }
      } else {
        dispo[o.id] = creneaux(o.id, o.jours, maintenant, donnees, cfg).map(formatLocal);
      }
    });
    return {
      ok: true,
      maintenant: formatLocal(maintenant),
      lieu: cfg.lieu,
      prixProjecteur: cfg.prix_projecteur,
      horairesRetour: cfg.horaires_retour,
      placesMaxParResa: cfg.places_max_par_resa,
      offres: liste,
      creneaux: dispo,
      seances: seancesAVenir(maintenant, donnees, cfg).map(function (s) {
        return { id: s.id, debut: formatLocal(s.debut), genre: s.genre, titre: s.titre,
          placesRestantes: s.placesRestantes, complet: s.complet };
      })
    };
  }

  /** Ce que le site affiche après une réservation réussie. */
  function resumePublic(resa, cfg) {
    return {
      id: resa.id, type: resa.type, offre: resa.offre, offreNom: resa.offreNom, prenom: resa.prenom,
      debut: resa.debut !== null ? formatLocal(resa.debut) : null,
      fin: resa.fin !== null ? formatLocal(resa.fin) : null,
      retourDebut: resa.fin !== null ? formatLocal(debutRetour(resa.fin, cfg)) : null,
      retour: resa.fin !== null ? formatRetour(resa.fin, cfg) : null,
      jours: resa.jours,
      seance: resa.seanceDebut !== undefined && resa.seanceDebut !== null ? formatLocal(resa.seanceDebut) : null,
      seanceTitre: resa.seanceTitre || '',
      personnes: resa.personnes, prix: resa.prix, lieu: cfg.lieu, emailEnvoye: !!resa.email
    };
  }

  return {
    MIN_JOUR: MIN_JOUR,
    DEFAUTS: DEFAUTS,
    parseHeure: parseHeure,
    parseDate: parseDate,
    parseLocal: parseLocal,
    formatLocal: formatLocal,
    formatSheet: formatSheet,
    formatHeure: formatHeure,
    formatJour: formatJour,
    formatJourCourt: formatJourCourt,
    formatHumain: formatHumain,
    fenetreRetour: fenetreRetour,
    finLocation: finLocation,
    debutRetour: debutRetour,
    formatRetour: formatRetour,
    formatPrix: formatPrix,
    debutDuJour: debutDuJour,
    jourSemaine: jourSemaine,
    estOui: estOui,
    normaliserInsta: normaliserInsta,
    echapperHtml: echapperHtml,
    statutBloque: statutBloque,
    parseHoraires: parseHoraires,
    lireConfig: lireConfig,
    offres: offres,
    trouverOffre: trouverOffre,
    dureeJours: dureeJours,
    prixLocation: prixLocation,
    prixSeance: prixSeance,
    creneaux: creneaux,
    seancesAVenir: seancesAVenir,
    placesPrises: placesPrises,
    valider: valider,
    etatPublic: etatPublic,
    resumePublic: resumePublic
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Logic;


/*
 * locaproj — serveur Google Apps Script.
 *
 * Ne pas coller ce fichier seul : coller dist/Code.gs, qui contient
 * la logique (assets/logic.js) + ce fichier. Voir GUIDE.md.
 *
 * Le Google Sheet sert de base de données :
 *   Réservations · Séances · Indisponibilités · Config · Avis · Tableau de bord
 */

var TZ = 'Europe/Paris';

var ONGLETS = {
  resas: 'Réservations',
  seances: 'Séances',
  indispos: 'Indisponibilités',
  config: 'Config',
  avis: 'Avis',
  bord: 'Tableau de bord'
};

var COLS_RESAS = ['ID', 'Créée le', 'Formule', 'Remise', 'Retour', 'Jours', 'Séance', 'Personnes',
  'Prénom', 'Nom', 'Instagram', 'Classe', 'Interne', 'Téléphone', 'Email', 'Message',
  'Prix (€)', 'Statut', 'Payé', 'Notes'];
var COLS_SEANCES = ['Date', 'Heure', 'Type', 'Titre', 'Places max', 'Inscrits', 'Annulée'];
var COLS_INDISPOS = ['Du', 'Au', 'Raison'];
var COLS_CONFIG = ['Paramètre', 'Valeur', 'Explication'];
var COLS_AVIS = ['Date', 'Prénom', 'Note /5', 'Ce qui a plu', 'À améliorer', 'Reviendrait'];

var STATUTS = ['Confirmée', 'Remis', 'Rendu', 'Annulée'];

var EXPLICATIONS = {
  lieu: 'Lieu de remise affiché sur le site (l\'endroit exact se fixe sur Insta).',
  prix_projecteur: 'Prix d\'achat du projecteur, pour suivre la rentabilité.',
  prix_jour: 'Location 1 journée (€).',
  prix_jour_interne: 'Location 1 journée pour un interne (€).',
  prix_2jours: 'Location 2 journées (€).',
  prix_weekend: 'Location week-end, du vendredi au lundi (€).',
  prix_jour_sup: 'Prix de chaque jour au-delà de 2 (location longue) (€).',
  prix_seance_personne: 'Séance dans la chambre, prix par personne (€).',
  horaires_lundi: 'Heures de remise le lundi. Ex. : 07:00-08:00 (ajouter « , 17:30-18:30 » pour un 2e créneau). Vide = ni remise ni retour ce jour-là.',
  horaires_mardi: 'Heures de remise le mardi.',
  horaires_mercredi: 'Heures de remise le mercredi.',
  horaires_jeudi: 'Heures de remise le jeudi.',
  horaires_vendredi: 'Heures de remise le vendredi.',
  horaires_samedi: 'Heures de remise le samedi (vide = fermé).',
  horaires_dimanche: 'Heures de remise le dimanche (vide = fermé).',
  horaires_retour: 'Créneau de retour, le matin qui suit la dernière journée. Ex. : 07:00-08:00.',
  enchainer_meme_matin: 'oui (par défaut) = le client suivant peut prendre le projecteur le matin même où il est rendu. non = il repart au plus tôt le lendemain.',
  pas_creneau_min: 'Écart entre deux heures de remise proposées (minutes).',
  delai_min_heures: 'Délai minimum entre la réservation et la remise (heures).',
  horizon_jours: 'Jusqu\'à combien de jours à l\'avance on peut réserver.',
  marge_entre_locations_min: 'Battement entre deux locations, en minutes (utilisé seulement si enchainer_meme_matin = non).',
  blocage_seance_heures: 'Durée pendant laquelle une séance bloque le projecteur (heures).',
  duree_max_jours: 'Durée maximale d\'une location longue (jours).',
  max_resas_actives_par_insta: 'Réservations en cours maximum par compte Instagram ou e-mail (anti-abus).',
  max_resas_par_heure: 'Réservations maximum par heure, tous clients confondus (anti-abus).',
  max_resas_par_jour: 'Réservations maximum par jour, tous clients confondus (anti-abus).',
  places_max_par_resa: 'Nombre maximum de personnes par inscription à une séance.',
  email_notif: 'Adresse qui reçoit un mail à chaque réservation.',
  agenda: 'oui = ajouter remise et retour dans Google Agenda.'
};

// ===================================================================
// Points d'entrée web
// ===================================================================

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'init';
    if (action !== 'init') return json_({ ok: false, erreur: 'Action inconnue.' });
    var cfg = config_();
    return json_(Logic.etatPublic(maintenant_(), donnees_(cfg), cfg));
  } catch (err) {
    console.error(err);
    return json_({ ok: false, erreur: 'Le serveur ne répond pas. Réessaie dans un instant.' });
  }
}

function doPost(e) {
  var demande;
  try {
    demande = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, erreur: 'Requête illisible.' });
  }
  try {
    if (demande.action === 'reserver') return json_(reserver_(demande));
    if (demande.action === 'avis') return json_(enregistrerAvis_(demande));
    return json_({ ok: false, erreur: 'Action inconnue.' });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, erreur: 'Le serveur ne répond pas. Réessaie dans un instant.' });
  }
}

// ===================================================================
// Réservation
// ===================================================================

function reserver_(demande) {
  // Champ piège invisible : seuls les robots le remplissent.
  if (demande.site) return { ok: false, erreur: 'Réservation impossible. Écris-nous sur Instagram.' };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, erreur: 'Beaucoup de demandes en même temps, réessaie.' };
  var cfg, resa;
  try {
    cfg = config_();
    var donnees = donnees_(cfg);
    var maintenant = maintenant_();
    var verdict = Logic.valider(demande, maintenant, donnees, cfg);
    if (!verdict.ok) return verdict;
    resa = verdict.resa;
    resa.id = prochainId_(donnees.reservations);
    resa.creeLe = maintenant;
    ecrireReservation_(resa);
    if (resa.seanceId) majInscrits_(resa.seanceId);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  notifier_(resa, cfg);
  return { ok: true, reservation: Logic.resumePublic(resa, cfg) };
}

function prochainId_(reservations) {
  var max = 0;
  reservations.forEach(function (r) {
    var m = String(r.id || '').match(/(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  var n = String(max + 1);
  while (n.length < 4) n = '0' + n;
  return 'LP-' + n;
}

function ecrireReservation_(r) {
  var sh = onglet_(ONGLETS.resas);
  var valeurs = {
    'ID': r.id,
    'Créée le': Logic.formatSheet(r.creeLe),
    'Formule': r.offreNom + (r.offre === 'longue' ? ' (' + r.jours + ' j)' : ''),
    'Remise': r.debut !== null ? Logic.formatSheet(r.debut) : '',
    'Retour': r.fin !== null ? Logic.formatSheet(r.fin) : '',
    'Jours': r.jours || '',
    'Séance': r.seanceId ? Logic.formatSheet(Logic.parseLocal(r.seanceId)) : '',
    'Personnes': r.personnes || '',
    'Prénom': r.prenom,
    'Nom': r.nom,
    'Instagram': '@' + r.instagram, // seulement [a-z0-9._] : sans danger
    'Classe': r.classe,
    'Interne': r.interne ? 'oui' : 'non',
    'Téléphone': r.telephone, // colonne au format texte : garde le 0 du début
    'Email': r.email,
    'Message': r.message,
    'Prix (€)': r.prix,
    'Statut': 'Confirmée',
    'Payé': false,
    'Notes': ''
  };
  var entetes = entetes_(sh);
  var ligne = entetes.map(function (h) {
    var v = Object.prototype.hasOwnProperty.call(valeurs, h) ? valeurs[h] : '';
    return typeof v === 'string' && h !== 'Instagram' ? texteSur_(v) : v;
  });
  sh.appendRow(ligne);
  var n = sh.getLastRow();
  var colPaye = entetes.indexOf('Payé') + 1;
  var colStatut = entetes.indexOf('Statut') + 1;
  if (colPaye > 0) sh.getRange(n, colPaye).insertCheckboxes();
  if (colStatut > 0) sh.getRange(n, colStatut).setDataValidation(listeStatuts_());
}

/**
 * Empêche une saisie comme "=IMPORTXML(...)" de devenir une formule dans le Sheet.
 * Une espace devant suffit, quel que soit le format de la colonne.
 */
function texteSur_(v) {
  return /^[=+\-@]/.test(v) ? ' ' + v : v;
}

function majInscrits_(seanceId) {
  var sh = onglet_(ONGLETS.seances);
  var lignes = lignes_(ONGLETS.seances);
  var resas = donnees_().reservations;
  var col = entetes_(sh).indexOf('Inscrits') + 1;
  if (col === 0) return;
  lignes.forEach(function (l) {
    if (idSeance_(l) === seanceId) sh.getRange(l._ligne, col).setValue(Logic.placesPrises(seanceId, resas));
  });
}

// ===================================================================
// Avis (carte d'évaluation)
// ===================================================================

function enregistrerAvis_(demande) {
  if (demande.site) return { ok: false, erreur: 'Envoi impossible.' };
  var note = Number(demande.note);
  if (Math.floor(note) !== note || note < 1 || note > 5) return { ok: false, erreur: 'Choisis une note de 1 à 5.' };
  var ilYaUneHeure = maintenant_() - 60;
  var recents = lignes_(ONGLETS.avis).filter(function (l) {
    var d = Logic.parseLocal(l['Date']);
    return d !== null && d > ilYaUneHeure;
  }).length;
  if (recents >= 10) return { ok: false, erreur: 'Beaucoup d\'avis en ce moment, réessaie plus tard.' };
  var court = function (v, max) { return texteSur_(String(v == null ? '' : v).trim().slice(0, max)); };
  onglet_(ONGLETS.avis).appendRow([
    Logic.formatSheet(maintenant_()),
    court(demande.prenom, 40),
    note,
    court(demande.plu, 500),
    court(demande.ameliorer, 500),
    demande.reviendrait === true ? 'oui' : demande.reviendrait === false ? 'non' : ''
  ]);
  try {
    if (MailApp.getRemainingDailyQuota() < 50) return { ok: true }; // garder le quota pour les réservations
    MailApp.sendEmail({
      to: config_().email_notif,
      subject: 'Nouvel avis locaproj : ' + note + '/5',
      htmlBody: '<p><b>' + note + '/5</b></p><p>Ce qui a plu : ' + Logic.echapperHtml(demande.plu || '—') +
        '</p><p>À améliorer : ' + Logic.echapperHtml(demande.ameliorer || '—') + '</p>',
      name: 'locaproj — site'
    });
  } catch (err) {
    console.error('Mail avis', err);
  }
  return { ok: true };
}

// ===================================================================
// Notifications : mail pour vous, mail pour le client, Google Agenda
// ===================================================================

function notifier_(r, cfg) {
  var e = Logic.echapperHtml;
  var quand = r.type === 'location'
    ? 'Remise ' + Logic.formatHumain(r.debut) + ' · retour ' + Logic.formatRetour(r.fin, cfg)
    : 'Séance du ' + Logic.formatHumain(r.seanceDebut) + ' · ' + r.personnes + ' personne(s)';

  try {
    var lien = SpreadsheetApp.getActiveSpreadsheet().getUrl();
    MailApp.sendEmail({
      to: cfg.email_notif,
      subject: '📽️ ' + r.id + ' · ' + r.offreNom + ' · ' + r.prenom + ' ' + r.nom,
      htmlBody:
        '<h2 style="margin:0 0 8px">' + e(r.offreNom) + ' — ' + Logic.formatPrix(r.prix) + '</h2>' +
        '<p>' + e(quand) + '</p>' +
        (r.seanceTitre ? '<p>Séance : ' + e(r.seanceTitre) + '</p>' : '') +
        '<p><b>' + e(r.prenom + ' ' + r.nom) + '</b> · ' + e(r.classe) + (r.interne ? ' · interne' : '') + '<br>' +
        'Instagram : <a href="https://www.instagram.com/' + e(r.instagram) + '/">@' + e(r.instagram) + '</a>' +
        (r.telephone ? '<br>Téléphone : ' + e(r.telephone) : '') +
        (r.email ? '<br>Email : ' + e(r.email) : '') + '</p>' +
        (r.message ? '<p>Message : « ' + e(r.message) + ' »</p>' : '') +
        '<p>👉 Écris-lui sur Instagram pour fixer l\'endroit exact.</p>' +
        '<p><a href="' + lien + '">Ouvrir le tableau des réservations</a></p>',
      name: 'locaproj — site'
    });
  } catch (err) {
    console.error('Mail interne', err);
  }

  if (r.email) {
    try {
      // Garde toujours de la marge pour vos propres alertes (quota Gmail ≈ 100 destinataires/jour).
      if (MailApp.getRemainingDailyQuota() < 20) throw new Error('Quota mail bas : confirmation client non envoyée');
      MailApp.sendEmail({
        to: r.email,
        replyTo: cfg.email_notif,
        subject: 'Ta réservation locaproj est confirmée (' + r.id + ')',
        htmlBody: mailClient_(r, cfg),
        name: 'locaproj'
      });
    } catch (err) {
      console.error('Mail client', err);
    }
  }

  if (r.type === 'location' && Logic.estOui(cfg.agenda)) {
    try {
      var agenda = CalendarApp.getDefaultCalendar();
      var qui = r.prenom + ' ' + r.nom.charAt(0) + '. (@' + r.instagram + ')';
      // Le minimum : le détail complet reste dans le Sheet (anonymisé après 3 mois).
      var details = r.id + ' · ' + r.offreNom + ' · ' + Logic.formatPrix(r.prix) +
        '\nInstagram : https://www.instagram.com/' + r.instagram + '/';
      agenda.createEvent('📽️ Remise — ' + qui, date_(r.debut), date_(r.debut + 15), { description: details });
      agenda.createEvent('↩️ Retour — ' + qui, date_(Logic.debutRetour(r.fin, cfg)), date_(r.fin), { description: details });
    } catch (err) {
      console.error('Agenda', err);
    }
  }
}

function mailClient_(r, cfg) {
  var e = Logic.echapperHtml;
  var lignes = r.type === 'location'
    ? '<p style="margin:0 0 6px"><b>Remise :</b> ' + e(Logic.formatHumain(r.debut)) + ', ' + e(cfg.lieu) + '</p>' +
      '<p style="margin:0 0 6px"><b>Retour :</b> ' + e(Logic.formatRetour(r.fin, cfg)) + ', au même endroit</p>'
    : '<p style="margin:0 0 6px"><b>Séance :</b> ' + e(Logic.formatHumain(r.seanceDebut)) +
      (r.seanceTitre ? ' — ' + e(r.seanceTitre) : '') + '</p>' +
      '<p style="margin:0 0 6px"><b>Personnes :</b> ' + r.personnes + '</p>';
  return '<div style="font-family:Arial,sans-serif;max-width:520px;color:#1b1712">' +
    '<h2 style="margin:0 0 4px">C\'est réservé, ' + e(r.prenom) + ' 🎬</h2>' +
    '<p style="margin:0 0 16px;color:#6b6257">Réservation ' + e(r.id) + '</p>' +
    '<p style="margin:0 0 6px"><b>Formule :</b> ' + e(r.offreNom) + (r.offre === 'longue' ? ' (' + r.jours + ' jours)' : '') + '</p>' +
    lignes +
    '<p style="margin:0 0 16px"><b>Prix :</b> ' + Logic.formatPrix(r.prix) + ', à payer sur place (espèces ou carte)</p>' +
    '<p style="margin:0 0 6px">On t\'écrit sur Instagram pour fixer l\'endroit exact.</p>' +
    (r.type === 'location' ? '<p style="margin:0 0 6px">Rappel : en cas de casse, le projecteur est à rembourser.</p>' : '') +
    '<p style="margin:16px 0 0">Un empêchement ? Écris-nous sur <a href="https://www.instagram.com/locaproj.roc/">@locaproj.roc</a>.</p>' +
    '</div>';
}

// ===================================================================
// Lecture du Google Sheet
// ===================================================================

function maintenant_() {
  return Logic.parseLocal(Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm"));
}

function date_(minutes) {
  return Utilities.parseDate(Logic.formatSheet(minutes), TZ, 'yyyy-MM-dd HH:mm');
}

function config_() {
  return Logic.lireConfig(lignes_(ONGLETS.config).map(function (l) { return [l['Paramètre'], l['Valeur']]; }));
}

function idSeance_(l) {
  var jour = Logic.parseDate(l['Date']);
  var heure = Logic.parseHeure(l['Heure']);
  return jour === null || heure === null ? null : Logic.formatLocal(jour + heure);
}

function donnees_(cfg) {
  cfg = cfg || config_();
  var cles = ['ID', 'Remise', 'Retour', 'Séance'];
  var reservations = lignes_(ONGLETS.resas, cles).map(function (l) {
    var rempli = function (h) { return String(l[h] == null ? '' : l[h]).trim() !== ''; };
    var seance = Logic.parseLocal(l['Séance']);
    var debut = Logic.parseLocal(l['Remise']);
    var fin = Logic.parseLocal(l['Retour']);
    // Location saisie à la main sans retour : on compte 1 journée (retour le lendemain matin).
    if (debut !== null && fin === null && !rempli('Retour')) fin = Logic.finLocation(debut, 1, cfg);
    var illisible = (rempli('Remise') && debut === null) || (rempli('Retour') && fin === null) ||
      (rempli('Séance') && seance === null) || (!rempli('Remise') && rempli('Retour'));
    if (illisible && Logic.statutBloque(l['Statut'])) {
      console.error('Ligne ' + l._ligne + ' illisible dans Réservations : locations bloquées par prudence.');
    }
    return {
      id: l['ID'],
      creeLe: Logic.parseLocal(l['Créée le']),
      debut: debut,
      fin: fin,
      illisible: illisible,
      seanceId: seance === null ? null : Logic.formatLocal(seance),
      personnes: Number(l['Personnes']) || 0,
      statut: l['Statut'],
      instagram: l['Instagram'],
      email: l['Email']
    };
  });
  var seances = lignes_(ONGLETS.seances).map(function (l) {
    var id = idSeance_(l);
    var places = Number(String(l['Places max']).trim());
    return {
      id: id,
      debut: id === null ? null : Logic.parseLocal(id),
      genre: /jeu|ps4|ps5|game/i.test(l['Type']) ? 'jeu' : 'film',
      titre: String(l['Titre'] || '').trim().slice(0, 80),
      placesMax: places > 0 ? places : null,
      annulee: Logic.estOui(l['Annulée'])
    };
  });
  var indispos = lignes_(ONGLETS.indispos).map(function (l) {
    var du = Logic.parseDate(l['Du']);
    var au = Logic.parseDate(l['Au']);
    return { du: du, au: au === null ? du : au };
  });
  return { reservations: reservations, seances: seances, indispos: indispos };
}

/**
 * Lignes d'un onglet sous forme d'objets { entête: valeur affichée, _ligne: n° }.
 * Une ligne compte si l'une des colonnes clés est remplie (1re colonne par défaut).
 */
function lignes_(nom, colonnesCles) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nom);
  if (!sh || sh.getLastRow() < 2) return [];
  var valeurs = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getDisplayValues();
  var entetes = valeurs[0].map(function (h) { return String(h).trim(); });
  var indexCles = (colonnesCles || [entetes[0]]).map(function (h) { return entetes.indexOf(h); })
    .filter(function (j) { return j !== -1; });
  var res = [];
  for (var i = 1; i < valeurs.length; i++) {
    var remplie = indexCles.some(function (j) { return String(valeurs[i][j]).trim() !== ''; });
    if (!remplie) continue;
    var o = { _ligne: i + 1 };
    entetes.forEach(function (h, j) { o[h] = valeurs[i][j]; });
    res.push(o);
  }
  return res;
}

function onglet_(nom) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(nom);
  if (!sh) throw new Error('Onglet « ' + nom + ' » introuvable : lance la fonction installer.');
  return sh;
}

function entetes_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map(function (h) { return String(h).trim(); });
}

function listeStatuts_() {
  return SpreadsheetApp.newDataValidation().requireValueInList(STATUTS, true).setAllowInvalid(false).build();
}

function json_(objet) {
  return ContentService.createTextOutput(JSON.stringify(objet)).setMimeType(ContentService.MimeType.JSON);
}

// ===================================================================
// Installation et entretien (à lancer depuis l'éditeur ou le menu)
// ===================================================================

/** Crée ou répare tous les onglets. Sans danger : ne supprime aucune donnée. */
function installer() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TZ);
  ss.setSpreadsheetLocale('fr_FR'); // 08/10/2026 = 8 octobre, pas 10 août

  var resas = preparerOnglet_(ss, ONGLETS.resas, COLS_RESAS);
  ['Remise', 'Retour', 'Séance', 'Créée le', 'Instagram', 'Téléphone', 'Classe'].forEach(function (h) {
    var c = COLS_RESAS.indexOf(h) + 1;
    resas.getRange(2, c, resas.getMaxRows() - 1, 1).setNumberFormat('@');
  });
  resas.getRange(1, COLS_RESAS.indexOf('Remise') + 1).setNote('Format : 2026-10-05 12:30. Une date illisible bloque toutes les locations par prudence.');
  resas.getRange(1, COLS_RESAS.indexOf('Statut') + 1).setNote('Annulée = le créneau se libère. Remis puis Rendu pour suivre la location.');

  var seances = preparerOnglet_(ss, ONGLETS.seances, COLS_SEANCES);
  seances.getRange(2, 1, seances.getMaxRows() - 1, 1).setNumberFormat('dd/mm/yyyy');
  seances.getRange(2, 2, seances.getMaxRows() - 1, 1).setNumberFormat('@');
  seances.getRange(2, 3, seances.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Film / série / match', 'Jeu PS4'], true).build());
  seances.getRange(2, 7, seances.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['oui'], true).build());
  seances.getRange(1, 1).setNote('Exemple : Date 08/10/2026 · Heure 20:30 · Type Film / série / match · Titre Soirée Ligue des champions · Places max 6. ' +
    'Une séance qui tombe pendant une location n\'apparaît pas sur le site.');
  seances.getRange(1, 7).setNote('Choisir « oui » pour annuler la séance.');

  var indispos = preparerOnglet_(ss, ONGLETS.indispos, COLS_INDISPOS);
  indispos.getRange(2, 1, indispos.getMaxRows() - 1, 2).setNumberFormat('dd/mm/yyyy');

  var config = preparerOnglet_(ss, ONGLETS.config, COLS_CONFIG);
  // Format texte AVANT d'écrire : sinon, en français, « 1.5 » peut devenir le 1er mai.
  config.getRange(2, 2, config.getMaxRows() - 1, 1).setNumberFormat('@');
  var existantes = lignes_(ONGLETS.config).map(function (l) { return l['Paramètre']; });
  Object.keys(Logic.DEFAUTS).forEach(function (cle) {
    if (existantes.indexOf(cle) !== -1) return;
    config.appendRow([cle, String(Logic.DEFAUTS[cle]), EXPLICATIONS[cle] || '']);
  });

  var avis = preparerOnglet_(ss, ONGLETS.avis, COLS_AVIS);
  avis.getRange(2, 1, avis.getMaxRows() - 1, 1).setNumberFormat('@');
  preparerTableauDeBord_(ss);

  // Anonymisation automatique chaque nuit (promesse faite sur le site).
  var dejaLa = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'anonymiser'; });
  if (!dejaLa) ScriptApp.newTrigger('anonymiser').timeBased().everyDays(1).atHour(4).create();

  ['Feuille 1', 'Sheet1', 'Feuille1'].forEach(function (nom) {
    var sh = ss.getSheetByName(nom);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  console.log('Installation terminée. Étape suivante : Déployer > Nouveau déploiement > Application Web.');
  return 'ok';
}

function preparerOnglet_(ss, nom, colonnes) {
  var sh = ss.getSheetByName(nom) || ss.insertSheet(nom);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, colonnes.length).setValues([colonnes]);
  } else {
    var presentes = entetes_(sh);
    colonnes.forEach(function (h) {
      if (presentes.indexOf(h) === -1) {
        sh.getRange(1, sh.getLastColumn() + 1).setValue(h);
        presentes.push(h);
      }
    });
  }
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#1b1712').setFontColor('#ffb238');
  return sh;
}

function lettre_(index) {
  var s = '';
  for (var n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function preparerTableauDeBord_(ss) {
  var sh = ss.getSheetByName(ONGLETS.bord) || ss.insertSheet(ONGLETS.bord, 0);
  var R = "'" + ONGLETS.resas + "'!";
  var prix = R + lettre_(COLS_RESAS.indexOf('Prix (€)')) + ':' + lettre_(COLS_RESAS.indexOf('Prix (€)'));
  var paye = R + lettre_(COLS_RESAS.indexOf('Payé')) + ':' + lettre_(COLS_RESAS.indexOf('Payé'));
  var statut = R + lettre_(COLS_RESAS.indexOf('Statut')) + ':' + lettre_(COLS_RESAS.indexOf('Statut'));
  var ids = R + 'A:A';
  sh.getRange('A1').setValue('Tableau de bord locaproj').setFontWeight('bold').setFontSize(14);
  var lignes = [
    ['Encaissé (lignes cochées « Payé »)', '=SUMIFS(' + prix + ',' + paye + ',TRUE)', '€'],
    ['Prix du projecteur', '=IFERROR(VALUE(SUBSTITUTE(VLOOKUP("prix_projecteur",\'' + ONGLETS.config + '\'!A:B,2,FALSE),",",".")),45)', '€'],
    ['Projecteur remboursé à', '=IFERROR(MIN(1,B3/B4),0)', ''],
    ['Reste à gagner', '=MAX(0,B4-B3)', '€'],
    ['Réservations (hors annulées)', '=COUNTIFS(' + ids + ',"LP-*",' + statut + ',"<>Annulée")', ''],
    ['Note moyenne des avis', '=IFERROR(ROUND(AVERAGE(\'' + ONGLETS.avis + '\'!C:C),1),"—")', '/5']
  ];
  sh.getRange(3, 1, lignes.length, 3).setValues(lignes);
  sh.getRange('B5').setNumberFormat('0%');
  sh.getRange('A3:A8').setFontWeight('bold');
  sh.setColumnWidth(1, 280);
}

/** Menu « Locaproj » dans le Google Sheet. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Locaproj')
    .addItem('Installer / réparer les onglets', 'installer')
    .addItem('Anonymiser maintenant (automatique chaque nuit)', 'anonymiser')
    .addToUi();
}

/**
 * Efface les infos personnelles des réservations terminées depuis plus de 90 jours,
 * dans le Sheet et dans l'agenda. Lancé chaque nuit par le déclencheur créé par installer().
 */
function anonymiser() {
  var sh = onglet_(ONGLETS.resas);
  var entetes = entetes_(sh);
  var limite = maintenant_() - 90 * Logic.MIN_JOUR;
  var aEffacer = ['Prénom', 'Nom', 'Instagram', 'Classe', 'Téléphone', 'Email', 'Message'];
  var n = 0;
  lignes_(ONGLETS.resas).forEach(function (l) {
    var fin = Logic.parseLocal(l['Retour']);
    if (fin === null) fin = Logic.parseLocal(l['Séance']);
    if (fin === null || fin > limite || l['Nom'] === '—') return;
    aEffacer.forEach(function (h) {
      var c = entetes.indexOf(h) + 1;
      if (c > 0) sh.getRange(l._ligne, c).setValue('—');
    });
    n++;
  });
  // Les événements d'agenda créés par le site, terminés depuis plus de 3 mois, sont supprimés.
  try {
    var agenda = CalendarApp.getDefaultCalendar();
    agenda.getEvents(new Date(2020, 0, 1), date_(limite)).forEach(function (ev) {
      if (/^(📽️ Remise|↩️ Retour) — /.test(ev.getTitle())) ev.deleteEvent();
    });
  } catch (err) {
    console.error('Agenda (anonymisation)', err);
  }
  console.log(n + ' réservation(s) anonymisée(s).');
  return n;
}
