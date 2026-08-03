# ADR-0002 : Détour et station de référence sans géolocalisation (D2)

- **Date** : 2026-08-03
- **Statut** : Accepté
- **Décision** : Sans géolocalisation, la station de référence est la station
  la plus proche du centre du rayon de recherche ; le détour d'une candidate est
  `max(0, dist_candidate − dist_ref) × 2` (aller-retour).

## Contexte
Le cahier des charges exige que le détour soit le « détour réel », pas la simple
distance utilisateur → station, et autorise l'utilisation sans géolocalisation
(§6). Sans position exacte, aucun trajet réel n'est connu.

## Options considérées
1. Station de référence = plus proche du centre du rayon + écart × 2 (retenue).
2. Détour = distance totale utilisateur→candidate (trop pessimiste : ignore le
   fait que la candidate peut être sur le trajet).
3. Bloquer la fonctionnalité sans géolocalisation (contredit le §6).

## Conséquences
- Le module pur reçoit des distances pré-calculées (`CandidateWithDistance`),
  la géométrie vit côté serveur (haversine pure dans `domain/fuel-prices`).
- Le « détour = écart × 2 » est une hypothèse affichée à l'utilisateur (le §8
  impose de montrer les hypothèses).
- Réversible côté produit ; structurant pour `FuelRecommendationInput` → posé
  avant la spec et le schéma SQLite.
