# Weekly Slack Digest

Workflow n8n qui envoie **chaque vendredi à 19 h (heure de Paris)** une synthèse courte et narrative, en français, des messages publiés dans le canal Slack **#général** au cours des 7 derniers jours. La synthèse est rédigée par **Gemini** (offre gratuite) et arrive par **Gmail**.

## Fonctionnement

```
Every Friday 7 PM ─► Compute Period ─► Fetch General Messages ─► Build Transcript ─► Has Messages ─┬─► Summarize With Gemini ─► Build Summary Email ─┐
                                                                                                    └─► Build Empty Email ─────────────────────────────┴─► Send Summary Email

Erreur (Slack, Gemini, Gmail) ─► Count Failure ─► Retries Left ─┬─► Wait Five Minutes ─► Fetch General Messages (nouvel essai)
                                                                └─► Send Failure Alert
```

1. **Compute Period** calcule la période : du vendredi précédent 19 h au vendredi courant 19 h, sans trou ni chevauchement entre deux semaines. Les changements d'heure sont gérés.
2. **Fetch General Messages** lit l'historique de #général sur cette période.
3. **Build Transcript** ignore les événements système (arrivées dans le canal, changements de sujet…) et met les messages dans l'ordre chronologique.
4. S'il y a des messages, **Gemini** rédige un résumé en quelques paragraphes. Sinon, un e-mail « Rien à signaler cette semaine » est préparé.
5. **Send Summary Email** envoie l'e-mail avec l'objet « Synthèse Slack, semaine du JJ/MM », où la date est celle de l'envoi.

### Gestion des échecs

Toute erreur (Slack inaccessible, Gemini indisponible, Gmail en échec) part vers **Count Failure**. Le workflow attend alors 5 minutes et recommence depuis la lecture Slack, sur la même période. Après l'essai initial et 3 nouvelles tentatives, **un seul e-mail d'alerte** est envoyé, avec le dernier message d'erreur.

## Installation

1. Dans n8n, clique sur **Workflows → Import from File** et choisis [`Weekly Slack Digest.json`](./Weekly%20Slack%20Digest.json).
2. **Slack**
   - Sur <https://api.slack.com/apps>, crée une app (*From scratch*).
   - Dans **OAuth & Permissions → Bot Token Scopes**, ajoute `channels:history` et `channels:read`.
   - Installe l'app sur l'espace de travail, puis copie le **Bot User OAuth Token** (`xoxb-…`).
   - Dans n8n, crée un identifiant **Slack API** avec ce token et sélectionne-le dans *Fetch General Messages*.
   - Choisis le canal **#général** dans la liste, puis invite le bot dans le canal avec `/invite @nom-du-bot`.
3. **Gemini** : crée un identifiant **Google Gemini (PaLM) API** avec une clé obtenue sur Google AI Studio. Pour garantir un coût nul, n'active pas la facturation sur le projet Google de cette clé : si le quota gratuit est dépassé, l'appel échoue et tu reçois l'alerte au lieu d'être facturé.
4. **Gmail** : connecte un identifiant **Gmail OAuth2** et remplace `YOUR_EMAIL@gmail.com` par ton adresse dans **Send Summary Email** et **Send Failure Alert**.
5. Lance un test avec **Execute workflow**, puis active le workflow.

## Fichiers

| Fichier | Contenu |
|---|---|
| `Weekly Slack Digest.json` | Export du workflow, importable directement dans n8n |
| `Weekly Slack Digest.workflow.ts` | Même workflow au format [n8n Workflow SDK](https://www.npmjs.com/package/@n8n/workflow-sdk), utilisable avec `n8ncli` |

## Limites connues

- Seuls les messages principaux du canal sont lus, pas les réponses dans les fils de discussion.
- Slack ne renvoie que les identifiants des auteurs, pas leurs noms. Le résumé parle donc d'« un participant ».
- Le modèle utilisé est `models/gemini-flash-latest`, un alias qui pointe toujours vers le dernier modèle Flash stable de Google.
