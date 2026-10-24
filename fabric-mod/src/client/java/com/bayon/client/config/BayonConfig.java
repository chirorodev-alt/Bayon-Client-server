package com.bayon.client.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/** Settings for the Bayon title screen, stored separately from HUD layout settings. */
public final class BayonConfig {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("bayonclient.json");
    private static Data data = new Data();

    private BayonConfig() {}

    public static synchronized void load() {
        if (!Files.exists(FILE)) {
            data = new Data();
            save();
            return;
        }

        try {
            Data loaded = GSON.fromJson(Files.readString(FILE), Data.class);
            data = loaded == null ? new Data() : loaded;
            if (!"bayon".equals(data.background) && !"nightfall".equals(data.background)) {
                data.background = "bayon";
            }
        } catch (IOException | RuntimeException exception) {
            System.err.println("[Bayon Client] Could not load config; using defaults: " + exception.getMessage());
            data = new Data();
        }
    }

    public static synchronized void save() {
        try {
            Files.createDirectories(FILE.getParent());
            Files.writeString(FILE, GSON.toJson(data));
        } catch (IOException exception) {
            System.err.println("[Bayon Client] Could not save config: " + exception.getMessage());
        }
    }

    public static synchronized boolean customTitleScreenEnabled() {
        return data.customTitleScreen;
    }

    public static synchronized void setCustomTitleScreenEnabled(boolean enabled) {
        data.customTitleScreen = enabled;
        save();
    }

    public static synchronized boolean animationsEnabled() {
        return data.animations;
    }

    public static synchronized void setAnimationsEnabled(boolean enabled) {
        data.animations = enabled;
        save();
    }

    public static synchronized String background() {
        return data.background;
    }

    public static synchronized void setBackground(String background) {
        data.background = "nightfall".equals(background) ? "nightfall" : "bayon";
        save();
    }

    private static final class Data {
        private boolean customTitleScreen = true;
        private boolean animations = true;
        private String background = "bayon";
    }
}
