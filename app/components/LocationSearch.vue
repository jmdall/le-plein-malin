<script setup lang="ts">
// LocationSearch — Grande pilule de recherche flottant sur la carte (ticket
// 010, LOC-2 ; écran carte plein viewport, docs/design/ui-reference.md §1 :
// pilule blanche, ombre --shadow-md, icône loupe à gauche). Le formulaire
// déclenche une recherche sans géolocalisation ; la ville/CP est mémorisée
// localement côté page.
//
// Ticket 025 : suggestions de villes/adresses à la frappe (api-adresse de
// data.gouv.fr, docs/research/pouvoirachatplus-carte.md §5-6). Seul le texte
// saisi part vers le BAN — jamais la position de l'utilisateur (LOC-4) ; le
// centroïde renvoyé POUR une suggestion choisie est en revanche conservé et
// transmis à la page (ticket 031). Débounce 250 ms,
// min 3 caractères, AbortController (une seule requête en vol, la plus
// récente gagne), rôle listbox/option, navigation clavier, fermeture au clic
// extérieur. Les suggestions sont un AMÉLIORATION PROGRESSIVE : sans JS, le
// formulaire continue de fonctionner (submit → @search).
//
// Ticket 031 : @search transmet désormais une LocationSelection (texte +
// centre choisi) et non plus une simple chaîne. Une suggestion choisie porte
// son centroïde BAN, ce qui évite un second géocodage serveur sur un autre
// fournisseur. Un submit texte libre émet `position: null` — parcours
// inchangé.
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  buildAutocompleteUrl,
  buildLocationSelection,
  parseAutocompleteResponse
} from '../utils/autocomplete'
import type { AutocompleteSuggestion, LocationSelection } from '../utils/autocomplete'

defineProps<{
  placeholder?: string
}>()

const emit = defineEmits<{
  search: [selection: LocationSelection]
}>()

const value = ref('')
const suggestions = ref<AutocompleteSuggestion[]>([])
const selectedIndex = ref(-1)
const open = ref(false)

const listEl = ref<HTMLElement | null>(null)
const rootEl = ref<HTMLElement | null>(null)

// ——— Debounce + annulation (une seule requête en vol à la fois) ———
const DEBOUNCE_MS = 250
const MIN_CHARS = 3
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let controller: AbortController | null = null

watch(value, (newValue) => {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  const raw = newValue.trim()
  if (raw.length < MIN_CHARS) {
    closeSuggestions()
    return
  }
  debounceTimer = setTimeout(() => {
    void fetchSuggestions(raw)
  }, DEBOUNCE_MS)
})

async function fetchSuggestions(query: string) {
  controller?.abort()
  controller = new AbortController()
  try {
    const response = await fetch(buildAutocompleteUrl(query), {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    })
    if (!response.ok) {
      throw new Error(`api-adresse : HTTP ${response.status}`)
    }
    const parsed = parseAutocompleteResponse(await response.json(), query)
    // La requête la plus récente gagne : une réponse obsolète arrivée après
    // une nouvelle frappe doit être ignorée.
    if (controller.signal.aborted) return
    suggestions.value = parsed
    selectedIndex.value = parsed.length > 0 ? 0 : -1
    open.value = parsed.length > 0
  } catch {
    // Réseau indisponible / réponse invalide : on referme la liste sans
    // inventer de donnée — la recherche par submit continue de fonctionner.
    if (!controller.signal.aborted) {
      suggestions.value = []
      open.value = false
    }
  }
}

// ——— Navigation clavier (listbox) ———
function onKeydown(event: KeyboardEvent) {
  if (!open.value || suggestions.value.length === 0) {
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    selectedIndex.value = (selectedIndex.value + 1) % suggestions.value.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    selectedIndex.value =
      (selectedIndex.value - 1 + suggestions.value.length) % suggestions.value.length
  } else if (event.key === 'Enter') {
    if (selectedIndex.value >= 0 && selectedIndex.value < suggestions.value.length) {
      event.preventDefault()
      selectSuggestion(selectedIndex.value)
    }
  } else if (event.key === 'Escape') {
    event.preventDefault()
    closeSuggestions()
  }
}

