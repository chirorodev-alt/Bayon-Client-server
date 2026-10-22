package com.bayon.client.hud;

import com.bayon.client.config.HudConfig;
import com.bayon.client.ui.BayonButton;
import com.bayon.client.ui.BayonUi;
import com.bayon.client.ui.Theme;
import com.bayon.client.ui.ThemeManager;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/** Theme picker for the in-game Bayon title screen. Selection is saved immediately. */
public final class ThemeSelectorScreen extends Screen {
    private final Screen parent;

    public ThemeSelectorScreen(Screen parent) {
        super(BayonUi.text("Bayon Themes"));
        this.parent = parent;
    }

    private int panelWidth() { return Math.min(760, width - 32); }
    private int panelLeft() { return (width - panelWidth()) / 2; }
    private int panelTop() { return Math.max(24, (height - 510) / 2); }
    private int cardWidth() { return Math.min(210, (panelWidth() - 64) / 3); }
    private int cardGap() { return 12; }
    private int cardsLeft() { return width / 2 - (cardWidth() * 3 + cardGap() * 2) / 2; }

    @Override
    protected void init() {
        int cardW = cardWidth();
        int cardsX = cardsLeft();
        int cardY = panelTop() + 112;
        for (int index = 0; index < ThemeManager.themes().size(); index++) {
            final int themeIndex = index;
            int x = cardsX + index * (cardW + cardGap());
            addRenderableWidget(new BayonButton(x + 10, cardY + 220, cardW - 20, 32,
                    BayonUi.text(ThemeManager.selectedIndex() == index ? "SELECTED" : "USE THEME"),
                    ThemeManager.selectedIndex() == index ? BayonButton.Style.PRIMARY : BayonButton.Style.SECONDARY,
                    () -> {
                        ThemeManager.select(themeIndex);
                        rebuildScreen();
                    }).selected(ThemeManager.selectedIndex() == index));
        }
        addRenderableWidget(new BayonButton(panelLeft() + 18, panelTop() + 438, 120, 28,
                BayonUi.text("BACK"), BayonButton.Style.SECONDARY, this::onClose));
        addRenderableWidget(new BayonButton(panelLeft() + panelWidth() - 138, panelTop() + 438, 120, 28,
                BayonUi.text("DONE"), BayonButton.Style.PRIMARY, this::onClose));
    }

    private void rebuildScreen() {
        clearWidgets();
        init();
    }

    @Override
    public void extractBackground(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        super.extractBackground(graphics, mouseX, mouseY, partialTick);
        graphics.fillGradient(0, 0, width, height, ThemeManager.backgroundTop(), ThemeManager.backgroundBottom());
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        Theme current = ThemeManager.current();
        int left = panelLeft(), top = panelTop(), right = left + panelWidth(), bottom = top + 480;
        graphics.fill(left, top, right, bottom, ThemeManager.withOpacity(current.panelColor(), current.uiOpacity()));
        BayonUi.outlineRect(graphics, left, top, right, bottom, current.borderColor());
        graphics.fill(left + 1, top + 1, right - 1, top + 4, current.accentColor());

        var font = Minecraft.getInstance().font;
        graphics.text(font, BayonUi.text("BAYON CLIENT  /  THEMES"), left + 20, top + 18, current.accentColor(), true);
        graphics.text(font, BayonUi.text("Choose a look for the title screen and Bayon controls."), left + 20, top + 38, current.mutedTextColor(), false);

        for (int index = 0; index < ThemeManager.themes().size(); index++) {
            Theme theme = ThemeManager.themes().get(index);
            int x = cardsLeft() + index * (cardWidth() + cardGap());
            int y = top + 112;
            int cardRight = x + cardWidth();
            int cardBottom = y + 202;
            boolean selected = ThemeManager.selectedIndex() == index;
            graphics.fill(x, y, cardRight, cardBottom, ThemeManager.withOpacity(theme.screenBackground(), theme.uiOpacity()));
            BayonUi.outlineRect(graphics, x, y, cardRight, cardBottom, selected ? theme.accentColor() : theme.borderColor());
            graphics.fill(x + 10, y + 10, cardRight - 10, y + 90, theme.backgroundBottom());
            graphics.fill(x + 20, y + 22, cardRight - 20, y + 76, ThemeManager.withOpacity(theme.panelColor(), theme.uiOpacity()));
            BayonUi.outlineRect(graphics, x + 20, y + 22, cardRight - 20, y + 76, theme.borderColor());
            graphics.fill(x + 29, y + 34, cardRight - 29, y + 45, theme.primaryButton());
            graphics.fill(x + 29, y + 53, cardRight - 29, y + 64, theme.secondaryButton());
            graphics.text(font, BayonUi.text(theme.name()), x + 12, y + 104, theme.textColor(), true);
            graphics.text(font, BayonUi.text(theme.description()), x + 12, y + 124, theme.mutedTextColor(), false);
            graphics.text(font, BayonUi.text(selected ? "ACTIVE  •  SAVED" : "TITLE + CONTROLS"), x + 12, y + 174,
                    selected ? theme.accentColor() : theme.mutedTextColor(), false);
        }

        super.extractRenderState(graphics, mouseX, mouseY, partialTick);
    }

    @Override
    public void onClose() {
        HudConfig.save();
        Minecraft.getInstance().gui.setScreen(parent);
    }

    @Override
    public boolean isPauseScreen() { return false; }
}
