# CONVERSION.md — Campagnes Halloween / Black Friday, A/B testing, VSL

Mécaniques conformes à `Liamrjohnston/offer-master-skill` (offer-master, offer-urgency-name-price,
offer-honesty-check) : faits réels uniquement, une garantie plafonnée, urgence réelle, aucune ancre inventée.

Interdits (légalement et par principe) : faux prix barré jamais pratiqué, faux compte à rebours,
fausse "valeur totale", fausse rareté. En Belgique/UE la directive Omnibus impose que le prix de
référence soit le plus bas pratiqué sur les 30 jours précédents. Toute promo ci-dessous a une
date de fin et un plafond VRAIMENT appliqués par Stripe.

---

## 1. Offres en place (LIVE sur Stripe)

| Offre | Prix | Type | Lien A | Lien B |
|---|---|---|---|---|
| Venkai Automaton Pro | 94 EUR/mois | abonnement, résiliable | buy.stripe.com/fZu3cv0Lmebyakk3BH5AQ02 | buy.stripe.com/4gM9ATcu4ffCdwwegl5AQ06 |
| Venkai Automaton Trading | 238 EUR/mois | abonnement, résiliable | buy.stripe.com/fZucN50Lm4AYboo5JP5AQ03 | buy.stripe.com/4gM6oH51Cebydww8W15AQ07 |
| Pack Skills Venkai | 43 EUR | achat unique | buy.stripe.com/dRm6oH0Lm0kI9gg4FL5AQ04 | buy.stripe.com/00w5kDfGg5F28cca055AQ08 |
| Setup & Migration | 487 EUR | achat unique, 2x possible (même total) | buy.stripe.com/7sY9AT51C3wU644fkp5AQ05 | buy.stripe.com/cNi14n0Lm6J65004FL5AQ09 |

Garantie unique (la même partout, plafonnée, 2 conditions max) :
"Si votre agent ne livre pas le travail configuré, on reprend l'installation avec vous ; si cela ne
suffit pas, le premier mois est remboursé (plafond : 1 mois)." Coter le coût : taux de demande 1 sur 10 (estimate).

## 2. Campagne Halloween : 24 au 31 octobre 2026 (vraie fin forcée par Stripe)

- Code **HALLOWEEN26** : -15% sur les 3 premiers mois (Pro et Trading). Plafond : 25 rédemptions. Expire le 31/10/2026 23:59 (Europe/Brussels), appliqué par Stripe.
- Code **HALLOWEEN26-SKILLS** : Pack Skills offert (43 EUR de moins sur le pack). Plafond : 25. Même expiration.
- Message honnête : "Vente Halloween, du 24 au 31 octobre inclus. 25 codes, puis tarif normal."
  Le plafond et la date sont réels, donc l'urgence est vraie. Rien d'autre à prétendre.

## 3. Campagne Black Friday : 27 novembre au 1er décembre 2026

- Code **BLACKFRIDAY26** : -20% sur les 3 premiers mois. Plafond : 50 rédemptions. Expire le 01/12/2026 23:59.
- Option à confirmer (owner) : annonce "prix de lancement, il augmente à [X] après le 1er décembre".
  Uniquement si l'augmentation est réellement appliquée ensuite. Sinon on n'en parle pas.
- Pas de relance "dernière chance" inventée : on relance sur la vraie fin de campagne.

## 4. Plan A/B test (concret)

Hypothèse : le cadrage "économies" (B) convertit mieux sur trafic froid, le cadrage "travail livré" (A)
mieux sur trafic chaud (audience venkai.fr déjà acquise).

