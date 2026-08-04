import { describe, expect, it } from 'vitest'
import { deriveBrandFromAddress } from '../../domain/stations/deriveBrand'

// Dérivation d'enseigne par libellé d'adresse (ticket 017). Module pur : les
// tests n'ont aucun réseau ni dépendance externe. Règles :
//   - reconnaissance déterministe d'une enseigne réelle dans le libellé,
//     la plus spécifique d'abord (TotalEnergies avant Total) ;
//   - capitalisation propre du nom retourné, jamais de MAJUSCULES brutes ;
//   - null sans correspondance → l'appelant garde le nom par défaut (id) ;
//   - aucun nom fantaisiste : seule une enseigne de la liste est retournée.

describe('deriveBrandFromAddress', () => {
  describe('correspondances directes', () => {
    it.each([
      ['CARREFOUR — 12 rue de la gare', 'Carrefour'],
      ['TotalEnergies 55 avenue de la République', 'TotalEnergies'],
      ['INTERMARCHE ROUTE DE LYON', 'Intermarché'],
      ['SUPER U 3 place du marché', 'Super U'],
      ['E.Leclerc chemin des vignes', 'E.Leclerc'],
      ['ESSO Avenue de la Libération', 'Esso'],
      ['SHELL 8 rue des fleurs', 'Shell'],
      ['BP route nationale 7', 'BP']
    ])('« %s » → « %s »', (address, expected) => {
      expect(deriveBrandFromAddress(address, '')).toEqual({ name: expected, brand: expected })
    })

    it('enseigne dans la ville en contexte optionnel (adresse sans marque)', () => {
      expect(deriveBrandFromAddress('12 rue de la gare', 'Auchan')).toEqual({
        name: 'Auchan',
        brand: 'Auchan'
      })
    })

    it('ville sans marque ne crée rien (contexte vide → null)', () => {
      expect(deriveBrandFromAddress('12 rue de la gare', 'Lyon')).toBeNull()
    })
  })

  describe('marque dans le libellé avec séparateurs', () => {
    it.each([
      ['CARREFOUR - 12 rue de la gare', 'Carrefour'],
      ['CARREFOUR—12 RUE DE LA GARE', 'Carrefour'],
      ['CARREFOUR / 12 rue de la gare', 'Carrefour'],
      ['CARREFOUR, 12 rue de la gare', 'Carrefour'],
      ['CARREFOUR. 12 rue de la gare', 'Carrefour'],
      ['12 rue de la gare CARREFOUR', 'Carrefour']
    ])('« %s » → « Carrefour »', (address, expected) => {
      expect(deriveBrandFromAddress(address, '')).toEqual({ name: expected, brand: expected })
    })
  })

  describe('ordre de priorité (plus spécifique d’abord)', () => {
    it('TotalEnergies avant Total', () => {
      expect(deriveBrandFromAddress('TOTALENERGIES 12 rue des lilas', '')).toEqual({
        name: 'TotalEnergies',
        brand: 'TotalEnergies'
      })
    })

    it('Carrefour Market avant Carrefour', () => {
      expect(deriveBrandFromAddress('CARREFOUR MARKET AVENUE VICTOR HUGO', '')).toEqual({
        name: 'Carrefour Market',
        brand: 'Carrefour Market'
      })
    })

    it('Géant Casino avant Casino', () => {
      expect(deriveBrandFromAddress('GEANT CASINO 4 boulevard des champs', '')).toEqual({
        name: 'Géant Casino',
        brand: 'Géant Casino'
      })
    })

    it('Super U avant Système U (libellé ambigu)', () => {
      expect(deriveBrandFromAddress('SUPER U', '')).toEqual({ name: 'Super U', brand: 'Super U' })
    })
  })

  describe('cas sans correspondance → null (nom par défaut)', () => {
    it('adresse sans enseigne connue → null', () => {
      expect(deriveBrandFromAddress('12 rue de la gare', 'Lyon')).toBeNull()
    })

    it('le mot-clé n’est pas en plein milieu d’un mot', () => {
      expect(deriveBrandFromAddress('Rue des Casinots', '')).toBeNull()
    })

    it('false-positive « BP » : mot entier exigé (AV BP 1 → null)', () => {
      expect(deriveBrandFromAddress('AV BP 1', '')).toBeNull()
    })
  })

  describe('cas limite', () => {
    it('adresse vide + city vide → null', () => {
      expect(deriveBrandFromAddress('', '')).toBeNull()
    })

    it('adresse vide mais city porteuse d’enseigne → match sur la ville', () => {
      expect(deriveBrandFromAddress('', 'Avia')).toEqual({ name: 'Avia', brand: 'Avia' })
    })

    it('blancs seulement → null', () => {
      expect(deriveBrandFromAddress('   ', '  ')).toBeNull()
    })

    it('libellé en minuscules sans accents → match insensible à la casse', () => {
      expect(deriveBrandFromAddress('intermarche chemin du port', '')).toEqual({
        name: 'Intermarché',
        brand: 'Intermarché'
      })
    })
  })
})