// ——— Fermeture au clic extérieur : on écoute le document en capture ; un
// clic en dehors du composant (champ + liste) referme la liste. ———
function onDocumentPointerDown(event: MouseEvent) {
  if (rootEl.value && !rootEl.value.contains(event.target as Node)) {
    closeSuggestions()
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  controller?.abort()
})

// ——— Sélection ———
// Après sélection, le champ est vidé et la liste fermée (ticket 025). La
// recherche part avec le centre exact de la suggestion quand le BAN l'a fourni
// (ticket 031), et avec le texte robuste dans tous les cas.
function selectSuggestion(index: number) {
  const suggestion = suggestions.value[index]
  if (!suggestion) return
  const selection = buildLocationSelection(suggestion, value.value)
  value.value = ''
  closeSuggestions()
  emit('search', selection)
}

function closeSuggestions() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  controller?.abort()
  open.value = false
  suggestions.value = []
  selectedIndex.value = -1
}

// Submit texte libre : aucune suggestion choisie, donc aucun centre connu —
// c'est le serveur qui géocode (position: null).
function submit() {
  const query = value.value.trim()
  if (query.length === 0) {
    return
  }
  closeSuggestions()
  emit('search', { query, position: null })
}

const listId = 'location-autocomplete'
const inputId = 'location-input'

watch(selectedIndex, async (index) => {
  if (!listEl.value || index < 0) return
  await nextTick()
  const option = listEl.value.querySelector<HTMLElement>(`[data-index="${index}"]`)
  option?.scrollIntoView({ block: 'nearest' })
})
</script>

<template>
  <div ref="rootEl" class="location-search">
    <form class="location-form" role="search" aria-label="Recherche par ville ou code postal" @submit.prevent="submit">
      <span class="location-icon" aria-hidden="true">🔍</span>
      <label class="sr-only" for="location-input">Ville, adresse ou code postal</label>
      <input
        :id="inputId"
        v-model="value"
        class="location-input"
        type="text"
        inputmode="text"
        autocomplete="off"
        :placeholder="placeholder ?? 'Rechercher une ville, une adresse…'"
        role="combobox"
        :aria-expanded="open"
        aria-autocomplete="list"
        :aria-controls="open ? listId : undefined"
        :aria-activedescendant="open && selectedIndex >= 0 ? `${listId}-option-${selectedIndex}` : undefined"
        @keydown="onKeydown"
      >
      <button type="submit" class="location-submit">Rechercher</button>
    </form>

    <ul
      v-if="open && suggestions.length > 0"
      :id="listId"
      ref="listEl"
      class="autocomplete-list"
      role="listbox"
      aria-label="Suggestions de villes et d’adresses"
    >
      <li
        v-for="(suggestion, index) in suggestions"
        :id="`${listId}-option-${index}`"
        :key="`${suggestion.label}-${index}`"
        :data-index="index"
        class="autocomplete-option"
        role="option"
        :aria-selected="index === selectedIndex"
        :class="{ 'autocomplete-option-active': index === selectedIndex }"
        @pointerdown.prevent="selectSuggestion(index)"
      >
        <span class="autocomplete-option-label">{{ suggestion.label }}</span>
        <span v-if="suggestion.context" class="autocomplete-option-context">{{ suggestion.context }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.location-search {
  position: relative;
}
.location-form {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 44px;
  padding: 0 0.35rem 0 1rem;
  border-radius: var(--r-pill);
  background: var(--surface);
  box-shadow: var(--shadow-md);
  max-width: 100%;
}
.location-icon {
  flex: none;
  font-size: 1.05rem;
  color: var(--text-500);
  line-height: 1;
}
.location-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 44px;
  border: none;
  background: transparent;
  color: var(--text-900);
  font-family: inherit;
  font-size: 0.95rem;
}
.location-input::placeholder {
  color: var(--text-500);
}
.location-input:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
  border-radius: var(--r-pill);
}
.location-submit {
  flex: none;
  min-height: 44px;
  padding: 0 0.9rem;
  border: none;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--accent);
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.15s;
}
.location-submit:hover {
  background: var(--slate-100);
}

/* Positionnement local de la liste (ticket 025) : la liste elle-même est la
   primitive globale .autocomplete-list (assets/css/main.css §7). */
.autocomplete-list {
  top: calc(100% + 0.35rem);
}
</style>
