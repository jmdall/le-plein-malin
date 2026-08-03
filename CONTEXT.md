# CONTEXT — « Je fais le plein ou non ? »

Vocabulaire métier partagé. Source des règles produit : `CAHIER-DES-CHARGES.md`.
Décisions structurantes : `docs/adr/`. Toute modification de ce document doit
être cohérente avec les ADR et la spécification.

## Mission

Aider un automobiliste en France à décider entre :
**faire le plein maintenant**, **mettre seulement X litres**, **attendre**, ou
**aller dans une autre station moins chère** — avec une recommandation
explicable fondée sur les prix officiels, leur fraîcheur, la géographie locale
et le profil du véhicule. Aucun prix n'est inventé.

## Termes métier

### Station candidate
Station-service située dans le rayon de recherche, qui vend le carburant
sélectionné et dont le prix est **récent** (≤ 48 h par défaut). Elle est
éligible pour être proposée en alternative.

### Station de référence
Station dont le prix sert de point de comparaison : celle où l'utilisateur
ferait son plein « par défaut » (la plus proche, ou la station actuellement
fréquentée). Toute autre station candidate est comparée à elle.

### Détour
Distance supplémentaire aller-retour nécessaire pour atteindre une station
candidate au lieu de la station de référence. Ce n'est **pas** la distance
utilisateur → station : c'est l'écart de trajet réel (aller-retour). Si la
candidate est sur le trajet habituel, le détour peut être nul ou négatif.

### Économie brute
`différence de prix par litre × quantité achetée` — le gain théorique si les
deux stations étaient au même endroit.

### Économie nette
`économie brute − coût du détour` — le gain réel après avoir payé le carburant
consommé pendant le détour. C'est la grandeur qui décide.

### Coût du détour
`distance supplémentaire aller-retour × consommation / 100 × prix estimé du
carburant` (le prix estimé est celui de la station candidate).

### Fraîcheur
Âge de la donnée de prix (`maintenant − prix_maj`). Règles :
- ≤ 24 h : donnée fraîche ;
- 24–48 h : potentiellement obsolète (affichage atténué, hors recommandation
  si une alternative fraîche existe) ;
- > 48 h : exclue par défaut des recommandations (toujours visible avec badge).

### Tendance
Direction probable de l'évolution locale des prix (baisse / stable / hausse),
calculée par un **algorithme déterministe** (moyenne glissante, médiane,
variations absolue/relative, pondération par ancienneté). Jamais une certitude :
toujours formulée « tendance probable », « selon les données récentes ».

### Recommandation partielle
Recommandation émise avec une partie des données manquantes (ex. pas de
tendance faute d'historique, mais décision possible sur les prix locaux
actuels). Le niveau de confiance est réduit et les données manquantes sont
affichées explicitement.

### Seuil de rentabilité
`seuil minimal d'économie nette` (€) en dessous duquel un détour n'est pas
recommandé. Défaut : **1 €**. Condition stricte :
`recommandation d'une autre station ⇔ économie nette >= seuil`.

### Niveau de confiance
Degré de fiabilité de la recommandation, dégradé par : données > 24 h,
historique insuffisant, détour approximatif, absence de géolocalisation.

## Grandeurs et formules

```
coût du détour = distance supplémentaire A/R × conso (L/100 km) / 100 × prix candidat
économie brute = (prix réf − prix candidat) × quantité achetée (L)
économie nette = économie brute − coût du détour
recommandation autre station ⇔ économie nette >= seuil (défaut 1 €)
```

## Invariants

- Aucun prix inventé : toute valeur provient du provider officiel ou du cache.
- La logique de recommandation est un module pur : pas de Nuxt, pas de HTTP,
  pas de SQLite, pas de lecture d'environnement.
- Une tendance n'est jamais présentée comme une certitude.
- La position précise n'est jamais journalisée ni conservée sans consentement.

## Sources de vérité

- Cahier des charges : `CAHIER-DES-CHARGES.md`
- Spécification : `docs/specs/spec.md`
- Source de données : `docs/research/fuel-data-source.md`
- Décisions : `docs/adr/`
