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
    const res = await fetch(`/api/stations/${encodeURIComponent(id)}/history?${params.toString()}`)
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

function signLabel(value: number): string {
  if (value > 0) return '+'
  return ''
}

function scoreLabel(score: number): string {
  if (score >= 0.9) return 'élevé'
  if (score >= 0.5) return 'moyen'
  return 'faible'
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

    <form class="history-form" role="search" @submit.prevent="loadHistory">
      <div class="field">
        <label for="hs-id">Identifiant de la station</label>
        <input id="hs-id" v-model="stationId" type="text" inputmode="numeric" placeholder="Ex. : 92230008" autocomplete="off">
      </div>
      <div class="field">
        <label for="hs-fuel">Carburant</label>
        <select id="hs-fuel" v-model="fuel" class="fuel-select">
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

    <section v-if="status === 'success' && indicators" class="indicators" aria-label="Indicateurs de tendance">
      <p class="trend-title" role="status">{{ TREND_LABELS[indicators.trend.direction] }}</p>

      <dl class="indicator-grid">
        <div class="indicator">
          <dt>Prix minimum</dt>
          <dd>{{ formatPrice(indicators.minPrice) }}</dd>
        </div>
        <div class="indicator">
          <dt>Prix moyen</dt>
          <dd>{{ formatPrice(indicators.averagePrice) }}</dd>
        </div>
        <div class="indicator">
          <dt>Prix médian</dt>
          <dd>{{ formatPrice(indicators.medianPrice) }}</dd>
        </div>
        <div class="indicator">
          <dt>Écart à la médiane</dt>
          <dd>{{ signLabel(indicators.deviationFromMedian) }}{{ indicators.deviationFromMedian.toFixed(3).replace('.', ',') }} €/L</dd>
        </div>
        <div class="indicator">
          <dt>Variation 24 h</dt>
          <dd v-if="indicators.change24h !== null">
            {{ signLabel(indicators.change24h) }}{{ indicators.change24h.toFixed(3).replace('.', ',') }} €/L
            <span class="muted">({{ signLabel(indicators.change24hPercent ?? 0) }}{{ formatPercent((indicators.change24hPercent ?? 0) / 100).replace(' %', ' %') }})</span>
          </dd>
          <dd v-else class="muted">indisponible</dd>
        </div>
        <div class="indicator">
          <dt>Variation 7 jours</dt>
          <dd v-if="indicators.change7d !== null">
            {{ signLabel(indicators.change7d) }}{{ indicators.change7d.toFixed(3).replace('.', ',') }} €/L
            <span class="muted">({{ signLabel(indicators.change7dPercent ?? 0) }}{{ formatPercent((indicators.change7dPercent ?? 0) / 100).replace(' %', ' %') }})</span>
          </dd>
          <dd v-else class="muted">indisponible</dd>
        </div>
        <div class="indicator">
          <dt>Score de fraîcheur</dt>
          <dd>{{ scoreLabel(indicators.freshnessScore) }} ({{ Math.round(indicators.freshnessScore * 100) }} %)</dd>
        </div>
      </dl>

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
.history-form {
  display: grid;
  gap: 0.9rem;
  max-width: 34rem;
  margin-bottom: 1.2rem;
}
.field {
  display: grid;
  gap: 0.35rem;
}
.field input,
.fuel-select {
  min-height: 44px;
  padding: 0 0.8rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--surface);
  color: var(--text);
  font-size: 1rem;
}
.field input:focus-visible,
.fuel-select:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.history-error {
  padding: 0.8rem 1rem;
  border: 1px solid #fca5a5;
  border-radius: 0.6rem;
  background: #fef2f2;
  color: #7f1d1d;
}
html.dark .history-error {
  background: #450a0a;
  border-color: #7f1d1d;
  color: #fecaca;
}
.trend-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 0.8rem;
}
.indicator-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: 0.7rem;
  margin: 0;
}
.indicator {
  padding: 0.8rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: 0.6rem;
  background: var(--surface);
}
.indicator dt {
  font-size: 0.85rem;
  color: var(--text-muted);
}
.indicator dd {
  margin: 0.2rem 0 0;
  font-size: 1.05rem;
  font-weight: 600;
}
.muted {
  color: var(--text-muted);
  font-weight: 400;
  font-size: 0.85rem;
}
.history-note {
  margin: 1rem 0 0;
  color: var(--text-muted);
}
</style>
