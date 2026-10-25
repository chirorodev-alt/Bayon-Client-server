package com.bayon.client.ui;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.resources.Identifier;

/**
 * High-quality rendering primitives for Bayon's screens and widgets.
 * Uses high-resolution 4x super-sampled signed-distance-field (SDF) textures
 * with hardware bilinear anti-aliasing for smooth 15px rounded corners and borders.
 */
public final class RenderUtil {
    private static final Identifier ROUNDED_15_FILL =
            Identifier.fromNamespaceAndPath("bayonclient", "textures/gui/rounded_15_fill.png");
    private static final Identifier ROUNDED_15_BORDER =
            Identifier.fromNamespaceAndPath("bayonclient", "textures/gui/rounded_15_border.png");
    private static final Identifier ROUNDED_15_GLOW =
            Identifier.fromNamespaceAndPath("bayonclient", "textures/gui/rounded_15_glow.png");

    private RenderUtil() {}

    public static void gradient(GuiGraphicsExtractor graphics, int left, int top, int right, int bottom,
                                int topColor, int bottomColor) {
        graphics.fillGradient(left, top, right, bottom, topColor, bottomColor);
    }

    public static void glow(GuiGraphicsExtractor graphics, int left, int top, int right, int bottom,
                            int radius, int color, int layers, int spread) {
        if ((color >>> 24) == 0) return;
        drawGlow9Slice(graphics, left, top, right, bottom, radius, color, spread);
    }

    public static void roundedRect(GuiGraphicsExtractor graphics, int left, int top, int right, int bottom,
                                   int radius, int color) {
        if ((color >>> 24) == 0) return;
        draw9Slice(graphics, ROUNDED_15_FILL, left, top, right, bottom, radius, color);
    }

    public static void roundedBorder(GuiGraphicsExtractor graphics, int left, int top, int right, int bottom,
                                     int radius, int thickness, int borderColor, int fillColor) {
        if ((fillColor >>> 24) > 0) {
            draw9Slice(graphics, ROUNDED_15_FILL, left, top, right, bottom, radius, fillColor);
        }
        if ((borderColor >>> 24) > 0) {
            draw9Slice(graphics, ROUNDED_15_BORDER, left, top, right, bottom, radius, borderColor);
        }
    }

    public static void roundedGradient(GuiGraphicsExtractor graphics, int left, int top, int right, int bottom,
                                       int radius, int topColor, int bottomColor) {
        roundedRect(graphics, left, top, right, bottom, radius, blend(topColor, bottomColor, 0.5f));
    }

    public static void angledTab(GuiGraphicsExtractor graphics, int left, int top, int right, int bottom,
                                 int corner, int color) {
        int height = Math.max(0, bottom - top);
        int slant = Math.max(1, Math.min(corner, height / 2));
        for (int row = 0; row < height; row++) {
            int distance = Math.min(row, height - row - 1);
            int inset = distance < slant ? slant - distance : 0;
            graphics.fill(left + inset, top + row, right - inset, top + row + 1, color);
        }
    }

    public static void texture(GuiGraphicsExtractor graphics, Identifier texture, int x, int y, int width, int height,
                               int textureWidth, int textureHeight) {
        graphics.blit(RenderPipelines.GUI_TEXTURED, texture, x, y, 0, 0,
                width, height, textureWidth, textureHeight, textureWidth, textureHeight);
    }

    /**
     * Draws a mathematically anti-aliased 15px rounded rectangle via 9-slice blitting.
     * Texture size is 128x128 with corner size 60 (4x super-sampled from 15px).
     */
    private static void draw9Slice(GuiGraphicsExtractor graphics, Identifier texture,
                                  int left, int top, int right, int bottom,
                                  int radius, int color) {
        int width = right - left;
        int height = bottom - top;
        if (width <= 0 || height <= 0) return;

        int r = Math.max(1, Math.min(radius, Math.min(width, height) / 2));

        int x0 = left;
        int x1 = left + r;
        int x2 = right - r;

        int y0 = top;
        int y1 = top + r;
        int y2 = bottom - r;

        int wLeft = r;
        int wMid = x2 - x1;
        int wRight = r;

        int hTop = r;
        int hMid = y2 - y1;
        int hBottom = r;

        // Texture coordinates: corners are 60x60, center slice is 8x8 in 128x128 texture
        int u0 = 0, u1 = 60, u2 = 68;
        int v0 = 0, v1 = 60, v2 = 68;
        int uCorner = 60, uMid = 8;
        int vCorner = 60, vMid = 8;
        int texSize = 128;

        // 1. Top-Left Corner
        graphics.blit(RenderPipelines.GUI_TEXTURED, texture, x0, y0, u0, v0, wLeft, hTop, uCorner, vCorner, texSize, texSize, color);

        // 2. Top Edge
        if (wMid > 0) {
            graphics.blit(RenderPipelines.GUI_TEXTURED, texture, x1, y0, u1, v0, wMid, hTop, uMid, vCorner, texSize, texSize, color);
        }

        // 3. Top-Right Corner
        graphics.blit(RenderPipelines.GUI_TEXTURED, texture, x2, y0, u2, v0, wRight, hTop, uCorner, vCorner, texSize, texSize, color);

        // 4. Left Edge
        if (hMid > 0) {
            graphics.blit(RenderPipelines.GUI_TEXTURED, texture, x0, y1, u0, v1, wLeft, hMid, uCorner, vMid, texSize, texSize, color);
        }

        // 5. Center Fill
        if (wMid > 0 && hMid > 0) {
            graphics.blit(RenderPipelines.GUI_TEXTURED, texture, x1, y1, u1, v1, wMid, hMid, uMid, vMid, texSize, texSize, color);
        }

        // 6. Right Edge
        if (hMid > 0) {
            graphics.blit(RenderPipelines.GUI_TEXTURED, texture, x2, y1, u2, v1, wRight, hMid, uCorner, vMid, texSize, texSize, color);
        }

        // 7. Bottom-Left Corner
        graphics.blit(RenderPipelines.GUI_TEXTURED, texture, x0, y2, u0, v2, wLeft, hBottom, uCorner, vCorner, texSize, texSize, color);

        // 8. Bottom Edge
        if (wMid > 0) {
            graphics.blit(RenderPipelines.GUI_TEXTURED, texture, x1, y2, u1, v2, wMid, hBottom, uMid, vCorner, texSize, texSize, color);
        }

        // 9. Bottom-Right Corner
        graphics.blit(RenderPipelines.GUI_TEXTURED, texture, x2, y2, u2, v2, wRight, hBottom, uCorner, vCorner, texSize, texSize, color);
    }

