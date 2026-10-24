package com.bayon.client.ui;

import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FontDescription;
import net.minecraft.resources.Identifier;

/** Shared display typography and drawing helpers for Bayon's in-game screens. */
public final class BayonUi {
    private static final FontDescription FONT =
            new FontDescription.Resource(Identifier.fromNamespaceAndPath("bayonclient", "bayon_pixel"));

    private BayonUi() {}

    public static Component text(String value) {
        return Component.literal(value).withStyle(style -> style.withFont(FONT));
    }

    public static Component translate(String key) {
        return Component.translatable(key).withStyle(style -> style.withFont(FONT));
    }

    /** GuiGraphicsExtractor.outline expects width and height, unlike fill's right and bottom edges. */
    public static void outlineRect(net.minecraft.client.gui.GuiGraphicsExtractor graphics,
                                   int left, int top, int right, int bottom, int color) {
        graphics.outline(left, top, Math.max(0, right - left), Math.max(0, bottom - top), color);
    }

    /** Draws a rounded rectangle from native GUI fills, without using vanilla button sprites. */
    public static void roundedRect(net.minecraft.client.gui.GuiGraphicsExtractor graphics,
                                   int left, int top, int right, int bottom, int radius, int color) {
        RenderUtil.roundedRect(graphics, left, top, right, bottom, radius, color);
    }

    /** Rounded border drawn as two nested fills, avoiding vanilla button outline rendering. */
    public static void roundedBorder(net.minecraft.client.gui.GuiGraphicsExtractor graphics,
                                     int left, int top, int right, int bottom, int radius, int thickness,
                                     int borderColor, int insideColor) {
        RenderUtil.roundedBorder(graphics, left, top, right, bottom, radius, thickness, borderColor, insideColor);
    }
}
