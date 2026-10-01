# RAG Chinese Economy

Workflow n8n de **RAG** (*Retrieval-Augmented Generation*) : un chatbot qui répond aux questions sur l'économie chinoise **uniquement à partir d'un livre de référence**, ici *Broken China* de Logan Wright. Il répond dans la langue de la question, cite les pages utilisées, et répond « Je n'ai pas cette information dans le livre » plutôt que d'inventer. Tout tourne sur des offres gratuites : **n8n Cloud**, **Gemini** et **Supabase**.

Le livre n'est pas fourni : dépose ton propre exemplaire, au format PDF texte (pas un scan).

## Fonctionnement

Le workflow contient deux processus, chacun découpé en étapes encadrées par une note sur le canevas.

### Ingestion (une seule fois)

```
PDF Form ─► Extract ─► Cleaning ─► Chunking ─► Limit ─► Find Stored Chunks ─► Keep Missing Chunks ─► Loop Over Items (25) ─┬─► Ingestion Complete
                                                                                                                              └─► Chunking (SUB) ─► paquet suivant

Sous-workflow lancé par Chunking (SUB) : Chunking (Trigger) ─► Embedding ─► Execute a SQL Query
```

1. **PDF Form** reçoit le PDF, **Extract** en sort le texte page par page.
2. **Cleaning** normalise le texte de chaque page et construit le nom du livre (titre et auteur du PDF) utilisé dans les citations.
3. **Chunking** coupe le livre en morceaux d'environ 2 000 caractères, avec 200 caractères de chevauchement, et note les pages de chaque morceau. Si le PDF ne contient pas de texte, l'ingestion s'arrête avec un message clair. **Limit** borne le nombre de chunks pour les tests.
4. **Find Stored Chunks** et **Keep Missing Chunks** écartent les chunks déjà en base : une relance reprend là où elle s'est arrêtée, sans doublon et sans refaire d'appel Gemini.
5. **Loop Over Items** envoie les chunks au sous-workflow par paquets de 25. Chaque paquet est enregistré avant le suivant.
6. Le sous-workflow, dans le même canevas, vectorise chaque chunk avec Gemini (**Embedding**, une requête toutes les 1,3 s pour rester dans le quota gratuit) et l'insère dans Supabase (**Execute a SQL Query**).

### Answering (chat)

```
Chat ─► Config ─► Load Messages ─► Context ─► Routing ─► Needs Search ─┬─► Prepare Queries ─► Embed Queries ─► Search ─► Merge Results ─► Reranking ─► Keep Best Passages ─┐
                                                                        └─► Skip Search ──────────────────────────────────────────────────────────────────────────────────────┴─► Generation ─► Save Messages ─► Format Reply
```

1. **Input** : le message arrive par le déclencheur de chat.
2. **Context** : **Config** regroupe les réglages, **Load Messages** lit les 5 derniers échanges de la conversation dans Supabase, **Context** assemble la question et l'historique.
3. **Routing** : Gemini reformule la question en tenant compte de l'historique, produit 1 à 3 requêtes de recherche et des mots-clés en anglais (la langue du livre), et décide s'il faut chercher dans le livre. Les salutations, remerciements et demandes sur les réponses précédentes passent par **Skip Search**, sans recherche.
4. **Search** : chaque requête est vectorisée, puis la fonction SQL `hybrid_search` combine la recherche vectorielle et la recherche plein texte sur les mots-clés (utile pour les noms propres et les sigles). **Merge Results** dédoublonne et garde 15 candidats.
5. **Reranking** : Gemini Flash Lite note chaque passage de 0 à 10 ; **Keep Best Passages** garde les 5 meilleurs ayant au moins 5/10.
6. **Generation** : Gemini rédige la réponse à partir de ces passages uniquement, avec les pages citées. **Save Messages** enregistre l'échange dans l'historique.

Si Gemini ou Supabase échoue à une étape, l'utilisateur reçoit un message d'excuse (**Service Unavailable Reply**).

## Installation

1. **Supabase**
   - Crée un projet gratuit sur <https://supabase.com>.
   - Dans **SQL Editor**, exécute [`supabase-setup.sql`](./supabase-setup.sql) : table des chunks, index, fonction de recherche hybride.
