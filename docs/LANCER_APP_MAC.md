# Lancer et verifier l'app desktop Mac

Cette page sert uniquement a lancer la vraie fenetre native macOS, sans passer par la selection iPhone dans Xcode.

## Commande simple

```bash
cd /Users/davyokemba/Documents/kompta
bash scripts/run-mac-native.sh
```

## Commande manuelle equivalente

```bash
cd /Users/davyokemba/Documents/kompta
xcodebuild -project kompta-apple/Kompta.xcodeproj -scheme KomptaMac -destination 'platform=macOS' -configuration Debug build
open "$(xcodebuild -project kompta-apple/Kompta.xcodeproj -scheme KomptaMac -destination 'platform=macOS' -configuration Debug -showBuildSettings 2>/dev/null | awk -F'= ' '/BUILT_PRODUCTS_DIR =/ { print $2; exit }')/KOMPTA.app"
```

## Ce que la commande fait

1. Build la cible `KomptaMac` pour `macOS`.
2. Trouve automatiquement `KOMPTA.app` dans DerivedData.
3. Ouvre la vraie fenetre desktop Mac.

