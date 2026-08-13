---
id: 038
titre: Compresser les réponses de l'API — 879 Ko → 127 Ko sur la carte
statut: done
dependances: [037]
priorite: P1
estimation: M
---

# 038 — Les réponses de l'API partent en clair

**Ce que ça corrige :** vérifié sur le serveur bâti (`node .output/server/index.mjs`),
aucune réponse d'API ne porte de `content-encoding`. Nitro ne compresse pas les
réponses dynamiques — `compressPublicAssets` ne concerne que les fichiers
statiques.

Coût réel, mesuré :

| Réponse | Aujourd'hui | Avec gzip |
|---|---|---|
| `/api/map/stations`, France entière | **879 Ko** | **127 Ko** |
| `/api/stations`, Paris rayon 10 km | 82 Ko | ~12 Ko |

Sur mobile, 879 Ko pour afficher la France est rédhibitoire. C'est ce qui rend
l'exploration libre (ticket 039) réellement utilisable.

## Point d'accroche

Le hook Nitro `beforeResponse` est **attendu** (`await nitroApp.hooks.callHook`)
et h3 utilise le corps muté :

```js
await options.onBeforeResponse(event, _response)
await handleHandlerResponse(event, _response.body, spacing)
```

Subtilité qui décide de l'implémentation : à ce stade le corps est encore un
**objet JS**, pas du JSON sérialisé. Le plugin sérialise donc lui-même, puis
remplace le corps par un `Buffer` gzippé. `handleHandlerResponse` pose ensuite le
`content-length` du Buffer — il n'y a pas de longueur périmée à corriger.

## Décisions d'interface

- Décision **pure** et testable dans `server/lib/compression.ts` :
  `shouldCompress({ method, path, acceptEncoding, existingEncoding, byteLength })`.
- Glue I/O minimale dans `server/plugins/compress-api.ts`.
- **Périmètre `/api/` uniquement.** Le HTML SSR y gagnerait aussi, mais il passe
  par des chemins de rendu et de streaming différents : hors périmètre, et un
  gain là-dessus ne justifie pas le risque.
- **Corps objet uniquement** (donc du JSON). Un `Buffer`, un flux ou une chaîne
  déjà typée `text/html` n'est pas touché : on ne devine pas le `content-type`
  de quelque chose qu'on n'a pas sérialisé.
- **Seuil 1 400 octets** (~1 MTU) : sous cette taille, compresser ne gagne rien
  et coûte du CPU. `/api/health` reste donc en clair, ce qui est correct.
- **gzip seulement**, pas brotli. Brotli compresserait ~20 % mieux mais son coût
  CPU par requête est bien plus élevé, et le serveur cible est un petit Droplet.
  Le gain marginal ne le justifie pas.
- **Asynchrone** (`zlib.gzip` promisifié) : gzipper 879 Ko en synchrone bloquerait
  la boucle d'événements pendant des dizaines de millisecondes.
- `Vary: Accept-Encoding` **obligatoire** : sans lui, un cache intermédiaire peut
  servir une réponse gzippée à un client qui ne l'accepte pas.
- `gzip;q=0` est un **refus** explicite : traité comme tel, pas comme une
  acceptation parce que la chaîne contient « gzip ».
- Jamais de double encodage : si un `content-encoding` est déjà posé, on ne
  touche à rien.
- HEAD : aucun corps à compresser.

## Invariants respectés

- **Aucune donnée modifiée** : la compression est un transport. Un test vérifie
  que le corps décompressé est identique à l'original, octet pour octet.
- Un échec de compression n'échoue **pas** la requête : la réponse part en clair
  (journalisé). Une réponse lisible vaut mieux qu'une erreur 500.

## Critères de fin

- `/api/map/stations` France entière : `content-encoding: gzip`, ~127 Ko.
- `/api/health` : aucun `content-encoding` (sous le seuil).
- Client sans `Accept-Encoding: gzip` : réponse en clair, exploitable.
- `gzip;q=0` : réponse en clair.
- Le JSON décompressé est identique au JSON d'origine.
- `Vary: Accept-Encoding` présent dès qu'on compresse.
- TDD sur la décision pure et sur l'aller-retour de compression.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:e2e`,
  `npm run build`, `npm run generate` verts (ticket 035).

## Vérifié sur le serveur bâti

`node .output/server/index.mjs`, base de développement (9 604 stations) :

| Cas | Résultat |
|---|---|
| `/api/map/stations` France, `Accept-Encoding: gzip` | **879 Ko → 127 Ko** (×6,9), `vary: accept-encoding`, `content-type: application/json; charset=utf-8` |
| Décompressé vs réponse en clair | **identique — 900 304 octets exactement** (`Buffer.compare === 0`) |
| `/api/stations` Paris rayon 10 km | 82 Ko → **11,5 Ko** (×7) |
| `/api/health` (151 octets) | aucun `content-encoding` — sous le seuil, correct |
| `Accept-Encoding: identity` | 900 304 octets en clair, JSON directement lisible |
| `Accept-Encoding: gzip;q=0` | refus honoré, réponse en clair |
| Emprise inversée (400) | corps d'erreur toujours lisible |

L'égalité octet pour octet est la vérification qui compte : la compression est un
transport, elle ne doit rien changer aux données.

## Portée réelle

Le gain profite à **toute** l'API, pas seulement à la carte : `/api/stations`
passe de 82 Ko à 11,5 Ko, ce qui allège aussi le parcours existant (liste +
recommandation) sur mobile.
