package com.bayon.client.ui;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.resources.Identifier;

/** Rendering primitives for Bayon's screens and widgets. */
public final class RenderUtil {
    private RenderUtil() {}

    public static void gradient(GuiGraphicsExtractor graphics, int left, int top, int right, int bottom,
                                int topColor, int bottomColor) {
        graphics.fillGradient(left, top, right, bottom, topColor, bottomColor);
    }

    public static void glow(GuiGraphicsExtractor graphics, int left, int top, int right, int bottom,
                            int radius, int color, int layers, int spread) {
        int count = Math.max(1, layers);
        int alpha = color >>> 24;
        for (int layer = count; layer >= 1; layer--) {
            int expansion = spread * layer / count;
            int layerAlpha = alpha * (count - layer + 1) / (count * (count + 1) / 2);
            int layerColor = color & 0x00FFFFFF | layerAlpha << 24;
            if (radius <= 0) {
                graphics.fill(left - expansion, top - expansion, right + expansion, bottom + expansion, layerColor);
            } else {
                roundedRect(graphics, left - expansion, top - expansion, right + expansion, bottom + expansion,
                        radius + expansion, layerColor);
            }
        }
    }

    public static void roundedRect(GuiGraphicsExtractor graphics, int left, int top, int right, int bottom,
                                   int radius, int color) {
        int width = Math.max(0, right - left);
        int height = Math.max(0, bottom - top);
        int r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
        if (r == 0) {
            graphics.fill(left, top, right, bottom, color);
            return;
        }

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

    public static void roundedGradient(GuiGraphicsExtractor graphics, int left, int top, int right, int bottom,
                                       int radius, int topColor, int bottomColor) {
        int width = Math.max(0, right - left);
        int height = Math.max(0, bottom - top);
        int r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
        for (int row = 0; row < height; row++) {
            int inset = 0;
            if (row < r) {
                double dy = r - row - 0.5;
                inset = (int) Math.ceil(r - Math.sqrt(Math.max(0, r * r - dy * dy)));
            } else if (row >= height - r) {
                double dy = row - (height - r) + 0.5;
                inset = (int) Math.ceil(r - Math.sqrt(Math.max(0, r * r - dy * dy)));
            }
            float amount = height <= 1 ? 0 : (float) row / (height - 1);
            graphics.fill(left + inset, top + row, right - inset, top + row + 1,
                    blend(topColor, bottomColor, amount));
        }
    }

    public static void roundedBorder(GuiGraphicsExtractor graphics, int left, int top, int right, int bottom,
                                    int radius, int thickness, int borderColor, int fillColor) {
        int inset = Math.max(1, Math.min(thickness, Math.min(right - left, bottom - top) / 2));
        roundedRect(graphics, left, top, right, bottom, radius, borderColor);
        roundedRect(graphics, left + inset, top + inset, right - inset, bottom - inset,
                Math.max(0, radius - inset), fillColor);
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

    private static int blend(int from, int to, float amount) {
        int a = Math.round(((from >>> 24) & 255) * (1 - amount) + ((to >>> 24) & 255) * amount);
        int r = Math.round(((from >>> 16) & 255) * (1 - amount) + ((to >>> 16) & 255) * amount);
        int g = Math.round(((from >>> 8) & 255) * (1 - amount) + ((to >>> 8) & 255) * amount);
        int b = Math.round((from & 255) * (1 - amount) + (to & 255) * amount);
        return a << 24 | r << 16 | g << 8 | b;
    }
}
