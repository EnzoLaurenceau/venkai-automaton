# CHANNELS.md — pub gratuite SANS clé API + pistes de revenus

Canaux où l'agent (ou toi) peut poster gratuitement, juste avec un compte web.
Aucune clé API. Zéro coût. Usage honnête uniquement : pas de spam, pas de faux comptes,
contenu réel (démos, chiffres réels, liens Stripe A/B).

## 1. Pub gratuite sans API (compte web suffit)

| Canal | Comment | Pourquoi ça marche |
|---|---|---|
| **GitHub** | README du fork + releases + topics + Discussions | 7.5k stars sur l'amont = trafic naturel ; le fork est déjà public |
| **Reddit** | r/SideProject, r/Entrepreneur, r/selfhosted, r/LocalLLaMA, r/ChatGPTCoding, r/SaaS | Posts honnêtes "j'ai fork X et remplacé la stack payante" = formats qui cartonnent |
| **Hacker News** | "Show HN: venkai-automaton, self-hosted autonomous agent" | Le sujet (agents autonomes) est tendu ; HN déteste la promo, aimer le technique |
| **Indie Hackers** | Post "building in public" + milestones revenus | Communauté exactement dans la cible |
| **Dev.to / Hashnode / Medium** | Article technique "how we decoupled the paid stack" | SEO long terme, pas besoin de clé |
| **X (@venkaioff)** | Session Opera GX (script D:\Venkai\x-opera-post.mjs) — 1 post/jour | Voir blocage anti-bot ci-dessous |
| **TikTok / Insta web** | Comptes contact@venkai.fr déjà créés, upload manuel ou script CDP | Vidéos démo courtes (voir LAUNCH-CONTENT.md) |
| **Lemmy / Mastodon** | Instances tech, même contenu que Reddit | Doublon de distribution gratuit |
| **Discord** | Serveurs AI/indie (Latent Space, AI Stack, indie hackers FR) | Présence utile, pas de pub brute |
| **LinkedIn** | Post "building in public" sur ton profil perso | Cible B2B (agences, SMB) pour l'offre Setup |
| **Directories gratuits** | AlternativeTo, Uneed, Fazier, Peerlist, Microlaunch, SaaSHub, Betalist, LaunchingNext | Backlinks + trafic durable, soumission web en 10 min |
| **YouTube** | VSL + shorts (compte Google existant) | Le VSL de CONVERSION.md devient vidéo |

Point bloqué actuel : X met un mur "human behind this account" sur @venkaioff (compte
nouveau). Sortie : 5-10 min d'engagement manuel (liker, répondre à 2-3 vrais posts,
suivre quelques comptes), puis le script CDP reposte tout seul.

## 2. Pistes de revenus concrètes (travail rémunéré)

| Source | Ce qu'on y vend | Pourquoi c'est bon |
|---|---|---|
| **Malt / Comet (BE/FR)** | Offre Setup & Migration 487 EUR, missions automatisation | Freelance FR/BE, facturation Liantis déjà en place |
| **Upwork / Fiverr** | "AI agent setup", "automation consulting", productisé | Débit mondial ; l'agent peut préparer les livrables |
| **r/forhire, r/slavelabour** | Petites missions automation/bots | Cash rapide, tickets 50-300 EUR |
| **Bug bounty (HackerOne, Bugcrowd, YWH)** | Recon + rapports (l'agent a 817 skills cybersécurité) | Payé à la faille ; ton pipeline YWH existe déjà |
| **GitHub Sponsors / Open Collective** | Sponsors sur le fork | Revenu passif si traction GitHub |
| **Gumroad / Lemon Squeezy** | Pack Skills 43 EUR + packs sectoriels | Déjà chiffré, paiement instantané |
| **Product Hunt (ce soir, ton compte)** | Lancement → trafic vers les liens A/B | Pic de trafic gratuit |
| **Prospection directe** | Pipeline findaclient + emails (Outreach SMTP dispo) | Agences/SMB EU : l'offre Setup + Pro |
| **Partenariats** | Affiliation Hetzner, intégrateurs MCP | Revenu secondaire, honnête |

## 3. Boucle automatique recommandée (l'agent gagne sans toi)

1. `publish_*` (X/IG/TikTok/PH) : 1 preuve réelle/jour (démo, commit, test vert).
2. Les visiteurs cliquent les liens A/B → Stripe → webhook crédite sa trésorerie.
3. `create_payment_request` pour les missions directes (Malt/Upwork/r-forhire).
4. Le dashboard temps réel trace tout : chaque euro, chaque livraison, chaque preuve.

Rappel (offer-master) : jamais de faux prix barré, jamais de faux compte à rebours,
jamais de promesse de rendement. Un canal gratuit ne change pas les règles.
