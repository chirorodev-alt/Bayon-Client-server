package com.bayon.client.ui;

import com.bayon.client.config.BayonConfig;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.narration.NarrationElementOutput;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;


/** Square-cornered glass navigation tab for the title screen. */
public final class BayonTabButton extends AbstractWidget {
    private final String icon;
    private final Runnable action;
    private final boolean selected;
    private float hover;
    private long lastFrameNanos;

    public BayonTabButton(int x, int y, int width, int height, String icon, Component label, boolean selected,
                          Runnable action) {
        super(x, y, width, height, label);
        this.icon = icon;
        this.selected = selected;
        this.action = action;
    }

    @Override
    protected void extractWidgetRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        long now = System.nanoTime();
        float delta = lastFrameNanos == 0 ? 1 : (now - lastFrameNanos) / 1_000_000_000f;
        lastFrameNanos = now;
        boolean highlighted = active && (selected || isHoveredOrFocused());
        hover = BayonConfig.animationsEnabled()
                ? AnimationUtil.approach(hover, highlighted ? 1 : 0, delta,
                3_000f / BayonTheme.HOVER_MILLIS)
                : highlighted ? 1 : 0;
        int left = getX();
        int top = getY();
        int right = left + width;
        int bottom = top + height;

        int fill = mix(BayonTheme.PANEL, selected ? 0xC9363636 : BayonTheme.SECONDARY_HOVER, hover);
        graphics.fill(left, top, right, bottom, fill);
        graphics.outline(left, top, width, height, highlighted ? BayonTheme.ACCENT_BRIGHT : BayonTheme.BORDER);
        graphics.fill(left + 1, top + 1, right - 1, top + 2,
                withOpacity(0xFFFFFFFF, selected ? 0.36f : 0.15f));

        Identifier iconTexture = Identifier.fromNamespaceAndPath("bayonclient", "textures/gui/icons/" + icon + ".png");
        RenderUtil.texture(graphics, iconTexture, left + width / 2 - 10, top + 3, 20, 20, 64, 64);
        var font = Minecraft.getInstance().font;
        graphics.centeredText(font, getMessage(), left + width / 2, top + 24,
                active ? BayonTheme.TEXT : BayonTheme.MUTED);
    }

    private static int withOpacity(int color, float opacity) {
        int alpha = Math.round((color >>> 24) * Math.max(0, Math.min(1, opacity)));
        return color & 0x00FFFFFF | alpha << 24;
    }

    private static int mix(int from, int to, float amount) {
        float t = Math.max(0, Math.min(1, amount));
        int a = Math.round(((from >>> 24) & 255) * (1 - t) + ((to >>> 24) & 255) * t);
        int r = Math.round(((from >>> 16) & 255) * (1 - t) + ((to >>> 16) & 255) * t);
        int g = Math.round(((from >>> 8) & 255) * (1 - t) + ((to >>> 8) & 255) * t);
        int b = Math.round((from & 255) * (1 - t) + (to & 255) * t);
        return a << 24 | r << 16 | g << 8 | b;
    }

    @Override
    public void onClick(net.minecraft.client.input.MouseButtonEvent event, boolean doubleClick) {
        super.onClick(event, doubleClick);
        if (active && visible) action.run();
    }

    @Override
    protected void updateWidgetNarration(NarrationElementOutput output) {
        defaultButtonNarrationText(output);
    }
}
