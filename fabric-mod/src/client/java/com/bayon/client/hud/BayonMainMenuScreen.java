package com.bayon.client.hud;

import com.bayon.client.config.HudConfig;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.gui.screens.options.OptionsScreen;
import net.minecraft.client.gui.screens.worldselection.SelectWorldScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Util;
import com.bayon.client.ui.BayonButton;
import com.bayon.client.ui.BayonUi;
import com.bayon.client.ui.ThemeManager;

import java.net.URI;

/** Bayon-themed replacement for the vanilla title screen. */
public final class BayonMainMenuScreen extends Screen {
    private static final String STORE_URL = "https://bayon-backend.onrender.com/";
    public BayonMainMenuScreen() {
        super(BayonUi.text("Bayon Client"));
    }

    @Override
    protected void init() {
        int center = width / 2;
        int buttonWidth = Math.min(360, width - 48);
        int buttonLeft = center - buttonWidth / 2;
        int mainTop = Math.max(140, (int) (height * 0.43));
        int gap = 42;
        Minecraft client = Minecraft.getInstance();

        addRenderableWidget(new BayonButton(buttonLeft, mainTop, buttonWidth, 36, BayonUi.text("SINGLEPLAYER     ›"), BayonButton.Style.PRIMARY,
                () -> client.gui.setScreen(new SelectWorldScreen(this))));
        addRenderableWidget(new BayonButton(buttonLeft, mainTop + gap, buttonWidth, 36, BayonUi.text("MULTIPLAYER     ›"), BayonButton.Style.SECONDARY,
                () -> client.gui.setScreen(new JoinMultiplayerScreen(this))));
        addRenderableWidget(new BayonButton(buttonLeft, mainTop + gap * 2, buttonWidth, 36, BayonUi.text("OPTIONS     ›"), BayonButton.Style.SECONDARY,
                () -> client.gui.setScreen(new OptionsScreen(this, client.options, false))));
        addRenderableWidget(new BayonButton(buttonLeft, mainTop + gap * 3, buttonWidth, 36, BayonUi.text("QUIT GAME     ›"), BayonButton.Style.SECONDARY, client::stop));

        int footerY = height - 58;
        int footerGap = 8;
        int footerWidth = Math.min(164, Math.max(86, (width - 48 - footerGap * 3) / 4));
        int footerLeft = center - (footerWidth * 4 + footerGap * 3) / 2;
        addRenderableWidget(new BayonButton(footerLeft, footerY, footerWidth, 40, BayonUi.text("WARDROBE"), BayonButton.Style.SECONDARY,
                () -> client.gui.setScreen(new BayonCustomizationScreen(this, 1))));
        addRenderableWidget(new BayonButton(footerLeft + footerWidth + footerGap, footerY, footerWidth, 40, BayonUi.text("COSMETIC STORE"), BayonButton.Style.PRIMARY,
                () -> client.gui.setScreen(new BayonCustomizationScreen(this, 4))));
        addRenderableWidget(new BayonButton(footerLeft + (footerWidth + footerGap) * 2, footerY, footerWidth, 40, BayonUi.text("THEMES"), BayonButton.Style.SECONDARY,
                () -> client.gui.setScreen(new ThemeSelectorScreen(this))));
        addRenderableWidget(new BayonButton(footerLeft + (footerWidth + footerGap) * 3, footerY, footerWidth, 40, BayonUi.text("STORE"), BayonButton.Style.SECONDARY,
                () -> Util.getPlatform().openUri(URI.create(STORE_URL))));

        addRenderableWidget(new BayonButton(width - 190, 14, 174, 28, BayonUi.text("PROFILE  " + client.getUser().getName()), BayonButton.Style.SECONDARY,
                () -> client.gui.setScreen(new BayonCustomizationScreen(this, 1))));
    }

    @Override
    public void extractBackground(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        super.extractBackground(graphics, mouseX, mouseY, partialTick);
        graphics.fillGradient(0, 0, width, height, ThemeManager.backgroundTop(), ThemeManager.backgroundBottom());
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        int center = width / 2;
        int buttonWidth = Math.min(360, width - 48);
        int buttonLeft = center - buttonWidth / 2;
        int mainTop = Math.max(140, (int) (height * 0.43));
        int gap = 42;

        graphics.centeredText(font, BayonUi.text("B"), center, Math.max(44, height / 6 - 22), HudConfig.accentColor());
        graphics.centeredText(font, BayonUi.text("BAYON CLIENT"), center, Math.max(82, height / 6 + 12), 0xFFF3F7FF);
        graphics.centeredText(font, BayonUi.text("PLAY   /   CUSTOMIZE   /   BE DIFFERENT"), center,
                Math.max(101, height / 6 + 31), 0xFFB8CDEB);

        graphics.text(font, BayonUi.text("BAYON CLIENT  v0.1.4"), 18, height - 26, ThemeManager.current().textColor(), false);
        graphics.text(font, BayonUi.text("MORE THAN JUST A CLIENT"), Math.max(18, width - 210), height - 26, 0xFF91A9C8, false);
        super.extractRenderState(graphics, mouseX, mouseY, partialTick);
    }

    @Override
    public boolean shouldCloseOnEsc() {
        return false;
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }

    @Override
    public void onClose() {
        Minecraft.getInstance().gui.setScreen(this);
    }
}
