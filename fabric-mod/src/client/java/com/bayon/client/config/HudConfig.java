package com.bayon.client.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import com.bayon.client.ui.ThemeManager;

public final class HudConfig {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("bayonclient-hud.json");
    private static final Map<String, Widget> DEFAULTS = Map.of(
            "fps", new Widget(true, 8, 8, 1.0f),
            "keystrokes", new Widget(true, 8, 34, 1.0f),
            "cps", new Widget(true, 8, 105, 1.0f),
            "coordinates", new Widget(true, 8, 128, 1.0f),
            "ping", new Widget(true, 8, 151, 1.0f),
            "direction", new Widget(true, 8, 174, 1.0f),
            "armor", new Widget(true, 8, 197, 1.0f),
            "effects", new Widget(true, 8, 220, 1.0f)
    );
    private static Data data = defaults();

    private HudConfig() {}

    private static Data defaults() {
        Data result = new Data();
        DEFAULTS.forEach((key, value) -> result.widgets.put(key, value.copy()));
        return result;
    }

    public static synchronized void load() {
        try {
            if (Files.exists(FILE)) {
                Data saved = GSON.fromJson(Files.readString(FILE), Data.class);
                if (saved != null && saved.widgets != null) {
                    data = defaults();
                    saved.widgets.forEach((key, value) -> {
                        if (DEFAULTS.containsKey(key) && value != null) data.widgets.put(key, value.clamp());
                    });
                    return;
                }
            }
        } catch (Exception ignored) {
            // A malformed file is replaced with safe defaults below.
        }
        data = defaults();
        save();
    }

    public static synchronized void save() {
        try {
            Files.createDirectories(FILE.getParent());
            Files.writeString(FILE, GSON.toJson(data));
        } catch (IOException exception) {
            System.err.println("[Bayon Client] Could not save HUD config: " + exception.getMessage());
        }
    }

    public static synchronized Widget get(String key) {
        return data.widgets.computeIfAbsent(key, ignored -> new Widget(true, 8, 8, 1.0f));
    }

    public static synchronized Map<String, Widget> widgets() {
        return data.widgets;
    }

    public static synchronized void reset() {
        data = defaults();
        save();
    }

    public static synchronized boolean capeEnabled() {
        return data.capeEnabled;
    }

    public static synchronized void setCapeEnabled(boolean enabled) {
        data.capeEnabled = enabled;
        save();
    }

    public static synchronized int themeIndex() {
        return Math.floorMod(data.theme, ThemeManager.themes().size());
    }

    public static synchronized void setThemeIndex(int index) {
        data.theme = Math.floorMod(index, ThemeManager.themes().size());
        save();
    }

    public static synchronized String themeName() {
        return ThemeManager.current().name();
    }

    public static synchronized void cycleTheme() {
        setThemeIndex(themeIndex() + 1);
    }

    public static synchronized int backgroundIndex() {
        return Math.floorMod(data.background, 3);
    }

    public static synchronized String backgroundName() {
        return switch (backgroundIndex()) {
            case 1 -> "Volcanic glow";
            case 2 -> "Nightfall";
            default -> "Glass dim";
        };
    }

    public static synchronized void cycleBackground() {
        data.background = (backgroundIndex() + 1) % 3;
        save();
    }

    public static synchronized int panelColor() {
        return ThemeManager.withOpacity(ThemeManager.current().panelColor(), ThemeManager.current().uiOpacity());
    }

    public static synchronized int borderColor() {
        return ThemeManager.current().borderColor();
    }

    public static synchronized int accentColor() {
        return ThemeManager.current().accentColor();
    }

    public static synchronized int backgroundColor() {
        return switch (backgroundIndex()) {
            case 1 -> 0xE91C100B;
            case 2 -> 0xE90A0E1A;
            default -> ThemeManager.current().screenBackground();
        };
    }

    private static final class Data {
        private Map<String, Widget> widgets = new LinkedHashMap<>();
        private boolean capeEnabled = true;
        private int theme;
        private int background;
    }

    public static final class Widget {
        public boolean enabled;
        public int x;
        public int y;
        public float scale;

        public Widget(boolean enabled, int x, int y, float scale) {
            this.enabled = enabled;
            this.x = x;
            this.y = y;
            this.scale = scale;
        }

        public Widget copy() {
            return new Widget(enabled, x, y, scale);
        }

        private Widget clamp() {
            x = Math.max(0, Math.min(x, 10000));
            y = Math.max(0, Math.min(y, 10000));
            scale = Math.max(0.5f, Math.min(scale, 2.0f));
            return this;
        }
    }
}
