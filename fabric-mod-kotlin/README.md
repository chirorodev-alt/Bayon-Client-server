# Bayon Client Kotlin

A separate Kotlin/Fabric project for the Bayon Client title-screen UI. The original Java project remains in `fabric-mod/` and is not changed by this project.

## Recommended GUI

The menu uses Minecraft's native Fabric-compatible `Screen`, `GuiGraphicsExtractor`, and `AbstractWidget` APIs. This is the best fit for the custom Bayon title screen: it avoids a GUI library dependency while retaining native keyboard/controller focus and normal Minecraft destinations. Consider Cloth Config only if you later want a conventional settings page.

## Requirements

- Minecraft 26.2
- Fabric Loader 0.19.3 or newer
- Fabric API 0.161.0+26.2
- Fabric Language Kotlin 1.14.2 or newer
- JDK 25

## Build and run

From this directory:

```powershell
.\gradlew.bat build
.\gradlew.bat runClient
```

The mod JAR is created in `build/libs/`. It has its own mod ID (`bayonclientkotlin`) and development run directory so it can be developed independently from the Java project.

## Layout

- `src/client/kotlin/com/bayon/clientkotlin/` contains the Kotlin entrypoint, native menu widgets, title screen, and placeholder screens.
- `src/client/resources/assets/bayonclientkotlin/` contains the copied Bayon background, logo, icon assets, bitmap font, and English translations.
- The title screen routes to vanilla Singleplayer, Multiplayer, and Options screens; profile/store tabs are themed placeholders.

The current Kotlin project is a clean title-screen starter. HUD, cape, and other Java-mod features have not been ported into it.
