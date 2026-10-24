package com.bayon.client.ui;

import com.bayon.client.config.BayonConfig;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.narration.NarrationElementOutput;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

/** Bayon-styled control that does not use Minecraft's vanilla button sprites. */
public final class BayonButton extends AbstractWidget {
    public enum Style { PRIMARY, SECONDARY, COMPACT }

    private final Runnable action;
    private final Style style;
    private final String icon;
    private final boolean showChevron;
    private boolean selected;
    private boolean pressed;
    private float hoverBlend;
    private long lastFrameNanos;

    public BayonButton(int x, int y, int width, int height, Component label, Style style, Runnable action) {
        this(x, y, width, height, null, label, style, true, action);
    }

    public BayonButton(int x, int y, int width, int height, String icon, Component label, Style style, Runnable action) {
        this(x, y, width, height, icon, label, style, true, action);
    }

    public BayonButton(int x, int y, int width, int height, String icon, Component label, Style style,
                       boolean showChevron, Runnable action) {
        super(x, y, width, height, label);
        this.icon = icon;
        this.style = style;
        this.showChevron = showChevron;
        this.action = action;
    }

    public BayonButton selected(boolean selected) {
        this.selected = selected;
        return this;
    }

    @Override
    protected void extractWidgetRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        int x = getX(), y = getY(), right = x + width, bottom = y + height;
        boolean highlighted = active && (isHoveredOrFocused() || selected);
        long now = System.nanoTime();
        float delta = lastFrameNanos == 0 ? 1f : Math.min(0.08f, (now - lastFrameNanos) / 1_000_000_000f);
        lastFrameNanos = now;
        float target = highlighted ? 1f : 0f;
        hoverBlend = BayonConfig.animationsEnabled()
                ? AnimationUtil.approach(hoverBlend, target, delta, 3_000f / BayonTheme.HOVER_MILLIS) : target;
        int idleFill = style == Style.PRIMARY ? BayonTheme.PRIMARY_TOP : BayonTheme.SECONDARY;
        int hoverFill = style == Style.PRIMARY ? BayonTheme.PRIMARY_BOTTOM : BayonTheme.SECONDARY_HOVER;
        int fill = !active ? 0xFF292929 : blend(idleFill, hoverFill, hoverBlend);
        if (pressed && active) fill = blend(fill, 0xFFFFFFFF, 0.18f);
        int border = !active ? 0xFF555555
                : hoverBlend > 0.02f ? BayonTheme.ACCENT_BRIGHT : BayonTheme.BORDER;
        int textColor = active ? style == Style.PRIMARY ? BayonTheme.PRIMARY_TEXT : BayonTheme.TEXT
                : BayonTheme.MUTED;

        boolean scalePressed = pressed && active;
        if (scalePressed) {
            graphics.pose().pushMatrix();
            graphics.pose().translate(x + width / 2f, y + height / 2f);
            graphics.pose().scale(0.98f, 0.98f);
            graphics.pose().translate(-(x + width / 2f), -(y + height / 2f));
        }
        if (hoverBlend > 0.02f) {
            RenderUtil.glow(graphics, x, y, right, bottom, BayonTheme.CORNER_RADIUS,
                    ThemeManager.withOpacity(BayonTheme.ACCENT, hoverBlend * 0.10f), 2, 2);
        }
        graphics.fill(x, y, right, bottom, fill);
        graphics.outline(x, y, width, height, border);
        graphics.fill(x + 1, y + 1, right - 1, y + 2,
                ThemeManager.withOpacity(0xFFFFFFFF, style == Style.PRIMARY ? 0.32f : 0.15f));

        var font = Minecraft.getInstance().font;
        int textY = y + Math.max(0, (height - font.lineHeight) / 2);
        if (icon == null || width >= 80) {
            int textCenter = x + width / 2 + (icon != null && !showChevron ? 7 : 0);
            graphics.centeredText(font, getMessage(), textCenter, textY, textColor);
        }
        if (icon != null) {
            Identifier iconTexture = Identifier.fromNamespaceAndPath("bayonclient", "textures/gui/icons/" + icon + ".png");
            int iconSize = Math.min(24, Math.max(18, height - 6));
            int iconX = width < 80 ? x + (width - iconSize) / 2 : x + 18;
            RenderUtil.texture(graphics, iconTexture, iconX, y + (height - iconSize) / 2,
                    iconSize, iconSize, 64, 64);
        }
        if (showChevron) {
            graphics.text(font, BayonUi.text(">"), right - 20 + Math.round(3 * hoverBlend), textY, textColor, false);
        }
        if (scalePressed) {
            graphics.pose().popMatrix();
        }
    }

    @Override
    public void onClick(MouseButtonEvent event, boolean doubleClick) {
        super.onClick(event, doubleClick);
        if (active && visible) action.run();
    }

    @Override
    public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
        boolean accepted = super.mouseClicked(event, doubleClick);
        pressed = accepted && active;
        return accepted;
    }

    @Override
    public boolean mouseReleased(MouseButtonEvent event) {
        pressed = false;
        return super.mouseReleased(event);
    }

    private static int blend(int from, int to, float amount) {
        float t = Math.max(0, Math.min(1, amount));
        int a = Math.round(((from >>> 24) & 255) * (1 - t) + ((to >>> 24) & 255) * t);
        int r = Math.round(((from >>> 16) & 255) * (1 - t) + ((to >>> 16) & 255) * t);
        int g = Math.round(((from >>> 8) & 255) * (1 - t) + ((to >>> 8) & 255) * t);
        int b = Math.round((from & 255) * (1 - t) + (to & 255) * t);
        return (a << 24) | (r << 16) | (g << 8) | b;
    }

    @Override
    protected void updateWidgetNarration(NarrationElementOutput output) {
        defaultButtonNarrationText(output);
    }
}
