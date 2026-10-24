# LAUNCH-CONTENT.md — contenu prêt à publier (X, Insta, TikTok, Product Hunt)

Règles : faits réels uniquement, pas de rendement promis, pas de faux prix barré,
prix affichés exactement comme sur Stripe. Chaque post mène vers un lien A ou B (A/B test).

## Product Hunt (soumission)

- Nom : Venkai Automaton
- Tagline : Self-evolving autonomous agents that earn their own keep
- Description : Venkai Automaton is an open-source runtime for autonomous agents that run 24/7,
  do real work, and pay for their own infrastructure. Self-hosted (Hetzner), EUR billing,
  GDPR-friendly, 800+ skills included. The fork auto-syncs upstream and evolves its own tools,
  with every self-modification audit-logged. Demo link: https://venkai.fr
- URL : https://github.com/EnzoLaurenceau/venkai-automaton
- Topics : Artificial Intelligence, Developer Tools, Open Source, Productivity
- First comment (maker) : "Maker here. We built this because Conway's Automaton is great but
  priced in USDC on their cloud. We kept the runtime, replaced the paid stack with our own infra,
  and kept the constitution. Happy to answer anything."

## X — série de lancement (1 post/jour, liens alternés A/B)

J1 (annonce) :
"Venkai Automaton est en ligne. Un agent autonome qui tourne 24/7, exécute de vraies tâches et
paie sa propre infra. Open source, auto-évolutif, facturation en EUR.
Code HALLOWEEN26 : -15% sur 3 mois, 25 codes, fin le 31/10 23h59.
[Lien A ou B]"

J2 (preuve, pas de promesse) :
"Ce que fait un agent Venkai concrètement : il provisionne son serveur, écrit son propre code,
tient son journal d'audit, et poste ses propres updates. Tout est versionné sur GitHub, y compris
ses auto-modifications. [lien repo]"

J3 (différence) :
"Automaton de Conway facture sandboxes, inference et domains en crédits. On a tout remplacé par
ce qu'on possède déjà : Hetzner, MiMo, modèles locaux, *.venkai.fr. Le coût marginal d'un agent
est donc proche de zéro, et ça se voit sur les prix. [lien B]"

J4 (offre + urgence vraie) :
"Pro : 94 EUR/mois. Trading : 238 EUR/mois. Pack Skills : 43 EUR. Le prix passe à 107 et 271
le 2 décembre (c'est réel, les prix post-BF sont déjà créés). Ce qui ne change pas : garantie
plafonnée, résiliable quand vous voulez. [lien A]"

J5 (derrière le rideau) :
"Chaque paiement Stripe provisionne automatiquement un agent : serveur Hetzner, sous-domaine
venkai.fr, email de bienvenue, alerte Slack. Le webhook vérifie la signature HMAC et est
idempotent. Démo dans le repo. [lien repo]"

## Insta / TikTok (1 vidéo courte / 2-3 jours)

Idées de formats (démo réelle à l'écran, jamais de faux résultats) :
1. "Un agent qui s'achète son propre serveur" : capture de l'agent qui provisionne (30s).
2. "Il écrit son propre code" : timelapse de self-modification + audit log (45s).
3. "Combien ça coûte vraiment" : le vrai coût d'un agent auto-hébergé vs crédits (30s, sans
   inventer de chiffre concurrent : montrer nos vrais coûts Hetzner/MiMo).
4. "Halloween : 25 codes, -15%" : écran du checkout Stripe avec le code appliqué (15s).
5. "Le fork qui suit son amont tout seul" : le workflow GitHub evolve-upstream-sync (30s).

CTA dans la bio : lien A. Codes promo rappelés à l'oral avec la vraie date de fin.

## Ce qu'on ne fait pas

- Pas de faux prix barré, pas de "valeur totale" inventée, pas de compte à rebours faux.
- Pas de promesse de rendement (surtout Trading : analyse uniquement).
- Pas d'achat de faux followers, pas de spam DM. La viralité vient du contenu + GitHub.
