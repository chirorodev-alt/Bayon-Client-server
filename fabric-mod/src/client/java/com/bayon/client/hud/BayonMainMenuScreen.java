package com.bayon.client.hud;

import com.bayon.client.BayonClient;
import com.bayon.client.config.BayonConfig;
import com.bayon.client.ui.BayonBackground;
import com.bayon.client.ui.BayonButton;
import com.bayon.client.ui.BayonTabButton;
import com.bayon.client.ui.BayonTheme;
import com.bayon.client.ui.BayonUi;
import com.bayon.client.ui.RenderUtil;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.ConfirmScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.gui.screens.options.OptionsScreen;
import net.minecraft.client.gui.screens.worldselection.SelectWorldScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import org.lwjgl.glfw.GLFW;

/** Compact, pixel-font Bayon title screen with the normal Minecraft destinations. */
public final class BayonMainMenuScreen extends Screen {
    private static final Identifier LOGO = Identifier.fromNamespaceAndPath("bayonclient", "textures/gui/logo.png");
    private long lastFrameNanos;
    private float glowPhase;

    public BayonMainMenuScreen() {
        super(BayonUi.translate("menu.bayonclient.title"));
    }

    private int mainButtonWidth() {
        return Math.max(160, Math.min(300, Math.round(width * 0.25f)));
    }

    private int mainButtonHeight() {
        return Math.max(22, Math.min(30, Math.round(height * 0.04f)));
    }

    private int mainButtonTop() {
        return Math.round(height * 0.50f);
    }

    private int tabTop() {
        return Math.round(height * 0.82f);
    }

    @Override
    protected void init() {
        Minecraft client = Minecraft.getInstance();
        int center = width / 2;
        int buttonWidth = Math.min(width - 24, mainButtonWidth());
        int buttonHeight = mainButtonHeight();
        int buttonX = center - buttonWidth / 2;
        int buttonY = mainButtonTop();
        int buttonGap = Math.max(5, Math.min(9, Math.round(height * 0.013f)));
        addRenderableWidget(new BayonButton(buttonX, buttonY, buttonWidth, buttonHeight, "play",
                BayonUi.translate("menu.bayonclient.singleplayer"), BayonButton.Style.PRIMARY,
                () -> client.gui.setScreen(new SelectWorldScreen(this))));
        addRenderableWidget(new BayonButton(buttonX, buttonY + buttonHeight + buttonGap, buttonWidth, buttonHeight,
                "globe", BayonUi.translate("menu.bayonclient.multiplayer"), BayonButton.Style.SECONDARY,
                () -> client.gui.setScreen(new JoinMultiplayerScreen(this))));

        int tabsWidth = Math.min(width - 28, Math.max(220, Math.min(330, Math.round(width * 0.34f))));
        int tabGap = Math.max(5, Math.min(12, width / 100));
        int tabWidth = (tabsWidth - tabGap * 2) / 3;
        int tabsLeft = center - (tabWidth * 3 + tabGap * 2) / 2;
        int tabHeight = Math.max(34, Math.min(42, Math.round(height * 0.075f)));
        int tabsY = tabTop();
        addRenderableWidget(new BayonTabButton(tabsLeft, tabsY, tabWidth, tabHeight, "shirt",
                BayonUi.translate("menu.bayonclient.wardrobe"), false,
                () -> client.gui.setScreen(new BayonPlaceholderScreen(this,
                        BayonUi.translate("menu.bayonclient.wardrobe"),
                        BayonUi.translate("menu.bayonclient.wardrobe.description")))));
        addRenderableWidget(new BayonTabButton(tabsLeft + tabWidth + tabGap, tabsY, tabWidth, tabHeight, "bag",
                BayonUi.translate("menu.bayonclient.cosmetic_store"), true,
                () -> client.gui.setScreen(new BayonPlaceholderScreen(this,
                        BayonUi.translate("menu.bayonclient.cosmetic_store"),
                        BayonUi.translate("menu.bayonclient.cosmetic_store.description")))));
        addRenderableWidget(new BayonTabButton(tabsLeft + (tabWidth + tabGap) * 2, tabsY, tabWidth, tabHeight,
                "crown", BayonUi.translate("menu.bayonclient.store"), false,
                () -> client.gui.setScreen(new BayonPlaceholderScreen(this,
                        BayonUi.translate("menu.bayonclient.store"),
                        BayonUi.translate("menu.bayonclient.store.description")))));

        int controlSize = 22;
        int controlGap = 5;
        addRenderableWidget(new BayonButton(12, 12, controlSize, controlSize, "user", Component.empty(),
                BayonButton.Style.SECONDARY, false,
                () -> client.gui.setScreen(new BayonPlaceholderScreen(this,
                        BayonUi.translate("menu.bayonclient.account.title"),
                        BayonUi.translate("menu.bayonclient.account.description")))));
        int right = width - 12;
        addRenderableWidget(new BayonButton(right - controlSize, 12, controlSize, controlSize, "close",
                Component.empty(), BayonButton.Style.SECONDARY, false, this::confirmQuit));
        right -= controlSize + controlGap;
        addRenderableWidget(new BayonButton(right - controlSize, 12, controlSize, controlSize, "minimize",
                Component.empty(), BayonButton.Style.SECONDARY, false,
                () -> GLFW.glfwIconifyWindow(client.getWindow().handle())));
        right -= controlSize + controlGap;
        addRenderableWidget(new BayonButton(right - controlSize, 12, controlSize, controlSize, "options",
                Component.empty(), BayonButton.Style.SECONDARY, false,
                () -> client.gui.setScreen(new OptionsScreen(this, client.options, false))));
    }