    /**
     * Draws a smooth ambient glow around a rounded box using 9-slice blitting.
     */
    private static void drawGlow9Slice(GuiGraphicsExtractor graphics,
                                       int left, int top, int right, int bottom,
                                       int radius, int color, int spread) {
        int width = right - left;
        int height = bottom - top;
        if (width <= 0 || height <= 0) return;

        int pad = Math.max(2, Math.min(6, spread * 2));
        int gLeft = left - pad;
        int gTop = top - pad;
        int gRight = right + pad;
        int gBottom = bottom + pad;

        int r = Math.max(1, Math.min(radius, Math.min(width, height) / 2));
        int cornerSize = r + pad;

        int x0 = gLeft;
        int x1 = gLeft + cornerSize;
        int x2 = gRight - cornerSize;

        int y0 = gTop;
        int y1 = gTop + cornerSize;
        int y2 = gBottom - cornerSize;

        int wLeft = cornerSize;
        int wMid = Math.max(0, x2 - x1);
        int wRight = cornerSize;

        int hTop = cornerSize;
        int hMid = Math.max(0, y2 - y1);
        int hBottom = cornerSize;

        // In 160x160 glow texture: padding = 16, corner = 60, center = 8
        int u0 = 0, u1 = 76, u2 = 84;
        int v0 = 0, v1 = 76, v2 = 84;
        int uCorner = 76, uMid = 8;
        int vCorner = 76, vMid = 8;
        int texSize = 160;

        graphics.blit(RenderPipelines.GUI_TEXTURED, ROUNDED_15_GLOW, x0, y0, u0, v0, wLeft, hTop, uCorner, vCorner, texSize, texSize, color);
        if (wMid > 0) {
            graphics.blit(RenderPipelines.GUI_TEXTURED, ROUNDED_15_GLOW, x1, y0, u1, v0, wMid, hTop, uMid, vCorner, texSize, texSize, color);
        }
        graphics.blit(RenderPipelines.GUI_TEXTURED, ROUNDED_15_GLOW, x2, y0, u2, v0, wRight, hTop, uCorner, vCorner, texSize, texSize, color);

        if (hMid > 0) {
            graphics.blit(RenderPipelines.GUI_TEXTURED, ROUNDED_15_GLOW, x0, y1, u0, v1, wLeft, hMid, uCorner, vMid, texSize, texSize, color);
        }
        if (wMid > 0 && hMid > 0) {
            graphics.blit(RenderPipelines.GUI_TEXTURED, ROUNDED_15_GLOW, x1, y1, u1, v1, wMid, hMid, uMid, vMid, texSize, texSize, color);
        }
        if (hMid > 0) {
            graphics.blit(RenderPipelines.GUI_TEXTURED, ROUNDED_15_GLOW, x2, y1, u2, v1, wRight, hMid, uCorner, vMid, texSize, texSize, color);
        }

        graphics.blit(RenderPipelines.GUI_TEXTURED, ROUNDED_15_GLOW, x0, y2, u0, v2, wLeft, hBottom, uCorner, vCorner, texSize, texSize, color);
        if (wMid > 0) {
            graphics.blit(RenderPipelines.GUI_TEXTURED, ROUNDED_15_GLOW, x1, y2, u1, v2, wMid, hBottom, uMid, vCorner, texSize, texSize, color);
        }
        graphics.blit(RenderPipelines.GUI_TEXTURED, ROUNDED_15_GLOW, x2, y2, u2, v2, wRight, hBottom, uCorner, vCorner, texSize, texSize, color);
    }

    private static int blend(int from, int to, float amount) {
        int a = Math.round(((from >>> 24) & 255) * (1 - amount) + ((to >>> 24) & 255) * amount);
        int r = Math.round(((from >>> 16) & 255) * (1 - amount) + ((to >>> 16) & 255) * amount);
        int g = Math.round(((from >>> 8) & 255) * (1 - amount) + ((to >>> 8) & 255) * amount);
        int b = Math.round((from & 255) * (1 - amount) + (to & 255) * amount);
        return a << 24 | r << 16 | g << 8 | b;
    }
}
