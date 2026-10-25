# Bayon Client Fabric mod

Bayon Client is a client-only Fabric mod for Minecraft Java Edition **26.2**. It replaces the vanilla title screen with a responsive Bayon menu, while keeping the normal Singleplayer, Multiplayer, and Options screens reachable. It also includes the existing configurable HUD and cosmetic controls.

## Project structure

```text
fabric-mod/
├── build.gradle
├── gradle.properties
├── settings.gradle
└── src/
    ├── main/resources/fabric.mod.json
    └── client/
        ├── java/com/bayon/client/
        │   ├── BayonClient.java
        │   ├── config/                 # Bayon title and HUD settings
        │   ├── hud/                    # Title screen, HUD, and feature screens
        │   ├── mixin/                  # Client loading-logo replacement
        │   ├── cape/                   # Existing client cape renderer
        │   └── ui/                     # Theme, buttons, animations, and rendering
        └── resources/
            ├── bayonclient.client.mixins.json
            └── assets/bayonclient/
                ├── lang/en_us.json
                └── textures/gui/       # Bayon artwork and icons
```

## Build and run

Requirements: **JDK 25**, Windows PowerShell or Command Prompt (or a POSIX shell), and internet access for the initial Gradle dependency download.

From this directory, run the development client:

```powershell
.\gradlew.bat runClient
```

On macOS/Linux:

```sh
./gradlew runClient
```

Build the distributable mod:

```powershell
.\gradlew.bat build
```

The built JAR is written to `build/libs/`. To prepare the launcher's install bundle and version manifest, run `.\gradlew.bat prepareLauncherBundle`; the output is `dist/bayonclient.jar` and `dist/bayonclient.json`.

## Menu and settings

- The Bayon menu uses the generated `background.png`, your Bayon logo, and enlarged original line-art UI icons. The same logo replaces Mojang Studios on Minecraft's startup progress screen. The `nightfall` alternate background is selectable in config.
- The title screen uses a full-bleed Bayon landscape, centered logo, stacked Singleplayer, Multiplayer, Partner Server, Cosmetic, and Quit Game actions, plus a compact profile and Mods, Options, Resource Packs, minimize, and close controls at the top-right. Quit and close show a confirmation screen; minimize uses GLFW.
- Partner Server loads the live directory from `https://bayon-backend.onrender.com/api/servers` and connects to a selected online entry. Cosmetic and profile open themed screens.
- Standard Minecraft widget focus keeps mouse, keyboard, and gamepad navigation available.
- The menu uses square-cornered, translucent glass panels, a custom pixel bitmap font, full-resolution Bayon icons, and a black, white, and gray control palette. The startup progress screen uses the Bayon landscape and displays the full-color Bayon logo; the game window title is `Bayon Client 26.2`.
- Bayon title settings are stored at `config/bayonclient.json`:

```json
{
  "customTitleScreen": true,
  "animations": true,
  "background": "bayon"
}
```

`background` accepts `bayon` or `nightfall`. The file is generated on first launch; edit it while Minecraft is closed. HUD settings remain in `config/bayonclient-hud.json`.

## Artwork and icon assets

The menu icons and backgrounds are original Bayon artwork; the logo files use the Bayon logo supplied by the user:

| Path | Size | Use |
| --- | ---: | --- |
| `textures/gui/background.png` | 1920 × 1080 | Main fantasy sunset background |
| `textures/gui/background_nightfall.png` | 1920 × 1080 | Alternate night background |
| `textures/gui/logo.png` | 768 × 768 | Center title-screen branding |
| `textures/gui/icons/{play,globe,door,user,minimize,close,options,shirt,bag,crown}.png` | 64 × 64 each | Main actions, window controls, and bottom navigation |
| `font/bayon_pixel.json` + `textures/font/bayon_pixel.png` | 128 × 48 glyph atlas | Original 5 × 7 pixel glyphs in 8 × 8 cells |

The generated PNGs are committed under `src/client/resources/assets/bayonclient/textures/gui/`; no extra image downloads are required.

## Extending the UI

- Add screens under `com.bayon.client.hud` and use `BayonPlaceholderScreen` as the themed starting point.
- Add colors, corner radii, and UI sizing constants to `BayonTheme`; its GUI controls use a 15-pixel corner radius. `ThemeManager` continues to manage the existing HUD appearance themes.
- Add icon PNGs under `textures/gui/icons/`, then reference their resource name from `BayonButton` or `BayonTabButton`.
- Add user-facing text to `assets/bayonclient/lang/en_us.json` and use translation components for new controls.
- Add cosmetic entries/screens alongside the existing wardrobe and cosmetic placeholder destinations.

## Existing HUD and launcher integration

Press **Right Shift** in-game to open the Bayon customization screen. The compact Modules page groups HUD widgets by category and provides per-module enable switches, configurable toggle keys, and scale settings. While setting a module key, press a keyboard key to assign it, or press **Escape**/**Backspace** to clear it. The HUD includes FPS, a keycap-style WASD/Space/mouse display, CPS, coordinates, ping, direction, armor, and potion effects. The HUD editor also manages widget layout, themes, background colors, and the bundled cape.

The launcher installs this mod only into the selected Bayon profile. A skin assigned to an offline account is copied into that profile's `config/bayonclient/` folder when the game launches and replaces the local player's skin in that client. Both standard 64 × 64 and legacy 64 × 32 PNG skins are supported. The skin is client-side only; other players will see it only if their server or client has separate skin-sharing support. Microsoft-account launches do not apply an offline profile skin.

Build the launcher bundle with `npm run build:fabric-mod` from the repository root.
