<script setup lang="ts">
// pages/historique.vue — Historique / tendance d'une station (ticket 013,
// spec §5.7 TRE-2/3/4, §8 GET /api/stations/:id/history). L'utilisateur
// choisit un identifiant de station et un carburant ; la page affiche les
// indicateurs calculés par le module pur domain/trend (005) : prix min/moyen/
// médian, écart à la médiane, Δ24 h / Δ7 j, tendance et score de fraîcheur.
// La tendance est TOUJOURS formulée en probabiliste (« tendance probable »),
// jamais comme une certitude (REC-4 / TRE-3).
import { ref } from 'vue'
import { useHead } from '#imports'
import { FUEL_OPTIONS, DEFAULT_FUEL, type FuelValue } from '../utils/fuel'
import { formatPrice, formatPercent } from '../utils/format'
import { apiUrl } from '../utils/api'

useHead({ title: 'Historique — Je fais le plein ou non ?' })

interface TrendIndicators {
  minPrice: number
  averagePrice: number
  medianPrice: number
  deviationFromMedian: number
  change24h: number | null
  change24hPercent: number | null
  change7d: number | null
  change7dPercent: number | null
  trend: { direction: 'down' | 'stable' | 'up' | 'insufficient'; magnitude: number }
  freshnessScore: number
}

const stationId = ref('')
const fuel = ref<FuelValue>(DEFAULT_FUEL)
const status = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const indicators = ref<TrendIndicators | null>(null)
const error = ref<string | null>(null)
const searched = ref(false)

const TREND_LABELS: Record<TrendIndicators['trend']['direction'], string> = {
  down: 'Tendance probable : baisse',
  stable: 'Tendance probable : stable',
  up: 'Tendance probable : hausse',
  insufficient: 'Historique insuffisant pour une tendance'
}

// Sémantique du projet : baisse = vert (« moins cher »), hausse = terracotta
// (« plus cher »), stable = neutre chaud. Purement présentationnel : ce
// mapping ne recalcule rien, il ne fait que teindre une valeur déjà fournie
// par le module pur domain/trend (REC-2/D1).
function signDirection(value: number | null): 'down' | 'up' | 'stable' {
  if (value === null || value === 0) return 'stable'
  return value < 0 ? 'down' : 'up'
}

function signLabel(value: number): string {
  if (value > 0) return '+'
  return ''
}

function scoreLabel(score: number): string {
  if (score >= 0.9) return 'élevé'
  if (score >= 0.5) return 'moyen'
  return 'faible'
}

async function loadHistory() {
  const id = stationId.value.trim()
  if (id.length === 0) {
    error.value = 'Saisissez un identifiant de station.'
    status.value = 'error'
    return
  }
  status.value = 'loading'
  error.value = null
  searched.value = true
  try {
    const params = new URLSearchParams({ fuel: fuel.value })
    const res = await fetch(apiUrl(`/api/stations/${encodeURIComponent(id)}/history?${params.toString()}`))
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
      throw new Error(body?.error?.message ?? `Station ${id} introuvable ou sans historique.`)
    }
    const body = (await res.json()) as { indicators: TrendIndicators }
    indicators.value = body.indicators
    status.value = 'success'
  } catch (err) {
    indicators.value = null
    status.value = 'error'
    error.value = err instanceof Error ? err.message : 'Erreur inconnue.'
  }
}
</script>

