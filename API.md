# API Grepolis - Farming

Documentation des endpoints et modèles internes utilisés par GrepoFarm.

## Modèles internes (`uw.MM`)

| Collection | Attributs clés |
|---|---|
| `Town` | `id`, `island_id`, `on_small_island` |
| `FarmTown` | `id`, `island_x`, `island_y` |
| `FarmTownPlayerRelation` | `id`, `farm_town_id`, `relation_status` (0=verrouillé, 1=débloqué), `lootable_at`, `expansion_stage`, `expansion_at` |

## Endpoints AJAX (`uw.gpAjax`)

### `frontend_bridge` — Opérations unitaires

```
POST frontend_bridge/execute
body: {
  model_url: "FarmTownPlayerRelation/{relation_id}",
  action_name: "claim" | "unlock" | "upgrade",
  arguments: { farm_town_id, type: "resources" },
  town_id: "{town_id}"
}
```

### `farm_town_overviews` — Mass-farm (nécessite Capitaine)

```
GET  farm_town_overviews/index                                // Fausse ouverture obligatoire
GET  farm_town_overviews/get_farm_towns_for_town              // Villages d'une ville
GET  farm_town_overviews/get_farm_towns_from_multiple_towns   // Villages de plusieurs villes
POST farm_town_overviews/claim_loads_multiple                 // Claim massif en 1 appel
  body: {
    towns: [town_id, ...],
    time_option_base: 300,    // 5min = 300, 10min = 600...
    time_option_booty: 600,
    claim_factor: "normal"    // ou "double" avec premium
  }
```

## Détection du Capitaine

```js
uw.GameDataPremium.isAdvisorActivated('captain')  // → true/false
```

## Post-claim (refresh timers)

```js
uw.WMap.removeFarmTownLootCooldownIconAndRefreshLootTimers()
```

## Anti-détection

- Vérifier `$('.botcheck').length || $('#recaptcha_window').length` avant d'agir
- Délais aléatoires recommandés (10-30s)
- `farm_town_overviews/index` simule une ouverture d'interface normale
