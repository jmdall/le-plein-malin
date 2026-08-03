# ADR-0003 : Abstraction `FuelPriceProvider` et source officielle

- **Date** : 2026-08-03
- **Statut** : Accepté
- **Décision** : Le domaine métier dépend d'une abstraction
  `FuelPriceProvider.findNearbyStations(query): Promise<StationPrice[]>`,
  implémentée en priorité par le provider Opendatasoft
  (`prix-carburants-quotidien` sur data.economie.gouv.fr), avec repli sur
  l'export JSON complet puis le fichier XML quotidien de donnees.roulez-eco.fr.

## Contexte
Le cahier des charges (§10) impose l'abstraction et une recherche de la source
officielle. La recherche vérifiée (`docs/research/fuel-data-source.md`) montre :
- API v2.1 `prix-carburants-quotidien` : 73 493 enregistrements, état courant
  uniquement, licence `fr-lo`, sans clé API ;
- l'ancien dataset `…-test-ods-copie` n'existe plus (404) ;
- l'historique n'est disponible que via les fichiers roulez-eco.fr.

## Conséquences
- Le domaine ne connaît jamais le format gouvernemental (JSON/CSV/XML) :
  `StationPrice[]` normalisé en entrée du module pur.
- Le job de synchronisation accumule un historique local en SQLite (cf.
  ADR-0004) car l'API ne fournit que l'état courant.
- Repli automatique : Opendatasoft → export complet → roulez-eco.fr → cache.
- Aucun prix inventé : en cas d'échec total, réponse « Données insuffisantes »
  avec erreur explicite.