<template>
  <main id="main" class="page">
    <h1 class="page-title">Historique d’une station</h1>
    <p class="page-tagline">
      Consultez l’évolution locale des prix d’une station et son carburant.
      Une tendance n’est jamais présentée comme une certitude : elle reflète
      les observations récentes.
    </p>

    <form class="card history-form" role="search" @submit.prevent="loadHistory">
      <div class="field">
        <label for="hs-id" class="field-label">Identifiant de la station</label>
        <input id="hs-id" v-model="stationId" class="field-input" type="text" inputmode="numeric" placeholder="Ex. : 92230008" autocomplete="off">
      </div>
      <div class="field">
        <label for="hs-fuel" class="field-label">Carburant</label>
        <select id="hs-fuel" v-model="fuel" class="field-input fuel-select">
          <option v-for="option in FUEL_OPTIONS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>
      <button type="submit" class="btn btn-primary" :disabled="status === 'loading'">
        {{ status === 'loading' ? 'Chargement…' : 'Afficher l’historique' }}
      </button>
    </form>

    <p v-if="status === 'loading'" role="status">Chargement de l’historique…</p>

    <p v-if="status === 'error'" class="history-error" role="alert">{{ error }}</p>

    <div v-if="status === 'idle' && !searched" class="card empty-state">
      <p class="empty-icon" aria-hidden="true">📈</p>
      <p class="empty-text">
        Saisissez l’identifiant d’une station ci-dessus pour consulter
        l’historique de ses prix et sa tendance probable.
      </p>
    </div>

    <section v-if="status === 'success' && indicators" class="card indicators" aria-label="Indicateurs de tendance">
      <p class="trend-title">
        <span
          class="pill trend-pill"
          :class="{
            'pill-accent': indicators.trend.direction === 'down',
            'pill-terracotta': indicators.trend.direction === 'up',
            'pill-muted': indicators.trend.direction === 'stable' || indicators.trend.direction === 'insufficient'
          }"
          role="status"
        >
          {{ TREND_LABELS[indicators.trend.direction] }}
        </span>
      </p>

      <div class="hist-row hist-row-stats">
        <div class="stat">
          <span class="stat-label">Prix minimum</span>
          <span class="stat-value">{{ formatPrice(indicators.minPrice) }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Prix moyen</span>
          <span class="stat-value">{{ formatPrice(indicators.averagePrice) }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Prix médian</span>
          <span class="stat-value">{{ formatPrice(indicators.medianPrice) }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Écart à la médiane</span>
          <span class="stat-value">{{ signLabel(indicators.deviationFromMedian) }}{{ indicators.deviationFromMedian.toFixed(3).replace('.', ',') }} €/L</span>
        </div>
      </div>

      <h2 class="hist-section-title">Variations récentes</h2>

      <div class="hist-row hist-variation">
        <span class="variation-label">Depuis 24 h</span>
        <span v-if="indicators.change24h !== null" class="variation-value" :data-direction="signDirection(indicators.change24h)">
          {{ signLabel(indicators.change24h) }}{{ indicators.change24h.toFixed(3).replace('.', ',') }} €/L
          <span class="muted">({{ signLabel(indicators.change24hPercent ?? 0) }}{{ formatPercent(indicators.change24hPercent ?? 0) }})</span>
        </span>
        <span v-else class="muted">indisponible</span>
      </div>
      <div class="hist-row hist-variation">
        <span class="variation-label">Depuis 7 jours</span>
        <span v-if="indicators.change7d !== null" class="variation-value" :data-direction="signDirection(indicators.change7d)">
          {{ signLabel(indicators.change7d) }}{{ indicators.change7d.toFixed(3).replace('.', ',') }} €/L
          <span class="muted">({{ signLabel(indicators.change7dPercent ?? 0) }}{{ formatPercent(indicators.change7dPercent ?? 0) }})</span>
        </span>
        <span v-else class="muted">indisponible</span>
      </div>

      <div class="hist-row hist-freshness">
        <span class="variation-label">Score de fraîcheur</span>
        <span class="variation-value">{{ scoreLabel(indicators.freshnessScore) }} ({{ Math.round(indicators.freshnessScore * 100) }} %)</span>
      </div>

      <p v-if="indicators.trend.direction === 'insufficient'" class="history-note" role="status">
        L’historique est encore trop court (moins de 2 jours de données
        comparables) : la tendance ne peut pas être calculée. Les prix courants
        restent affichés.
      </p>
      <p v-else class="history-note">
        Selon les données récentes : {{ TREND_LABELS[indicators.trend.direction].toLowerCase() }}.
      </p>
    </section>
  </main>
</template>

<style scoped>
.page {
  max-width: 40rem;
  margin: 0 auto;
  padding: 1.25rem 1rem 2.5rem;
}
.page-title {
  margin: 0 0 0.35rem;
  font-size: 1.5rem;
}
.page-tagline {
  margin: 0 0 1.25rem;
  color: var(--text-muted);
}
.history-form {
  display: grid;
  gap: 0.9rem;
  margin-bottom: 1.25rem;
}
.field {
  display: grid;
  gap: 0.35rem;
}
.field-label {
  font-weight: 600;
}
.field-input {
  min-height: 44px;
  padding: 0 0.8rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  font-size: 1rem;
}
.field-input:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.history-error {
  margin: 0 0 1.25rem;
  padding: 0.8rem 1rem;
  border-radius: var(--r-md);
  background: var(--terracotta-bg);
  color: var(--terracotta-strong);
}
.empty-state {
  display: grid;
  justify-items: center;
  gap: 0.5rem;
  text-align: center;
  padding: 2rem 1.5rem;
}
.empty-icon {
  margin: 0;
  font-size: 2rem;
}
.empty-text {
  margin: 0;
  color: var(--text-muted);
  max-width: 26rem;
}
.indicators {
  display: grid;
  gap: 0.9rem;
}
.trend-title {
  margin: 0;
}
.trend-pill {
  font-size: 0.9rem;
}
.hist-section-title {
  margin: 0.3rem 0 -0.3rem;
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-500);
}
.hist-row {
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
}
.hist-row-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 0.6rem;
  border-top: none;
  padding-top: 0;
}
.stat {
  display: grid;
  gap: 0.15rem;
}
.stat-label {
  font-size: 0.8rem;
  color: var(--text-muted);
}
.stat-value {
  font-size: 1.05rem;
  font-weight: 600;
}
.hist-variation,
.hist-freshness {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}
.variation-label {
  color: var(--text-muted);
}
.variation-value {
  font-weight: 600;
}
.variation-value[data-direction='down'] {
  color: var(--positive);
}
.variation-value[data-direction='up'] {
  color: var(--negative);
}
.variation-value[data-direction='stable'] {
  color: var(--text-700);
}
.muted {
  color: var(--text-muted);
  font-weight: 400;
  font-size: 0.85rem;
}
.history-note {
  margin: 0;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
}
</style>
