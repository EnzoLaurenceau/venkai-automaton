# VENKAI.md — Charte du fork `venkai-automaton`

Fork de [Conway-Research/automaton](https://github.com/Conway-Research/automaton) (MIT).
Objectif : un runtime d'agent autonome **auto-évolutif**, découplé des services payants
Conway, adossé à l'infrastructure et à la traction de **venkai.fr**.

Règle du fork : on garde le noyau (ReAct loop, memory, heartbeat, self-mod, constitution),
on remplace tout ce que Venkai possède déjà, et on n'ajoute QUE de la valeur qui ne
ressemble pas à ce qu'Automaton vend déjà.

---

## 1. Audit : ce que Conway facture (et où c'est dans le code)

| Service payant Conway | Point d'entrée code | Usage |
|---|---|---|
| Sandboxes Linux (VM) | `src/conway/client.ts:252` (`createSandbox`), `exec`/`writeFile`/`readFile`/`exposePort` | `src/replication/spawn.ts:105`, `constitution.ts`, `health.ts`, `lineage.ts` |
| Inference frontière | `src/conway/inference.ts`, `listModels` (`client.ts:541`) | fallback quand pas de clé OpenAI (`src/agent/loop.ts:152-156`) |
| Domains + DNS | `src/conway/client.ts:459-529` (search/register/DNS) | outils `register_domain`, DNS |
| Crédits prépayés (USD) | `src/conway/credits.ts`, `topup.ts`, `x402.ts` | survival tiers, `topup_credits` |
| Provisioning SIWE | `src/identity/provision.ts:68` (`api.conway.tech`) | clé API à l'install |
| Registry ERC-8004 | `src/conway/client.ts:365` (`registerAutomaton`) | identité on-chain (Base) |

Modèle économique amont : crédits en cents USD achetés en USDC (x402, Base).
Tiers : $5 / $25 / $100 / $500 / $1 000 / $2 500. Sandbox + inference + domains
sont débités de ces crédits.

## 2. Ce qu'on ne paie JAMAIS à Conway grâce à Venkai

| Facturé par Conway | Équivalent que Venkai a DÉJÀ | Coût Venkai | Statut |
|---|---|---|---|
| Inference (crédits) | Endpoint OpenAI-compatible : **MiMo** (`token-plan-ams.xiaomimimo.com/v1`, clés déjà en stock) + modèles locaux 98 GB (`D:\ForgeAI\models` : Qwen3-4b, Qwen2.5-VL-3b, llama.cpp) | ~0 (déjà payé) | **Évitable aujourd'hui, zéro code** |
| Sandboxes Conway Cloud | **Hetzner** : `lueur` (46.62.130.121) + `ubuntu` (95.217.167.41), k3s en cours — Docker/LXC par agent | ~€40/mo amorti sur N agents | Interface `ConwayClient` à réimplémenter (même surface REST) |
| Domains + DNS | **venkai.fr est à nous** : `*.venkai.fr` par agent (`aaa.venkai.fr`, `tl.venkai.fr` existent déjà) | 0 | Prêt côté DNS ; wrapper outils |
| Crédits USDC / x402 | Facturation **EUR/SEPA** directe (Liantis, BCE en cours) + ledger SQLite interne (`src/state/`) | 0 (pas de rails crypto) | Ledger déjà présent ; remplacer le pont x402 |
| Provisioning SIWE | Émission de clés **Venkai** (API keys maison) | 0 | 1 fichier à dupliquer (`provision.ts`) |
| Registry ERC-8004 | Optionnel : garder pour l'interop agent-à-agent, sinon désactivable | gas Base ~0 | Config `chainType` |
| Skills payants Conway | Écosystème **Hermes skills** (800+ : cybersecurity, forge, trading) + format quasi identique | 0 | Bridge de conversion skills |
| Infra d'orchestration | **forge-engine Rust** (1000 tasks / 528 µs) comme worker pool | 0 | Phase 2 |

Point clé vérifié dans le code : **Conway Compute est juste un endpoint
OpenAI-compatible** (`src/agent/loop.ts:152`). Le registre d'inférence lit
`~/.automaton/inference-providers.json` (`src/inference/provider-registry.ts:272`)
et supporte déjà un provider `local` (Ollama/vLLM, coût token = 0).
=> Toute l'inference Conway est contournable sans modifier une ligne.

## 3. Découplage — roadmap

**P0 (immédiat, zéro risque)**
1. `~/.automaton/inference-providers.json` → provider `mimo` (endpoint MiMo) +
   provider `local` activé. Voir `configs/venkai-inference-providers.example.json`.
2. Sous-domaines `*.venkai.fr` pour chaque agent à la place de `register_domain`.
3. Désactiver `topup_credits`/x402 en mode `self-hosted` (policy treasury).

**P1 (wrapper d'infra)**
4. `src/venkai/infra/` : implémentation de la surface `ConwayClient`
   (`createSandbox`, `exec`, `writeFile`, `readFile`, `exposePort`) sur Hetzner/k3s
   via SSH + Docker. `src/replication/*` ne change pas d'interface.
5. `src/venkai/billing/` : ledger EUR interne + facturation SEPA (Liantis), remplace
   `credits.ts`/`topup.ts` (mêmes seuils de survival tiers, devise EUR).

**P2 (différenciation)**
6. Bridge Hermes skills → `src/skills/` (import des 800+ skills existants).
7. Connecteurs **Trading Lab** : les 43 outils MCP de `tl.venkai.fr` exposés comme
   tools d'automaton (agents qui travaillent vraiment → Law II respectée).
8. Worker pool `forge-engine` pour l'orchestration multi-agents.

## 4. Auto-évolution (ce qui différencie ce fork)

Le fork n'est pas un fork mort : il évolue tout seul, dans les deux sens.

1. **Sync amont** : `.github/workflows/upstream-sync.yml` — chaque semaine, merge
   automatique de `Conway-Research/automaton` dans une branche `evolve/upstream-*`
   + PR. Conflits → issue taguée `evolve/conflict` (matériel d'évolution).
   Le code le supporte déjà : `src/self-mod/upstream.ts` fetch `origin/main` et
   review de diffs (git-versionné, audit-logged).
2. **Evolve Engine** (roadmap) : le runtime propose ses propres mutations
   (nouveaux tools, prompts, skills) → harness d'éval (`src/__tests__/` comme
   barre) → promotion ou revert via git. Base déjà présente : `src/self-mod/`
   (audit-log, tools-manager, rate limits) + `src/git/state-versioning.ts`.
3. **SOUL.md v2** : l'identité de l'automaton inclut son affiliation Venkai
   (facturation EUR, domaine venkai.fr, mission travail honnête rémunéré en EUR).

## 5. Différenciation vs Automaton (ne pas copier ce qu'ils vendent)

| Automaton (Conway) | venkai-automaton |
|---|---|
| Paiement USDC/x402, crédits USD | EUR/SEPA, facture Liantis, TVA BE |
| Sandbox Conway Cloud (facturée à la minute) | Hetzner/k3s auto-hébergé, sous-domaine gratuit |
| Domains payants | `*.venkai.fr` gratuit pour l'agent |
| Inference Conway (marge revendeur) | MiMo + local : coût marginal ≈ 0 |
| Positionnement US, crypto-native | **EU/GDPR**, entreprise belge, pas de wallet requis |
| Marketplace skills en cours | 800+ skills Hermes déjà disponibles |
| — | Connecteurs métier : Trading Lab (43 MCP tools), Clipping Lab |

## 6. Monétisation via la traction de venkai.fr

Le coût marginal d'un agent ≈ 0 (infra déjà payée, inference déjà payée) : on peut
donner beaucoup gratuitement et marge sur le reste.

1. **Free tier "Agent Vénitien"** : un agent par compte, sous-domaine
   `agent.venkai.fr`, modèle local/MiMo. Sert d'acquisition : chaque agent est une
   vitrine vivante sur venkai.fr.
2. **Pro (€29-99/mo)** : multi-agents, réplication supervisée, skills premium,
   inference MiMo dédiée, SLA.
3. **Trading (€199/mo)** : connecteurs `tl.venkai.fr`, agents de veille/backtest
   (attention : pas de promesse de rendu — travail honnête = veille, recherche,
   exécution de tâches rémunérées, conformément à la Law II).
4. **White-label / B2B** : runtime installé chez le client, sous-marque
   `client.venkai.fr`, facturation à la licence (relais `findaclient`/B2B skills).
5. **Skills & templates** : packs sectoriels (cybersécurité, trading, fiscalité BE)
   vendus en one-shot ou en abonnement.

Ordre de grandeur : une box Hetzner (~€40/mo) sert des dizaines d'agents ; le
premier client Pro couvre déjà l'infra entière.

## 7. Garanties conservées

- `constitution.md` upstream intact (Law I : jamais de mal ; Law II : travail
  honnête ; Law III : jamais tromper). Toute divergence business se fait DANS ces lois.
- Audit-log + git versioning de toute auto-modification (hérité de `src/self-mod/`).
- Aucune suppression de garde-fous de sécurité (`injection-defense`, `policy-engine`,
  `path-protection`) — ce sont des arguments commerciaux en EU.

---

Généré le 2026-10-24. En amont : `Conway-Research/automaton` (MIT).