    private void confirmQuit() {
        Minecraft client = Minecraft.getInstance();
        client.gui.setScreen(new ConfirmScreen(confirmed -> {
            if (confirmed) client.stop();
            else client.gui.setScreen(this);
        }, BayonUi.translate("menu.bayonclient.quit.confirm.title"),
                BayonUi.translate("menu.bayonclient.quit.confirm.message")));
    }

    @Override
    public void extractBackground(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        BayonBackground.draw(graphics, width, height);
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        drawBrand(graphics);
        drawFooter(graphics);
        super.extractRenderState(graphics, mouseX, mouseY, partialTick);
    }

    private void drawBrand(GuiGraphicsExtractor graphics) {
        long now = System.nanoTime();
        float delta = lastFrameNanos == 0 ? 0 : (now - lastFrameNanos) / 1_000_000_000f;
        lastFrameNanos = now;
        if (BayonConfig.animationsEnabled()) glowPhase += delta * 1.6f;
        float pulse = BayonConfig.animationsEnabled()
                ? 0.5f + 0.5f * (float) Math.sin(glowPhase) : 0.5f;

        int center = width / 2;
        int logoSize = Math.max(72, Math.min(110, Math.round(height * 0.15f)));
        int logoY = Math.round(height * 0.265f);
        int halo = Math.round(5 + pulse * 4);
        RenderUtil.glow(graphics, center - logoSize / 2, logoY, center + logoSize / 2, logoY + logoSize,
                logoSize / 2, 0x1AFFFFFF, 2, halo);
        RenderUtil.texture(graphics, LOGO, center - logoSize / 2, logoY, logoSize, logoSize, 768, 768);

        var font = Minecraft.getInstance().font;
        graphics.centeredText(font, BayonUi.text("BAYON CLIENT"), center, logoY + logoSize + 7, BayonTheme.TEXT);
        graphics.centeredText(font, BayonUi.translate("menu.bayonclient.tagline"),
                center, logoY + logoSize + 20, BayonTheme.MUTED);
    }

    private void drawFooter(GuiGraphicsExtractor graphics) {
        String version = FabricLoader.getInstance().getModContainer(BayonClient.MOD_ID)
                .map(container -> container.getMetadata().getVersion().getFriendlyString())
                .orElse("unknown");
        var font = Minecraft.getInstance().font;
        graphics.text(font, BayonUi.text("BAYON CLIENT  v" + version), 14, height - 16, BayonTheme.MUTED, false);
        graphics.text(font, BayonUi.translate("menu.bayonclient.footer"),
                Math.max(14, width - font.width(BayonUi.translate("menu.bayonclient.footer")) - 14),
                height - 16, BayonTheme.MUTED, false);
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
