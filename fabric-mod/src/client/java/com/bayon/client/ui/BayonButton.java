package com.bayon.client.ui;

import com.bayon.client.config.HudConfig;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.narration.NarrationElementOutput;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

/** Bayon-styled control that does not use Minecraft's vanilla button sprites. */
public final class BayonButton extends AbstractWidget {
    public enum Style { PRIMARY, SECONDARY, COMPACT }

    private final Runnable action;
    private final Style style;
    private boolean selected;
    private boolean pressed;
    private float hoverBlend;
    private long lastFrameNanos;

    public BayonButton(int x, int y, int width, int height, Component label, Style style, Runnable action) {
        super(x, y, width, height, BayonUi.text(label.getString()));
        this.style = style;
        this.action = action;
    }

    public BayonButton selected(boolean selected) {
        this.selected = selected;
        return this;
    }

    @Override
    protected void extractWidgetRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        int x = getX(), y = getY(), right = x + width, bottom = y + height;
        Theme theme = ThemeManager.current();
        boolean highlighted = active && (isHoveredOrFocused() || selected);
        long now = System.nanoTime();
        float delta = lastFrameNanos == 0 ? 1f : Math.min(0.08f, (now - lastFrameNanos) / 1_000_000_000f);
        lastFrameNanos = now;
        float target = highlighted ? 1f : 0f;
        hoverBlend = theme.animations() ? approach(hoverBlend, target, delta * 9f) : target;
        int idleFill = style == Style.PRIMARY ? theme.primaryButton() : theme.secondaryButton();
        int hoverFill = style == Style.PRIMARY ? theme.primaryHover() : theme.secondaryHover();
        int fill = !active ? theme.disabledColor() : blend(idleFill, hoverFill, hoverBlend);
        if (pressed && active) fill = blend(fill, theme.accentColor(), 0.28f);
        fill = ThemeManager.withOpacity(fill, theme.uiOpacity());
        int border = !active ? theme.disabledColor() : hoverBlend > 0.02f ? theme.accentColor() : theme.borderColor();
        int textColor = active ? theme.textColor() : theme.mutedTextColor();

        BayonUi.roundedBorder(graphics, x, y, right, bottom, 7, 1, border, fill);
        BayonUi.roundedRect(graphics, x + 5, y + 1, right - 5, y + 2, 1,
                hoverBlend > 0.02f ? theme.accentColor() : theme.borderColor());
        if (style == Style.PRIMARY || selected) {
            BayonUi.roundedRect(graphics, x + 1, y + 5, x + 3, bottom - 5, 1, theme.accentColor());
        }

        var font = Minecraft.getInstance().font;
        int textY = y + Math.max(0, (height - font.lineHeight) / 2);
        graphics.centeredText(font, getMessage(), x + width / 2, textY, textColor);
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

    private static float approach(float value, float target, float amount) {
        if (value < target) return Math.min(target, value + amount);
        return Math.max(target, value - amount);
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
