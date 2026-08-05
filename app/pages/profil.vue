<script setup lang="ts">
// pages/profil.vue — Profil véhicule (ticket 013, spec §5.4 VEH-1/VEH-2/VEH-3,
// VEH-4). Formulaire : consommation L/100 km, capacité, niveau actuel,
// carburant, quantité souhaitée (optionnelle), seuil minimal d'économie (€).
// Chargé depuis GET /api/vehicle-profile au montage, sauvegardé via PUT.
// Un profil absent/partiel ne bloque jamais l'usage (le serveur applique des
// valeurs par défaut, VEH-4). Aucun compte utilisateur.
import { onMounted, ref } from 'vue'
import { useHead } from '#imports'
import { FUEL_OPTIONS, DEFAULT_FUEL, type FuelValue } from '../utils/fuel'
import { apiUrl } from '../utils/api'
import type { VehicleProfilePayload } from '../utils/recommendation'

useHead({ title: 'Profil véhicule — Je fais le plein ou non ?' })

interface ProfileForm {
  consumption: string
  tankCapacity: string
  currentLevel: string
  fuel: FuelValue
  preferredQuantity: string
  savingsThreshold: string
}

const form = ref<ProfileForm>({
  consumption: '6',
  tankCapacity: '60',
  currentLevel: '30',
  fuel: DEFAULT_FUEL,
  preferredQuantity: '',
  savingsThreshold: '1'
})

const status = ref<'loading' | 'idle' | 'saving' | 'saved' | 'error'>('loading')
const errorMessage = ref<string | null>(null)
const fieldErrors = ref<Record<string, string>>({})

async function loadProfile() {
  status.value = 'loading'
  errorMessage.value = null
  try {
    const res = await fetch(apiUrl('/api/vehicle-profile'))
    if (!res.ok) throw new Error('Impossible de charger le profil.')
    const body = (await res.json()) as { profile: VehicleProfilePayload }
    form.value = {
      consumption: String(body.profile.consumption),
      tankCapacity: String(body.profile.tankCapacity),
      currentLevel: String(body.profile.currentLevel),
      fuel: body.profile.fuel,
      preferredQuantity: body.profile.preferredQuantity === null ? '' : String(body.profile.preferredQuantity),
      savingsThreshold: String(body.profile.savingsThreshold)
    }
    status.value = 'idle'
  } catch (error) {
    status.value = 'error'
    errorMessage.value = error instanceof Error ? error.message : 'Erreur inconnue.'
  }
}

onMounted(() => {
  void loadProfile()
})

