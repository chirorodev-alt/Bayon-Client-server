package com.bayon.client.hud;

import com.bayon.client.ui.BayonButton;
import com.bayon.client.ui.BayonBackground;
import com.bayon.client.ui.BayonTheme;
import com.bayon.client.ui.BayonUi;
import com.bayon.client.ui.RenderUtil;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/** Shared lightweight landing screen for Bayon features that are not implemented yet. */
public final class BayonPlaceholderScreen extends Screen {
    private final Screen parent;
    private final Component detail;

    public BayonPlaceholderScreen(Screen parent, Component title, Component detail) {
        super(title);
        this.parent = parent;
        this.detail = detail;
    }

    @Override
    protected void init() {
        int buttonWidth = Math.min(220, Math.max(1, width - 32));
        addRenderableWidget(new BayonButton(width / 2 - buttonWidth / 2, height / 2 + 48, buttonWidth, 34,
                BayonUi.translate("menu.bayonclient.back"), BayonButton.Style.PRIMARY, this::onClose));
    }

    @Override
    public void extractBackground(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        BayonBackground.draw(graphics, width, height);
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        int panelWidth = Math.min(520, width - 28);
        int left = (width - panelWidth) / 2;
        int top = height / 2 - 86;
        RenderUtil.roundedBorder(graphics, left, top, left + panelWidth, top + 144, BayonTheme.CORNER_RADIUS, 1,
                BayonTheme.BORDER, BayonTheme.PANEL);
        var font = Minecraft.getInstance().font;
        graphics.centeredText(font, getTitle(), width / 2, top + 28, BayonTheme.TEXT);
        graphics.textWithWordWrap(font, detail, left + 26, top + 60, panelWidth - 52, BayonTheme.MUTED, false);
        super.extractRenderState(graphics, mouseX, mouseY, partialTick);
    }

    @Override
    public void onClose() {
        Minecraft.getInstance().gui.setScreen(parent);
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }
}
