package com.bayon.client.ui;

import com.bayon.client.config.BayonConfig;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.PlayerFaceExtractor;
import net.minecraft.client.gui.narration.NarrationElementOutput;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.resources.DefaultPlayerSkin;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.PlayerSkin;

/** Profile pill widget showing player skin avatar and username with 15px rounded corners. */
public final class BayonProfileButton extends AbstractWidget {
    private final Runnable action;
    private float hoverBlend;
    private long lastFrameNanos;
    private boolean pressed;

    public BayonProfileButton(int x, int y, int width, int height, Runnable action) {
        super(x, y, width, height, Component.literal(Minecraft.getInstance().getUser().getName()));
        this.action = action;
    }

    @Override
    protected void extractWidgetRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        int x = getX(), y = getY(), right = x + width, bottom = y + height;
        boolean highlighted = active && isHoveredOrFocused();
        long now = System.nanoTime();
        float delta = lastFrameNanos == 0 ? 1f : Math.min(0.08f, (now - lastFrameNanos) / 1_000_000_000f);
        lastFrameNanos = now;
        float target = highlighted ? 1f : 0f;
        hoverBlend = BayonConfig.animationsEnabled()
                ? AnimationUtil.approach(hoverBlend, target, delta, 3_000f / BayonTheme.HOVER_MILLIS) : target;

        int fill = blend(0xCC0C1218, 0xE614202B, hoverBlend);
        if (pressed && active) fill = blend(fill, 0xFFFFFFFF, 0.15f);
        int border = hoverBlend > 0.02f ? BayonTheme.ACCENT_BRIGHT : 0x40677A88;

        if (hoverBlend > 0.02f) {
            RenderUtil.glow(graphics, x, y, right, bottom, BayonTheme.CORNER_RADIUS,
                    ThemeManager.withOpacity(BayonTheme.ACCENT, hoverBlend * 0.18f), 2, 2);
        }
        RenderUtil.roundedBorder(graphics, x, y, right, bottom, BayonTheme.CORNER_RADIUS, 1, border, fill);

        Minecraft client = Minecraft.getInstance();
        com.mojang.authlib.GameProfile profile = new com.mojang.authlib.GameProfile(
                client.getUser().getProfileId(), client.getUser().getName()
        );
        PlayerSkin skin = null;
        try {
            skin = client.getSkinManager().createLookup(profile, true).get();
        } catch (Throwable ignored) {}
        if (skin == null) {
            skin = DefaultPlayerSkin.get(profile);
        }

        int avatarSize = 20;
        int avatarX = x + 6;
        int avatarY = y + (height - avatarSize) / 2;
        if (skin != null) {
            PlayerFaceExtractor.extractRenderState(graphics, skin, avatarX, avatarY, avatarSize);
        }

        var font = client.font;
        int textX = avatarX + avatarSize + 6;
        int textY = y + Math.max(0, (height - font.lineHeight) / 2);
        graphics.text(font, getMessage(), textX, textY, 0xFFF4F8FB, false);
    }

    @Override
    public void onClick(MouseButtonEvent event, boolean doubleClick) {
        super.onClick(event, doubleClick);
        if (active && visible && action != null) action.run();
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