- Variable unique : le cadrage de la page/VSL qui pointe vers le lien A ou le lien B. Le produit et le prix sont identiques.
- Métriques : taux de clic VSL → checkout, puis taux checkout → paiement (Stripe dashboard, filtre metadata.variant).
- Volume : on tire une conclusion après [N] paiements par variante minimum. Sans ce volume, on ne conclut pas.
- Durée : 2 semaines minimum par test, une seule variable changée à la fois.
- Ce qu'on mesure pour de vrai : variante, source (utm_source/utm_content), offre, montant. Tout est dans metadata côté Stripe.
- Ordre des tests ensuite : (1) garantie, (2) bonus stack, (3) paiement en 2 fois sur Setup, (4) ordre des blocs VSL.
  Changer une chose, mesurer, puis la suivante. Les effets se multiplient, ils ne s'additionnent pas.

## 5. VSL — structure et script

Structure en 7 blocs, ~3 à 5 minutes :

1. **Hook (0-15s)** : le problème dans les mots du prospect, pas du vendeur. Deux variantes A/B à tester.
2. **Problème (15-45s)** : le coût de rester bloqué, avec les faits qu'on possède. Ce qu'on n'a pas : [placeholder], jamais un chiffre inventé.
3. **Mécanisme (45s-2min)** : comment l'agent travaille concrètement (démo écran réelle : un agent qui exécute une tâche, journal d'audit visible).
4. **Preuve (2-3min)** : uniquement des éléments réels : le fork public (github.com/EnzoLaurenceau/venkai-automaton), la démo en direct, [témoignages clients quand ils existent]. Pas de résultat chiffré qu'on ne peut pas montrer.
5. **Offre (3-4min)** : ce qui est compris, la garantie plafonnée, le prix (94 EUR/mois, résiliable à tout moment), le code promo et sa vraie fin.
6. **Urgence vraie (4-4:30min)** : "25 codes Halloween, jusqu'au 31 octobre 23:59, ensuite tarif normal." Rien d'autre.
7. **CTA (4:30-5min)** : le lien A ou B, répété à l'écran, et la garantie rappelée en une phrase.

Script du bloc 5 (exemple Pro, honnête) :
"Voici ce qui est compris : votre agent hébergé en continu, votre sous-domaine venkai.fr, l'inference
sans compteur, les mises à jour automatiques, le pack de 800+ compétences, et la session de lancement.
Si votre agent ne livre pas le travail configuré, on reprend l'installation avec vous, et si cela ne
suffit pas, le premier mois est remboursé. C'est 94 euros par mois, résiliable quand vous voulez.
Cette semaine, le code HALLOWEEN26 enlève 15% sur les trois premiers mois. Il y a 25 codes, ils
s'arrêtent le 31 octobre à 23h59."

## 6. Bénéfices à ajouter quand ils sont réels (offer-included)

- [ ] Nombre réel d'agents déjà provisionnés et de tâches exécutées (compteur affiché sur venkai.fr).
- [ ] Témoignages nommés avec autorisation.
- [ ] Étude de cas d'un client existant (ULB MUN, PlayerProManagement, X-Ray sont des clients Stripe réels : demander l'autorisation d'en parler).
- [ ] Démo live hebdomadaire (réel seulement si elle a lieu).

## 7. Décisions prises (max revenu, honnêtes)

1. **Plafonds gardés** : 25 codes Halloween, 50 Black Friday. Rareté réelle = conversion plus haute
   que des promos ouvertes, et pas de sur-vente au-delà de la capacité d'onboarding.
2. **Hausse de prix RÉELLE et annoncée** : Pro 94 -> 107 EUR, Trading 238 -> 271 EUR à partir du
   2 décembre 2026. Les prix post-BF existent déjà côté Stripe (price_1UTxxpGX3eCPj1HevAwiJc2A,
   price_1UTxxqGX3eCPj1HeUtpk1e0q) et le swap des liens est automatisé (script
   D:\Venkai\stripe-swap-postbf.mjs). L'urgence est vraie, donc elle vend.
3. **Setup 487 EUR** : paiement en 2 x 253 EUR (total 506, +19 EUR annoncé dans la même phrase).
   Avantage net : abaisse la barrière d'entrée sans baisser le prix affiché.
