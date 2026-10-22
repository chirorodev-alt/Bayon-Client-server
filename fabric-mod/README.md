# Bayon Client Fabric mod

This is a client-only Fabric mod for Minecraft Java Edition **26.2**. Its JAR contains the Bayon main menu, configurable HUD, the pixel-art Bayon cape, and the Fabric API dependency in a nested JAR. The launcher installs it only into the selected Bayon profile.

## Build requirements

- Java 25 or newer
- Windows: PowerShell or Command Prompt; macOS/Linux: a POSIX shell
- Internet access for the first Gradle dependency download

## Build

From this directory, run:

```powershell
.\gradlew.bat build
```

On macOS/Linux:

```sh
./gradlew build
```

The distributable JAR is `build/libs/bayonclient-0.1.0.jar`.

To build the launcher-ready copy and its version manifest, run:

```powershell
.\gradlew.bat prepareLauncherBundle
```

This writes `dist/bayonclient.jar` and `dist/bayonclient.json`. `npm run dist` at the repository root runs this task before packaging the launcher.

## In-game controls and HUD editor

The Bayon title screen replaces the vanilla start menu. Singleplayer, Multiplayer, Options, and Quit use Minecraft's normal screens/actions. Wardrobe opens the cape control, Cosmetic Store lists the included cape, and Store opens the Bayon web store.

Press **Right Shift** to open the Bayon customization screen. Change HUD module visibility, filter modules by category, and use the preview panel. HUD Layout lets you drag a visible widget to move it and scroll over it to resize it. Appearance changes theme and background. The editor key can be rebound from Minecraft's Controls menu under Bayon Client.

The modules are FPS, keystrokes, left/right CPS, coordinates, ping when connected, direction, armor, and potion effects. CPS counts mouse press edges in a rolling one-second window, so holding a button does not add clicks. The Bayon cape uses the included monochrome and gold pixel texture and can be toggled in the editor. HUD settings are stored in `config/bayonclient-hud.json` in the active game's directory.

## Launcher install

1. Build the mod with `npm run build:fabric-mod` from the repository root.
2. Create/select a Fabric profile for Minecraft 26.2.
3. Open the launcher's Mods page and choose **Install Bayon mod**.

Bayon Client stores the mod in `%APPDATA%\\.bayonclient\\profiles\\<profile-id>\\mods` (or the selected custom game-data root). Each profile has its own mods folder. The launcher records the installed filename, version, and SHA-256 hash beside that profile. Updates replace only a Bayon JAR whose hash still matches the launcher's record; unexpected or externally changed files are left intact.

The mod has been compiled for Minecraft 26.2 only. A separate compatible build is required for each other Minecraft version; the launcher prevents installing this build into profiles with another version.
