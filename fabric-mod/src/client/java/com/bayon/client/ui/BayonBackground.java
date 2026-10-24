package com.bayon.client.ui;

import com.bayon.client.config.BayonConfig;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.resources.Identifier;

/** Shared title-screen background and readability vignette. */
public final class BayonBackground {
    private static final Identifier BAYON_BACKGROUND =
            Identifier.fromNamespaceAndPath("bayonclient", "textures/gui/background.png");
    private static final Identifier NIGHTFALL_BACKGROUND =
            Identifier.fromNamespaceAndPath("bayonclient", "textures/gui/background_nightfall.png");

    private BayonBackground() {}

    public static void draw(GuiGraphicsExtractor graphics, int width, int height) {
        Identifier texture = "nightfall".equals(BayonConfig.background()) ? NIGHTFALL_BACKGROUND : BAYON_BACKGROUND;
        graphics.blit(RenderPipelines.GUI_TEXTURED, texture, 0, 0, 0, 0, width, height, 1920, 1080);
        RenderUtil.gradient(graphics, 0, 0, width, height, 0x40000000, 0xAD000000);
        graphics.fill(0, 0, width, 58, 0x72000000);
        int edge = Math.max(12, width / 18);
        for (int band = 0; band < 8; band++) {
            int alpha = 19 - band * 2;
            int inset = band * edge / 8;
            int color = alpha << 24;
            graphics.fill(inset, 0, inset + Math.max(1, edge / 8), height, color);
            graphics.fill(width - inset - Math.max(1, edge / 8), 0, width - inset, height, color);
        }
    }
}
