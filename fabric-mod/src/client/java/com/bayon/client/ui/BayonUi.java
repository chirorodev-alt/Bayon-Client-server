package com.bayon.client.ui;

import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FontDescription;
import net.minecraft.resources.Identifier;

/** Shared display typography and drawing helpers for Bayon's in-game screens. */
public final class BayonUi {
    private static final Identifier FONT = Identifier.fromNamespaceAndPath("minecraft", "uniform");

    private BayonUi() {}

    public static Component text(String value) {
        return Component.literal(value).withStyle(style -> style.withFont(new FontDescription.Resource(FONT)));
    }

    /** GuiGraphicsExtractor.outline expects width and height, unlike fill's right and bottom edges. */
    public static void outlineRect(net.minecraft.client.gui.GuiGraphicsExtractor graphics,
                                   int left, int top, int right, int bottom, int color) {
        graphics.outline(left, top, Math.max(0, right - left), Math.max(0, bottom - top), color);
    }

    /** Draws a rounded rectangle from native GUI fills, without using vanilla button sprites. */
    public static void roundedRect(net.minecraft.client.gui.GuiGraphicsExtractor graphics,
                                   int left, int top, int right, int bottom, int radius, int color) {
        int width = Math.max(0, right - left);
        int height = Math.max(0, bottom - top);
        int r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
        if (r == 0) {
            graphics.fill(left, top, right, bottom, color);
            return;
        }

        // Approximate a quarter-circle with scanlines. Each row is one batched fill,
        // which gives the corners a clean pixel edge at Minecraft's GUI scale.
        for (int row = 0; row < height; row++) {
            int inset = 0;
            if (row < r) {
                double dy = r - row - 0.5;
                inset = (int) Math.ceil(r - Math.sqrt(Math.max(0, r * r - dy * dy)));
            } else if (row >= height - r) {
                double dy = row - (height - r) + 0.5;
                inset = (int) Math.ceil(r - Math.sqrt(Math.max(0, r * r - dy * dy)));
            }
            graphics.fill(left + inset, top + row, right - inset, top + row + 1, color);
        }
    }

    /** Rounded border drawn as two nested fills, avoiding vanilla button outline rendering. */
    public static void roundedBorder(net.minecraft.client.gui.GuiGraphicsExtractor graphics,
                                     int left, int top, int right, int bottom, int radius, int thickness,
                                     int borderColor, int insideColor) {
        int t = Math.max(1, Math.min(thickness, Math.min(right - left, bottom - top) / 2));
        roundedRect(graphics, left, top, right, bottom, radius, borderColor);
        roundedRect(graphics, left + t, top + t, right - t, bottom - t, Math.max(0, radius - t), insideColor);
    }
}