2. **Identifiant Postgres** (pour n8n)
   - Dans Supabase, **Project Settings → Database → Reset database password**, et garde le mot de passe.
   - Bouton **Connect → Session pooler → View parameters** : relève le *host* (`aws-…-<région>.pooler.supabase.com`), le port `5432` et l'utilisateur `postgres.<référence-du-projet>`. n8n Cloud ne peut pas utiliser la connexion directe, réservée à IPv6.
   - Dans n8n, crée un identifiant **Postgres** avec ces valeurs, la base `postgres` et **SSL : Require**.
3. **Gemini** : crée un identifiant **Google Gemini (PaLM) API** avec une clé obtenue sur Google AI Studio. Pour garantir un coût nul, n'active pas la facturation sur le projet Google de cette clé.
4. Dans n8n, clique sur **Workflows → Import from File** et choisis [`RAG Chinese Economy.json`](./RAG%20Chinese%20Economy.json).
5. Sélectionne les identifiants dans les nœuds :
   - **Gemini** : *Embedding*, *Embed Queries*, *Gemini Routing Model*, *Gemini Reranking Model*, *Gemini Chat Model* ;
   - **Postgres** : *Find Stored Chunks*, *Execute a SQL Query*, *Search*, *Load Memory*, *Save Memory*.
6. Dans **Chunking (SUB)**, choisis **ce même workflow** : il appelle son propre sous-workflow, et l'export contient `YOUR_WORKFLOW_ID` à la place de l'identifiant.
7. Enregistre et publie le workflow. Le sous-workflow appelé en production est la version publiée : republie après chaque modification.
8. **Ingestion** : dépose le PDF dans le formulaire de **PDF Form** (ou **Execute workflow** dans l'éditeur). Commence avec **Limit** à 50 pour vérifier la chaîne, puis passe-le à 1000 et relance : les chunks déjà enregistrés sont sautés. Compte environ 1,4 s par chunk, soit une dizaine de minutes pour un livre de 300 pages.
9. **Chat** : bouton **Open chat** dans l'éditeur, ou la page [`chat.html`](./chat.html) à ouvrir dans un navigateur. Dans ce cas, colle l'URL de production du nœud **When Chat Message Received** dans « Connexion au workflow n8n ».

## Réglages

Le nœud **Config** regroupe les réglages du chat :

| Réglage | Valeur | Rôle |
|---|---|---|
| `maxQueries` | 3 | Requêtes de recherche par question |
| `matchCount` | 8 | Résultats par requête |
| `candidateCount` | 15 | Passages envoyés au reranking |
| `keepCount` | 5 | Passages gardés pour la réponse |
| `minRerankScore` | 5 | Note minimale (sur 10) pour garder un passage |
| `historyExchanges` | 5 | Échanges de l'historique pris en compte |

## Fichiers

| Fichier | Contenu |
|---|---|
| `RAG Chinese Economy.json` | Export du workflow, importable directement dans n8n |
| `RAG Chinese Economy.workflow.ts` | Même workflow au format [n8n Workflow SDK](https://www.npmjs.com/package/@n8n/workflow-sdk), utilisable avec `n8ncli` |
| `supabase-setup.sql` | Script de création de la base de connaissances dans Supabase |
| `chat.html` | Page de chat autonome pour tester le chatbot hors de l'éditeur |

## Limites connues

- Seuls les PDF texte sont pris en charge : un livre scanné nécessiterait un OCR.
- Les numéros de page sont ceux du fichier PDF ; ils peuvent différer des numéros imprimés.
- Le modèle `models/gemini-3.1-flash-lite-preview` est en préversion : aux heures chargées, Google peut répondre « high demand » (erreur 503), et le chatbot renvoie alors son message d'excuse sans nouvelle tentative.
- Chaque question consomme jusqu'à 3 appels Gemini et 3 embeddings : à 200 questions par jour, on approche les plafonds de l'offre gratuite.
- Publié en mode webhook public, le chat est accessible sans mot de passe à toute personne qui connaît son URL. Active l'authentification du déclencheur de chat pour un usage hors tests.
- La recherche par mots-clés utilise la racinisation anglaise, adaptée à un livre en anglais.
- Les sous-workflows apparaissent comme des exécutions séparées (mode « integrated ») dans l'onglet *Executions* : leurs nœuds restent gris dans la vue de l'exécution principale.
- `n8ncli validate` signale à tort *Load Messages* et *Save Messages* comme des sous-nœuds non connectés ; la validation du serveur n8n accepte le workflow.
