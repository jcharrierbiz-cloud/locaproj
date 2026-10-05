/* locaproj — parcours de réservation (sans framework). */
(function () {
  'use strict';

  const L = window.Logic;
  const API = String(window.LOCAPROJ_API || '').trim();
  const DEMO = !API;

  const $ = (s, r) => (r || document).querySelector(s);
  const el = (tag, attrs, enfants) => {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'texte') n.textContent = v;
      else if (v !== false && v !== null && v !== undefined) n.setAttribute(k, v === true ? '' : v);
    });
    (enfants || []).forEach((e) => n.append(e));
    return n;
  };

  // Ce qui s'affiche sur le tableau-menu pour chaque formule (m = « matin entre 7h et 8h »).
  const TEXTES = {
    jour: (m) => 'Tu le gardes toute la journée, tu le rends le lendemain ' + m + '.',
    '2jours': (m) => 'Deux journées, tu le rends le surlendemain ' + m + '.',
    weekend: (m) => 'Remise le vendredi, tu le rends le lundi ' + m + '.',
    longue: (m) => 'De 3 à 7 journées, pour une série à finir ou un tournoi. Retour le ' + m + '.',
    'seance-film': () => 'Film, série ou match chez nous, à plusieurs. Pas besoin de compte, on s\'occupe de tout.',
    'seance-jeu': () => 'Ta partie sur grand écran, chez nous. Apporte ton jeu PS4.'
  };

  // Réglages utiles au navigateur (le reste est recalculé par le serveur).
  const cfgSite = () => ({
    horaires_retour: (etat && etat.horairesRetour) || L.DEFAUTS.horaires_retour,
    duree_max_jours: (offre('longue') || {}).joursMax || 7
  });

  /** "entre 7h et 8h" */
  function texteHeuresRetour() {
    const f = L.fenetreRetour(cfgSite());
    return f ? 'entre ' + L.formatHeure(f[0]) + ' et ' + L.formatHeure(f[1]) : 'à l\'heure convenue';
  }

  /** "matin entre 7h et 8h" (sans « matin » si le retour est l'après-midi). */
  function texteMatin() {
    const f = L.fenetreRetour(cfgSite());
    return (f && f[0] < 12 * 60 ? 'matin ' : '') + texteHeuresRetour();
  }

  let etat = null;            // disponibilités reçues du serveur (ou du mode démo)
  let offres = L.offres(L.lireConfig([])); // prix par défaut, remplacés dès que le serveur répond
  const choix = { offre: null, jours: 3, jourCle: null, debut: null, seance: null, personnes: 1 };
  let derniereResa = null;

  // ---------- Réseau ----------

  function charger() {
    if (DEMO) return window.LocaprojDemo.init();
    return fetch(API + '?action=init', { cache: 'no-store' }).then((r) => r.json());
  }

  function envoyer(corps) {
    if (DEMO) return window.LocaprojDemo.post(corps);
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // évite la requête préalable CORS
      body: JSON.stringify(corps)
    }).then((r) => r.json());
  }

  function rafraichir() {
    $('#erreur-chargement').hidden = true;
    return charger().then((data) => {
      if (!data || !data.ok) throw new Error((data && data.erreur) || 'Réponse invalide');
      etat = data;
      offres = data.offres;
      dessinerTextesRetour();
      dessinerPrix();
      dessinerCarte();
      if (choix.offre) dessinerQuand();
    }).catch((err) => {
      console.error(err);
      $('#erreur-chargement').hidden = false;
      if (choix.offre) dessinerQuand();
    });
  }

  // ---------- Prix ----------

  const offre = (id) => offres.find((o) => o.id === id) || null;

  function prixAffiche(o) {
    if (o.type === 'seance') return L.formatPrix(o.prixPersonne) + '/pers.';
    if (o.id === 'longue') return 'dès ' + L.formatPrix(o.prix + o.prixJourSup);
    return L.formatPrix(o.prix);
  }

  function prixChoix() {
    const o = offre(choix.offre);
    if (!o) return null;
    if (o.type === 'seance') return Math.round(choix.personnes * o.prixPersonne * 100) / 100;
    if (o.id === 'jour') return $('[name=interne]').checked ? o.prixInterne : o.prix;
    if (o.id === 'longue') return Math.round((o.prix + (choix.jours - 2) * o.prixJourSup) * 100) / 100;
    return o.prix;
  }

  function dessinerPrix() {
    const jour = offre('jour');
    if (!jour) return;
    $('#prix-jour').textContent = L.formatPrix(jour.prix);
    $('#prix-interne').textContent = L.formatPrix(jour.prixInterne);
  }

  // ---------- Étape 1 : le tableau-menu ----------

  function dessinerCarte() {
    ['location', 'seance'].forEach((type) => {
      const zone = $('.rayon__articles[data-type="' + type + '"]');
      zone.replaceChildren(...offres.filter((o) => o.type === type).map((o) => {
        let detail = TEXTES[o.id] ? TEXTES[o.id](texteMatin()) : '';
        if (o.id === 'jour') detail += ' ' + L.formatPrix(o.prixInterne) + ' pour les internes.';
        const input = el('input', { type: 'radio', name: 'offre', value: o.id, checked: choix.offre === o.id });
        input.addEventListener('change', () => choisirOffre(o.id));
        return el('label', { class: 'article' }, [
          input,
          el('span', { class: 'article__nom', texte: o.nom }),
          el('span', { class: 'article__prix', texte: prixAffiche(o) }),
          el('span', { class: 'article__detail', texte: detail })
        ]);
      }));
    });
  }

  function choisirOffre(id) {
    choix.offre = id;
    choix.debut = null;
    choix.jourCle = null;
    choix.seance = null;
    choix.personnes = 1;
    $('#quand').hidden = false;
    $('#qui').hidden = true;
    $('#quand-alerte').hidden = true;
    dessinerQuand();
    defiler('#quand');
  }

  // ---------- Étape 2 : quand ? ----------

  function cleCreneaux() {
    return choix.offre === 'longue' ? 'longue-' + choix.jours : choix.offre;
  }

  function dessinerQuand() {
    const o = offre(choix.offre);
    if (!o) return;
    const estLocation = o.type === 'location';
    $('#bloc-duree').hidden = o.id !== 'longue';
    $('#bloc-location').hidden = true;
    $('#bloc-seance').hidden = true;
    const vide = $('#quand-vide');
    vide.hidden = true;

    if (!etat) {
      vide.textContent = $('#erreur-chargement').hidden ? 'Chargement des disponibilités…' : 'Disponibilités indisponibles pour le moment.';
      vide.hidden = false;
      return;
    }
    if (estLocation) {
      if (o.id === 'longue') majCompteur('jours');
      dessinerLocation();
    } else {
      dessinerSeances(o);
    }
  }

  function creneauxParJour() {
    const parJour = new Map();
    (etat && etat.creneaux[cleCreneaux()] || []).forEach((c) => {
      const cle = c.slice(0, 10);
      if (!parJour.has(cle)) parJour.set(cle, []);
      parJour.get(cle).push(c);
    });
    return parJour;
  }

  // Appelée seulement par dessinerQuand(), qui remet les blocs à zéro avant.
  function dessinerLocation() {
    const parJour = creneauxParJour();
    if (!parJour.size) {
      const vide = $('#quand-vide');
      vide.textContent = 'Plus aucun créneau libre pour cette formule dans les 3 prochaines semaines. Écris-nous sur Instagram, on trouvera une solution.';
      vide.hidden = false;
      return;
    }
    if (!parJour.has(choix.jourCle)) choix.jourCle = parJour.keys().next().value;
    if (choix.debut && !parJour.get(choix.jourCle).includes(choix.debut)) choix.debut = null;

    $('#liste-jours').replaceChildren(...[...parJour.keys()].map((cle) => {
      const min = L.parseLocal(cle);
      const [sem, num, mois] = L.formatJourCourt(min).split(' ');
      const input = el('input', { type: 'radio', name: 'jour', value: cle, checked: cle === choix.jourCle });
      input.addEventListener('change', () => {
        // On ne redessine que les heures : le focus clavier reste sur le jour.
        choix.jourCle = cle;
        choix.debut = null;
        $('#qui').hidden = true;
        dessinerHeures(parJour);
      });
      return el('label', { class: 'jour', 'aria-label': L.formatJour(min) }, [
        input,
        el('span', { class: 'jour__sem', texte: sem }),
        el('span', { class: 'jour__num', texte: num }),
        el('span', { class: 'jour__mois', texte: mois })
      ]);
    }));
    dessinerHeures(parJour);
    $('#bloc-location').hidden = false;
  }

  function dessinerHeures(parJour) {
    $('#liste-heures').replaceChildren(...parJour.get(choix.jourCle).map((c) => {
      const input = el('input', { type: 'radio', name: 'heure', value: c, checked: c === choix.debut });
      input.addEventListener('change', () => choisirHeure(c));
      return el('label', { class: 'heure' }, [input, document.createTextNode(L.formatHeure(L.parseLocal(c)))]);
    }));
    dessinerRetour();
  }

  function dureeChoix() {
    return L.dureeJours(choix.offre, choix.jours, cfgSite());
  }

  function finChoix() {
    return L.finLocation(L.parseLocal(choix.debut), dureeChoix(), cfgSite());
  }

  function dessinerRetour() {
    const p = $('#texte-retour');
    if (!choix.debut) { p.hidden = true; return; }
    p.replaceChildren(
      el('span', { texte: 'Tu le rends ' }),
      el('strong', { texte: L.formatRetour(finChoix(), cfgSite()) }),
      el('span', { texte: ', au même endroit.' })
    );
    p.hidden = false;
  }

  function choisirHeure(c) {
    choix.debut = c;
    dessinerRetour();
    ouvrirQui();
  }

  function dessinerSeances(o) {
    const liste = (etat.seances || []).filter((s) => s.genre === o.genre);
    const vide = $('#quand-vide');
    if (!liste.length) {
      vide.replaceChildren(
        document.createTextNode('Aucune séance prévue pour l\'instant. Suis '),
        el('a', { href: 'https://www.instagram.com/locaproj.roc/', target: '_blank', rel: 'noopener', texte: '@locaproj.roc' }),
        document.createTextNode(' pour ne pas rater la prochaine.')
      );
      vide.hidden = false;
      return;
    }
    if (choix.seance && !liste.some((s) => s.id === choix.seance && !s.complet)) choix.seance = null;
    $('#liste-seances').replaceChildren(...liste.map((s) => {
      const min = L.parseLocal(s.debut);
      const [sem, num, mois] = L.formatJourCourt(min).split(' ');
      const places = s.complet ? 'Complet'
        : s.placesRestantes === null ? 'Places libres'
          : s.placesRestantes === 1 ? 'Plus qu\'une place' : s.placesRestantes + ' places libres';
      const input = el('input', { type: 'radio', name: 'seance', value: s.id, checked: s.id === choix.seance, disabled: s.complet });
      input.addEventListener('change', () => {
        choix.seance = s.id;
        choix.personnes = 1;
        majCompteur('personnes');
        $('#bloc-personnes').hidden = false;
        ouvrirQui();
      });
      return el('label', { class: 'seance' + (s.complet ? ' seance--complet' : '') }, [
        input,
        el('span', { class: 'seance__date' }, [
          el('span', { class: 'jour__sem', texte: sem }),
          el('span', { class: 'jour__num', texte: num }),
          el('span', { class: 'jour__mois', texte: mois })
        ]),
        el('span', { class: 'seance__titre', texte: s.titre || (o.genre === 'jeu' ? 'Séance jeu PS4' : 'Séance ciné') }),
        el('span', { class: 'seance__meta', texte: 'à ' + L.formatHeure(min) + ' · ' + places })
      ]);
    }));
    $('#bloc-seance').hidden = false;
    $('#bloc-personnes').hidden = !choix.seance;
    if (choix.seance) majCompteur('personnes');
  }

  function maxPersonnes() {
    const s = (etat && etat.seances || []).find((x) => x.id === choix.seance);
    const limite = (etat && etat.placesMaxParResa) || 10;
    return s && s.placesRestantes !== null ? Math.min(limite, s.placesRestantes) : limite;
  }

  function majCompteur(cible) {
    if (cible === 'jours') {
      const max = (offre('longue') || {}).joursMax || 7;
      choix.jours = Math.min(Math.max(choix.jours, 3), max);
      $('#valeur-jours').textContent = choix.jours + ' jours';
      $('[data-cible=jours][data-pas="-1"]').disabled = choix.jours <= 3;
      $('[data-cible=jours][data-pas="1"]').disabled = choix.jours >= max;
    } else {
      const max = maxPersonnes();
      choix.personnes = Math.min(Math.max(choix.personnes, 1), Math.max(1, max));
      $('#valeur-personnes').textContent = choix.personnes + (choix.personnes > 1 ? ' personnes' : ' personne');
      $('[data-cible=personnes][data-pas="-1"]').disabled = choix.personnes <= 1;
      $('[data-cible=personnes][data-pas="1"]').disabled = choix.personnes >= max;
    }
    dessinerTicket();
  }

  document.querySelectorAll('.compteur__btn').forEach((b) => {
    b.addEventListener('click', () => {
      const cible = b.dataset.cible;
      choix[cible] += Number(b.dataset.pas);
      majCompteur(cible);
      if (cible === 'jours') {
        choix.debut = null;
        $('#qui').hidden = true;
        dessinerQuand(); // remet tout à zéro : message vide, anciens créneaux, chargement
      }
    });
  });

  // ---------- Étape 3 : qui ? + ticket ----------

  function ouvrirQui() {
    const o = offre(choix.offre);
    const premiereFois = $('#qui').hidden;
    $('#qui').hidden = false;
    $('#bloc-engagement').hidden = o.type !== 'location';
    $('#aide-interne').textContent = o.id === 'jour' ? '(' + L.formatPrix(o.prixInterne) + ' au lieu de ' + L.formatPrix(o.prix) + ')' : '';
    $('#envoi-alerte').hidden = true;
    dessinerTicket();
    if (premiereFois) defiler('#qui');
  }

  function lignes(dl, paires) {
    dl.replaceChildren(...paires.filter((p) => p[1]).map(([k, v]) => el('div', {}, [el('dt', { texte: k }), el('dd', { texte: v })])));
  }

  function dessinerTicket() {
    const o = offre(choix.offre);
    if (!o) return;
    const paires = [['Formule', o.nom + (o.id === 'longue' ? ' · ' + choix.jours + ' jours' : '')]];
    if (o.type === 'location') {
      if (choix.debut) {
        const debut = L.parseLocal(choix.debut);
        paires.push(['Remise', L.formatHumain(debut) + ', ' + (etat ? etat.lieu : 'au Roc')]);
        paires.push(['Retour', L.formatRetour(finChoix(), cfgSite())]);
      }
    } else if (choix.seance) {
      const s = etat.seances.find((x) => x.id === choix.seance);
      if (s) paires.push(['Séance', L.formatHumain(L.parseLocal(s.debut)) + (s.titre ? ' · ' + s.titre : '')]);
      paires.push(['Personnes', String(choix.personnes)]);
    }
    lignes($('#ticket-lignes'), paires);
    const prix = prixChoix();
    $('#ticket-total').textContent = prix === null ? '—' : L.formatPrix(prix);
  }

  $('[name=interne]').addEventListener('change', dessinerTicket);

  // ---------- Envoi ----------

  const form = $('#formulaire');

  function verifier() {
    const o = offre(choix.offre);
    const champs = ['prenom', 'nom', 'instagram', 'classe', 'telephone', 'email'];
    let premier = null;
    const messages = {
      prenom: 'Indique ton prénom.', nom: 'Indique ton nom.',
      instagram: 'Indique ton compte Instagram (lettres, chiffres, points et _).',
      classe: 'Indique ta classe.', telephone: 'Ce numéro ne semble pas valide.', email: 'Cet e-mail ne semble pas valide.'
    };
    champs.forEach((nom) => {
      const input = form.elements[nom];
      let ok = input.checkValidity() && (!input.required || input.value.trim() !== '');
      if (nom === 'telephone' && input.value.trim()) ok = /^\+?\d{10,13}$/.test(input.value.replace(/[\s.\-]/g, ''));
      input.setAttribute('aria-invalid', ok ? 'false' : 'true');
      if (!ok && !premier) premier = { input, message: messages[nom] };
    });
    const engagement = form.elements.engagement;
    const blocEngagement = $('#bloc-engagement');
    blocEngagement.removeAttribute('aria-invalid');
    if (!premier && o.type === 'location' && !engagement.checked) {
      blocEngagement.setAttribute('aria-invalid', 'true');
      premier = { input: engagement, message: 'Coche la case : en cas de casse, le projecteur est à rembourser.' };
    }
    if (!premier && o.type === 'location' && !choix.debut) premier = { input: $('#liste-heures input') || $('#quand'), message: 'Choisis une heure de remise.' };
    if (!premier && o.type === 'seance' && !choix.seance) premier = { input: $('#liste-seances input') || $('#quand'), message: 'Choisis une séance.' };
    return premier;
  }

  function alerte(zone, message) {
    zone.textContent = message;
    zone.hidden = false;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const souci = verifier();
    const zone = $('#envoi-alerte');
    if (souci) {
      alerte(zone, souci.message);
      souci.input.focus({ preventScroll: false });
      return;
    }
    zone.hidden = true;
    const f = form.elements;
    const corps = {
      action: 'reserver',
      offre: choix.offre,
      jours: choix.offre === 'longue' ? choix.jours : undefined,
      debut: choix.debut,
      seance: choix.seance,
      personnes: choix.personnes,
      prenom: f.prenom.value, nom: f.nom.value, instagram: f.instagram.value, classe: f.classe.value,
      interne: f.interne.checked, telephone: f.telephone.value, email: f.email.value, message: f.message.value,
      engagement: f.engagement.checked, site: f.site.value
    };
    const bouton = $('#valider');
    bouton.disabled = true;
    bouton.textContent = 'Envoi en cours…';
    envoyer(corps).then((r) => {
      if (r && r.ok) return confirmer(r.reservation);
      const code = r && r.code;
      if (code === 'CRENEAU_INDISPO' || code === 'COMPLET' || code === 'SEANCE') {
        alerte($('#quand-alerte'), r.erreur);
        return rafraichir().then(() => { $('#qui').hidden = true; defiler('#quand'); });
      }
      alerte(zone, (r && r.erreur) || 'Une erreur est survenue. Réessaie.');
    }).catch(() => {
      alerte(zone, 'Connexion impossible. Vérifie ton réseau et réessaie.');
    }).finally(() => {
      bouton.disabled = false;
      bouton.textContent = 'Valider la réservation';
    });
  });

  // ---------- Merci ----------

  function confirmer(resa) {
    if (!resa) return;
    derniereResa = resa;
    $('#recu-numero').textContent = resa.id;
    $('#recu-prenom').textContent = resa.prenom;
    const paires = [['Formule', resa.offreNom + (resa.offre === 'longue' ? ' · ' + resa.jours + ' jours' : '')]];
    if (resa.type === 'location') {
      paires.push(['Remise', L.formatHumain(L.parseLocal(resa.debut)) + ', ' + resa.lieu]);
      paires.push(['Retour', resa.retour]);
    } else {
      paires.push(['Séance', L.formatHumain(L.parseLocal(resa.seance)) + (resa.seanceTitre ? ' · ' + resa.seanceTitre : '')]);
      paires.push(['Personnes', String(resa.personnes)]);
    }
    lignes($('#recu-lignes'), paires);
    $('#recu-total').textContent = L.formatPrix(resa.prix);
    $('#recu-mot').textContent = 'On t\'écrit sur Instagram pour fixer l\'endroit exact.' +
      (resa.emailEnvoye ? ' Une confirmation part aussi sur ton e-mail.' : '');

    ['#carte', '#quand', '#qui'].forEach((s) => { $(s).hidden = true; });
    $('.accroche').hidden = true;
    const merci = $('#merci');
    merci.hidden = false;
    const recu = $('#recu');
    recu.classList.remove('imprime');
    void recu.offsetWidth; // relance l'animation
    recu.classList.add('imprime');
    window.scrollTo({ top: 0, behavior: 'auto' });
    merci.focus({ preventScroll: true });
    rafraichir();
  }

  $('#nouvelle').addEventListener('click', () => {
    form.reset();
    form.querySelectorAll('[aria-invalid]').forEach((n) => n.removeAttribute('aria-invalid'));
    Object.assign(choix, { offre: null, jours: 3, jourCle: null, debut: null, seance: null, personnes: 1 });
    $('#merci').hidden = true;
    $('.accroche').hidden = false;
    $('#carte').hidden = false;
    $('#quand').hidden = true;
    $('#qui').hidden = true;
    dessinerCarte();
    defiler('#carte');
    const premier = $('#carte input');
    if (premier) premier.focus({ preventScroll: true });
  });

  // ---------- Ajouter à l'agenda (.ics) ----------

  function ics(resa) {
    const date = (s) => s.replace(/[-:]/g, '') + '00';
    const fin15 = (s) => L.formatLocal(L.parseLocal(s) + 15);
    const evts = resa.type === 'location'
      ? [['remise', 'Remise du projecteur locaproj', resa.debut, fin15(resa.debut)],
         ['retour', 'Retour du projecteur locaproj', resa.retourDebut, resa.fin]]
      : [['seance', 'Séance locaproj' + (resa.seanceTitre ? ' : ' + resa.seanceTitre : ''), resa.seance, L.formatLocal(L.parseLocal(resa.seance) + 180)]];
    const echap = (t) => t.replace(/[\\;,]/g, (c) => '\\' + c);
    const maintenant = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//locaproj//reservation//FR', 'CALSCALE:GREGORIAN']
      .concat(...evts.map(([cle, titre, debut, fin]) => [
        'BEGIN:VEVENT',
        'UID:' + resa.id + '-' + cle + '@locaproj',
        'DTSTAMP:' + maintenant,
        'DTSTART:' + date(debut),
        'DTEND:' + date(fin),
        'SUMMARY:' + echap(titre),
        'LOCATION:' + echap(resa.lieu || 'au Roc'),
        'DESCRIPTION:' + echap('Réservation ' + resa.id + '. Endroit exact à fixer sur Instagram (@locaproj.roc).'),
        'END:VEVENT'
      ]))
      .concat(['END:VCALENDAR']).join('\r\n');
  }

  $('#ajouter-agenda').addEventListener('click', () => {
    if (!derniereResa) return;
    const blob = new Blob([ics(derniereResa)], { type: 'text/calendar;charset=utf-8' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'locaproj-' + derniereResa.id + '.ics' });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });

  // ---------- Divers ----------

  function defiler(sel) {
    const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => $(sel).scrollIntoView({ behavior: reduit ? 'auto' : 'smooth', block: 'start' }));
  }

  $('#reessayer').addEventListener('click', rafraichir);

  function dessinerTextesRetour() {
    document.querySelectorAll('.txt-heures').forEach((n) => { n.textContent = texteHeuresRetour(); });
  }

  if (DEMO) $('#bandeau-demo').hidden = false;
  dessinerTextesRetour();
  dessinerPrix();
  dessinerCarte();
  rafraichir();
})();
