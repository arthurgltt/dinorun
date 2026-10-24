# Dino Run

Clone du jeu du dinosaure de Google (Chrome offline), en React Native / Expo SDK 58, compilé en IPA iOS non signée.

## Jouer

- **Toucher l'écran** : démarrer la partie / sauter
- **Éviter les cactus** : petits (9 px de large) et grands (15 px)
- **Game over** : toucher pour rejouer
- Le record est sauvegardé localement (`AsyncStorage`, clé `dino:best`)

## Mécanique

- Boucle `requestAnimationFrame` avec delta-time (indépendante du framerate, clamp à 50 ms)
- Gravité 2400 px/s², impulsion de saut −980 px/s → ~600 px d'apex théorique, 0,82 s de temps de vol
- Vitesse : 340 → 980 px/s (accélération 22 px/s²)
- Apparition des cactus basée sur le **temps** (0,85–1,6 s) et non la distance : reste équitable quand la vitesse augmente
- Hitboxes resserrées (22 %–78 % de la largeur du cactus, 94 % de la hauteur du dino) pour un ressenti juste
- Sprites dessinés en pixel art pur (chaînes de caractères → blocs `View`), aucun asset image dans le rendu du jeu

## Stack

- Expo SDK 58 / React Native
- `react-native-safe-area-context`, `@react-native-async-storage/async-storage`
- Aucune lib d'animation native → build CI rapide (~7 min)

## Build iOS

```bash
builder ios build --unsigned --timeout 1h30m
```

Workflow GitHub Actions : `.github/workflows/ios-build.yml` (runner macOS, configuration **Release**, IPA non signée).
L'IPA est ensuite re-signée et installée via **SideStore** (3 apps max, signature 7 jours).

## Fichiers

- `App.tsx` — tout le jeu (sprites, physique, boucle, UI)
- `assets/icon.png` — icône 1024×1024 générée (dino pixel art)
- `builder.json` — config de build (Release, `com.arthurgltt.dinorun`)