function parseNumber(raw: string | number): number | null {
  // v-model sur <input type="number"> convertit la valeur en nombre au
  // runtime (même si le ref est typé string) — normaliser les deux.
  const s = typeof raw === 'number' ? String(raw) : raw
  const normalized = s.trim().replace(',', '.')
  if (normalized === '') return null
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

function validate(): boolean {
  fieldErrors.value = {}
  const consumption = parseNumber(form.value.consumption)
  const tankCapacity = parseNumber(form.value.tankCapacity)
  const currentLevel = parseNumber(form.value.currentLevel)
  const preferredQuantity = parseNumber(form.value.preferredQuantity)
  const savingsThreshold = parseNumber(form.value.savingsThreshold)

  if (consumption === null || consumption <= 0) {
    fieldErrors.value.consumption = 'La consommation doit être un nombre strictement positif.'
  }
  if (tankCapacity === null || tankCapacity <= 0) {
    fieldErrors.value.tankCapacity = 'La capacité doit être un nombre strictement positif.'
  }
  if (currentLevel === null || currentLevel < 0) {
    fieldErrors.value.currentLevel = 'Le niveau doit être un nombre ≥ 0.'
  } else if (tankCapacity !== null && currentLevel > tankCapacity) {
    fieldErrors.value.currentLevel = 'Le niveau ne peut pas dépasser la capacité du réservoir.'
  }
  if (preferredQuantity !== null && preferredQuantity < 0) {
    fieldErrors.value.preferredQuantity = 'La quantité souhaitée doit être ≥ 0.'
  }
  if (savingsThreshold === null || savingsThreshold < 0) {
    fieldErrors.value.savingsThreshold = 'Le seuil doit être un nombre ≥ 0.'
  }

  return Object.keys(fieldErrors.value).length === 0
}

async function save() {
  if (!validate()) return
  status.value = 'saving'
  errorMessage.value = null
  const payload: VehicleProfilePayload = {
    consumption: parseNumber(form.value.consumption)!,
    tankCapacity: parseNumber(form.value.tankCapacity)!,
    currentLevel: parseNumber(form.value.currentLevel)!,
    fuel: form.value.fuel,
    preferredQuantity: parseNumber(form.value.preferredQuantity),
    savingsThreshold: parseNumber(form.value.savingsThreshold) ?? 1
  }
  try {
    const res = await fetch(apiUrl('/api/vehicle-profile'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
      throw new Error(body?.error?.message ?? 'Le serveur a refusé le profil.')
    }
    status.value = 'saved'
    setTimeout(() => {
      if (status.value === 'saved') status.value = 'idle'
    }, 3000)
  } catch (error) {
    status.value = 'error'
    errorMessage.value = error instanceof Error ? error.message : 'Erreur inconnue.'
  }
}
</script>

<template>
  <main id="main" class="page">
    <h1 class="page-title">Profil du véhicule</h1>
    <p class="page-tagline">
      Ces informations restent sur votre appareil et permettent d’affiner la
      recommandation (économie nette et quantité conseillée). Rien n’est
      obligatoire : sans profil, des valeurs par défaut sont utilisées.
    </p>

    <p v-if="status === 'loading'" role="status">Chargement du profil…</p>

    <p v-else-if="status === 'error' && !form" class="form-error" role="alert">
      {{ errorMessage }}
    </p>

    <form v-else class="profile-form" novalidate @submit.prevent="save">
      <section class="card form-section">
        <h2 class="section-title">Véhicule</h2>

        <div class="field">
          <label for="pf-consumption" class="field-label">Consommation</label>
          <div class="field-input-group">
            <input id="pf-consumption" v-model="form.consumption" class="field-input" type="number" inputmode="decimal" step="0.1" min="0.1" max="50" required>
            <span class="field-unit" aria-hidden="true">L/100 km</span>
          </div>
          <p class="field-hint">Utilisée pour calculer le coût du détour vers une station candidate.</p>
          <p v-if="fieldErrors.consumption" class="field-error" role="alert">{{ fieldErrors.consumption }}</p>
        </div>

        <div class="field">
          <span id="pf-fuel-label" class="field-label">Carburant préféré</span>
          <div class="fuel-options" role="radiogroup" aria-labelledby="pf-fuel-label">
            <label
              v-for="option in FUEL_OPTIONS"
              :key="option.value"
              class="fuel-option"
              :class="{ 'fuel-option-active': form.fuel === option.value }"
            >
              <input v-model="form.fuel" type="radio" name="pf-fuel" :value="option.value" class="fuel-option-input">
              <span>{{ option.label }}</span>
            </label>
          </div>
          <p class="field-hint">Filtre les stations candidates proposées dans la recommandation.</p>
        </div>
      </section>

      <section class="card form-section">
        <h2 class="section-title">Réservoir</h2>

        <div class="field">
          <label for="pf-capacity" class="field-label">Capacité du réservoir</label>
          <div class="field-input-group">
            <input id="pf-capacity" v-model="form.tankCapacity" class="field-input" type="number" inputmode="decimal" step="1" min="1" max="1000" required>
            <span class="field-unit" aria-hidden="true">L</span>
          </div>
          <p v-if="fieldErrors.tankCapacity" class="field-error" role="alert">{{ fieldErrors.tankCapacity }}</p>
        </div>

        <div class="field">
          <label for="pf-level" class="field-label">Niveau actuel du réservoir</label>
          <div class="field-input-group">
            <input id="pf-level" v-model="form.currentLevel" class="field-input" type="number" inputmode="decimal" step="1" min="0" required>
            <span class="field-unit" aria-hidden="true">L</span>
          </div>
          <p class="field-hint">Permet d’estimer la quantité restante à acheter pour le plein.</p>
          <p v-if="fieldErrors.currentLevel" class="field-error" role="alert">{{ fieldErrors.currentLevel }}</p>
        </div>
      </section>

      <section class="card form-section">
        <h2 class="section-title">Préférences de recommandation</h2>

        <div class="field">
          <label for="pf-quantity" class="field-label">Quantité souhaitée (optionnelle)</label>
          <div class="field-input-group">
            <input id="pf-quantity" v-model="form.preferredQuantity" class="field-input" type="number" inputmode="decimal" step="1" min="0" placeholder="Ex. : 30">
            <span class="field-unit" aria-hidden="true">L</span>
          </div>
          <p class="field-hint">Remplace le calcul automatique de l’économie brute si vous visez une quantité précise.</p>
          <p v-if="fieldErrors.preferredQuantity" class="field-error" role="alert">{{ fieldErrors.preferredQuantity }}</p>
        </div>

        <div class="field">
          <label for="pf-threshold" class="field-label">Seuil de rentabilité</label>
          <div class="field-input-group">
            <input id="pf-threshold" v-model="form.savingsThreshold" class="field-input" type="number" inputmode="decimal" step="0.5" min="0" required>
            <span class="field-unit" aria-hidden="true">€</span>
          </div>
          <p class="field-hint">En dessous de ce gain net, un détour n’est pas recommandé (par défaut : 1 €).</p>
          <p v-if="fieldErrors.savingsThreshold" class="field-error" role="alert">{{ fieldErrors.savingsThreshold }}</p>
        </div>
      </section>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary" :disabled="status === 'saving'">
          {{ status === 'saving' ? 'Enregistrement…' : 'Enregistrer le profil' }}
        </button>
        <p v-if="status === 'saved'" class="form-success" role="status">Profil enregistré ✓</p>
        <p v-if="status === 'error'" class="form-error" role="alert">{{ errorMessage }}</p>
      </div>
    </form>
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
.profile-form {
  display: grid;
  gap: 1rem;
}
.form-section {
  display: grid;
  gap: 1rem;
}
.section-title {
  margin: 0;
  font-size: 1.05rem;
}
.field {
  display: grid;
  gap: 0.35rem;
}
.field-label {
  font-weight: 600;
}
.field-input-group {
  position: relative;
  display: flex;
  align-items: center;
}
.field-input {
  width: 100%;
  min-height: 44px;
  padding: 0 4.5rem 0 0.8rem;
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
.field-unit {
  position: absolute;
  right: 0.9rem;
  color: var(--text-500);
  font-size: 0.85rem;
  font-weight: 600;
  pointer-events: none;
  white-space: nowrap;
}
.field-hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.field-error {
  margin: 0;
  color: var(--negative);
  font-size: 0.9rem;
}
.fuel-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.fuel-option {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 1rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--r-pill);
  background: var(--surface);
  color: var(--text-900);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}
.fuel-option-input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.fuel-option-active {
  background: var(--accent);
  color: var(--accent-contrast);
  border-color: transparent;
}
.form-actions {
  display: grid;
  gap: 0.5rem;
  justify-items: start;
}
.form-success {
  margin: 0;
  color: var(--positive);
  font-weight: 600;
}
.form-error {
  margin: 0;
  padding: 0.8rem 1rem;
  border-radius: var(--r-md);
  background: var(--terracotta-bg);
  color: var(--terracotta-strong);
}
</style>
