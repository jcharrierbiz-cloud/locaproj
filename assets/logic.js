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
