# ADR-0004 : Historique local et tendance (D4)

- **Date** : 2026-08-03
- **Statut** : Accepté
- **Décision** : L'historique est accumulé localement en SQLite sous forme de
  snapshots quotidiens par `(station_id, carburant, jour)` ; la tendance est
  calculée par un algorithme déterministe (moyenne glissante, médiane,
  variations absolue/relative, pondération par ancienneté) sur les fenêtres
  24 h / 7 j.

## Contexte
Le cahier des charges (§9) exige un historique et une tendance explicable sans
LLM/ML. L'API officielle ne fournit que l'état courant (recherche vérifiée).

## Options considérées
1. Snapshot quotidien local (retenue) : 1 ligne par (station, carburant, jour),
   ~1,8 M lignes/an en France — correct en SQLite, upsert simple.
2. Télécharger les fichiers annuels roulez-eco.fr (259 Mo XML) : historique
   complet mais volume et parsing lourds, hors périmètre MVP.
3. Agrégation horaire : surdimensionnée (les prix bougent quelques fois/jour).

## Conséquences
- Table `price_history` avec upsert quotidien pendant la synchronisation.
- Moins de 2 points de comparaison → tendance « Données insuffisantes », la
  recommandation continue sur les prix locaux courants (recommandation partielle).
- Le score de fraîcheur découle des règles 24 h / 48 h (tranchées au cahier des
  charges).
- Schéma SQLite figé par ce choix → posé avant l'implémentation.
