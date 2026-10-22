package com.bayon.client.ui;

/** Immutable colors and behavior used by Bayon's in-game screens. */
public record Theme(
        String id,
        String name,
        String description,
        int backgroundTop,
        int backgroundBottom,
        int screenBackground,
        int panelColor,
        int primaryButton,
        int primaryHover,
        int secondaryButton,
        int secondaryHover,
        int textColor,
        int mutedTextColor,
        int accentColor,
        int borderColor,
        int disabledColor,
        float uiOpacity,
        boolean animations
) {}
