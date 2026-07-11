# Lancer et verifier l'app iOS mobile

Cette page sert uniquement a lancer la vraie app native iOS dans l'iPhone Simulator, sans selectionner la mauvaise cible dans Xcode.

## Commande simple

```bash
cd /Users/davyokemba/Documents/kompta
bash scripts/run-ios-native.sh
```

## Si tu veux choisir un simulateur precis

Liste les iPhone disponibles :

```bash
xcrun simctl list devices available
```

Puis lance avec l'UUID du simulateur :

```bash
cd /Users/davyokemba/Documents/kompta
bash scripts/run-ios-native.sh UUID_DU_SIMULATEUR
```

## Ce que la commande fait

1. Build la cible `Kompta` pour `iOS Simulator`.
2. Trouve automatiquement `KOMPTA.app` dans DerivedData.
3. Demarre un simulateur iPhone.
4. Installe l'app.
5. Lance `com.adansonia.kompta`.

