package com.bayon.client.ui;

import com.bayon.client.config.HudConfig;

import java.util.List;
import java.util.Optional;

/** Owns Bayon's built-in themes; the selected index is persisted by HudConfig. */
public final class ThemeManager {
    private static final List<Theme> THEMES = List.of(
            new Theme("bayon-blue", "Bayon Blue", "Deep navy glass with electric blue highlights.",
                    0x35103978, 0xD9080C18, 0xFF080D17, 0xD20A1423,
                    0xE31363C6, 0xF20B7EEA, 0xD20B1728, 0xE51C4B7A,
                    0xFFF2F7FF, 0xFFA8BEDA, 0xFF39A7FF, 0xA65CA9F4, 0xA50A101A, 0.96f, true),
            new Theme("midnight-black", "Midnight Black", "Quiet charcoal panels with cool silver accents.",
                    0x30101018, 0xE907080C, 0xFF08090D, 0xD2121419,
                    0xE2384A61, 0xF1526A87, 0xD20C0E13, 0xE5262C36,
                    0xFFF3F5F8, 0xFFA6ADB8, 0xFFB9D3F2, 0x997D91AA, 0xA50C0E12, 0.96f, true),
            new Theme("frost-white", "Frost White", "Pale glass panels with crisp blue controls.",
                    0x45B8D9FF, 0xD91B3550, 0xFF101B28, 0xD6DCEAF5,
                    0xE21A88D6, 0xF12BA9F3, 0xD8D9E8F5, 0xEAF3F8FF,
                    0xFF142337, 0xFF536A82, 0xFF137CC2, 0xB8A6C7DA, 0xA5AEBBC9, 0.94f, true)
    );

    private ThemeManager() {}

    public static List<Theme> themes() {
        return THEMES;
    }

    public static Theme current() {
        return THEMES.get(Math.floorMod(HudConfig.themeIndex(), THEMES.size()));
    }

    public static int backgroundTop() {
        return switch (HudConfig.backgroundIndex()) {
            case 1 -> 0x46B64F25;
            case 2 -> 0x483B398A;
            default -> current().backgroundTop();
        };
    }

    public static int backgroundBottom() {
        return switch (HudConfig.backgroundIndex()) {
            case 1 -> 0xE9180D0B;
            case 2 -> 0xE90A0B1B;
            default -> current().backgroundBottom();
        };
    }

    public static int selectedIndex() {
        return Math.floorMod(HudConfig.themeIndex(), THEMES.size());
    }

    public static void select(int index) {
        HudConfig.setThemeIndex(Math.floorMod(index, THEMES.size()));
    }

    public static void select(String id) {
        Optional<Integer> index = java.util.stream.IntStream.range(0, THEMES.size())
                .filter(i -> THEMES.get(i).id().equals(id)).boxed().findFirst();
        index.ifPresent(ThemeManager::select);
    }

    public static int withOpacity(int argb, float opacity) {
        int alpha = (argb >>> 24) & 0xFF;
        int scaledAlpha = Math.max(0, Math.min(255, Math.round(alpha * Math.max(0, Math.min(1, opacity)))));
        return (argb & 0x00FFFFFF) | (scaledAlpha << 24);
    }
}
