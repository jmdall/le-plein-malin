---
id: 009
titre: API REST Nitro (stations, recommendation, détail, historique, health)
statut: ready-for-agent
dependances:
  - "003"
  - "004"
  - "005"
  - "006"
  - "007"
priorite: P1
estimation: L
---

# 009 — API REST Nitro (validation Zod + orchestration)

**Ce que ça livre :** l'API REST §8 de la spec : `/api/stations`,
`/api/recommendation`, `/api/stations/:id`, `/api/stations/:id/history`,
`/api/health`. Elle valide toutes les entrées (Zod), résout la géolocalisation
(géocodage ville/CP ou coordonnées), calcule les distances **côté serveur**
(haversine de 003, D3), choisit la station de référence et injecte les km dans
`FuelRecommendationInput`. **Aucune règle métier n'est testée à travers l'API**
— uniquement validation + orchestration (spec §10.4). La position précise n'est
ni persistée ni loggée (LOC-4, NFR-SEC-4).

**Bloqué par :** 003 (haversine), 004 (recommandation), 005 (tendance), 006
(schéma), 007 (provider).

**Statut :** ready-for-agent

- [ ] Toutes les routes valident les entrées avec Zod : `lat`/`lon` bornés,
      rayon ∈ {5, 10, 20, 30}, fuel ∈ 6 carburants, `q`/ville/CP, `vehicleProfile`
      (consumption > 0, niveau ≤ capacité) ; erreur structurée
      `{ error: { code, message } }` sur validation (spec §8).
- [ ] `GET /api/stations` → `{ stations: StationPrice[], referenceStation,
      query: {center, radius, fuel} }` ; le serveur calcule les distances
      (haversine 003) et choisit la station de référence (la plus proche, ou la
      plus proche du centre en mode ville/CP — ADR-0002/D2).
- [ ] `GET /api/recommendation` → `{ recommendation: FuelRecommendation }` :
      orchestration pure — distances pré-calculées injectées, appel à
      `calculateFuelRecommendation` (004), pas de recalcul de règles dans
      l'API.
- [ ] `GET /api/stations/:id` → `{ station, prices: Price[] }`.
- [ ] `GET /api/stations/:id/history?fuel=` → `{ indicators: TrendIndicators }`
      via `domain/trend` (005) sur l'historique de 008.
- [ ] `GET /api/health` → `{ status: "ok", lastSync }`.
- [ ] Repli data : quand la source est indisponible, l'API renvoie le cache
      marqué « données en cache (date) » ou `insufficient-data` avec erreur
      explicite — jamais de prix inventé (NFR-SEC-5, §13 #17/#18).
- [ ] Mode ville/CP : géocodage du centroïde, hypothèse « détour en ligne
      droite A/R relatif à la station la plus proche » visible dans
      `assumptions` (spec §4, §16 → #16).
- [ ] Tests d'intégration légers : validation Zod (400 sur mauvais rayon/fuel/
      conso), orchestration (bon type de retour, station de référence correcte),
      health-check — **sans** re-tester les règles métier (déjà couvertes en
      004/005).
- [ ] `npm run lint && npm run typecheck && npm run test` passe.

**Scénarios de test liés :** #12 (conso invalide → 400 Zod), #13 (station de
référence la plus proche, départage déterministe), #16 (mode sans géoloc), #17
(échec source → repli), #18 (données en cache).
