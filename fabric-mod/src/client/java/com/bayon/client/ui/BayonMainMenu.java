package com.bayon.client.ui;

import com.bayon.client.BayonClient;
import com.bayon.client.config.BayonConfig;
import com.bayon.client.hud.BayonCustomizationScreen;
import com.bayon.client.hud.BayonPartnerServersScreen;
import com.bayon.client.hud.BayonPlaceholderScreen;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.ConfirmScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.gui.screens.options.OptionsScreen;
import net.minecraft.client.gui.screens.packs.PackSelectionScreen;
import net.minecraft.client.gui.screens.worldselection.SelectWorldScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

import java.lang.reflect.Method;

/**
 * Bayon Client custom in-game main menu matching the Figma design:
 * - Angkor Wat sunset background
 * - Top-right player profile pill and square shortcut buttons
 * - Centered vertical action buttons with 15px corner radius
 * - Red Quit Game button
 * - Centered version footer
 */
public class BayonMainMenu extends Screen {
    private static final Identifier LOGO = Identifier.fromNamespaceAndPath("bayonclient", "textures/gui/logo.png");
    private long lastFrameNanos;
    private float glowPhase;

    public BayonMainMenu() {
        super(Component.literal("Bayon Client"));
    }

    @Override
    protected void init() {
        super.init();
        Minecraft client = Minecraft.getInstance();
        int center = width / 2;

        // Button sizing & layout: 15px corner radius styled glass buttons
        int buttonWidth = Math.max(220, Math.min(270, Math.round(width * 0.28f)));
        int buttonHeight = Math.max(34, Math.min(40, Math.round(height * 0.065f)));
        int buttonGap = Math.max(6, Math.min(9, Math.round(height * 0.013f)));

        int logoSize = Math.max(88, Math.min(148, Math.round(height * 0.22f)));
        int logoY = Math.max(10, Math.round(height * 0.08f));

        int stackTop = Math.max(logoY + logoSize + 10, Math.round(height * 0.39f));
        int quitGap = Math.max(12, Math.min(18, Math.round(height * 0.024f)));
        int quitWidth = Math.max(150, Math.min(buttonWidth, 190));
        int quitHeight = Math.max(32, buttonHeight - 2);

        int totalHeight = stackTop + (buttonHeight + buttonGap) * 4 + quitGap + quitHeight + 24;
        if (totalHeight > height) {
            int overflow = totalHeight - height;
            stackTop = Math.max(logoY + logoSize + 4, stackTop - overflow);
            buttonGap = Math.max(4, buttonGap - 2);
        }

        int buttonX = center - buttonWidth / 2;
        int quitX = center - quitWidth / 2;

        // 1. Singleplayer
        addRenderableWidget(new BayonButton(buttonX, stackTop, buttonWidth, buttonHeight, "user",
                Component.translatable("menu.bayonclient.singleplayer"), BayonButton.Style.SECONDARY, false,
                () -> client.gui.setScreen(new SelectWorldScreen(this))));

        // 2. Multiplayer
        addRenderableWidget(new BayonButton(buttonX, stackTop + (buttonHeight + buttonGap), buttonWidth, buttonHeight, "globe",
                Component.translatable("menu.bayonclient.multiplayer"), BayonButton.Style.SECONDARY, false,
                () -> client.gui.setScreen(new JoinMultiplayerScreen(this))));

        // 3. Partner Server
        addRenderableWidget(new BayonButton(buttonX, stackTop + (buttonHeight + buttonGap) * 2, buttonWidth, buttonHeight, "crown",
                Component.translatable("menu.bayonclient.partner_server"), BayonButton.Style.SECONDARY, false,
                () -> client.gui.setScreen(new BayonPartnerServersScreen(this))));

        // 4. Cosmetic
        addRenderableWidget(new BayonButton(buttonX, stackTop + (buttonHeight + buttonGap) * 3, buttonWidth, buttonHeight, "bag",
                Component.translatable("menu.bayonclient.cosmetic"), BayonButton.Style.SECONDARY, false,
                () -> client.gui.setScreen(new BayonPlaceholderScreen(this,
                        BayonUi.translate("menu.bayonclient.wardrobe"),
                        BayonUi.translate("menu.bayonclient.wardrobe.description")))));

        // 5. Red Quit Game button
        int quitY = stackTop + (buttonHeight + buttonGap) * 4 + quitGap;
        addRenderableWidget(new BayonButton(quitX, quitY, quitWidth, quitHeight, null,
                Component.literal("QUIT GAME"), BayonButton.Style.DANGER, false, this::confirmQuit));

        // Top-right header: Profile button + 4 square shortcut buttons
        int shortcutSize = 30;
        int shortcutGap = 6;
        int top = 12;
        int right = width - 14;

        // Shortcut 4: Resource Packs
        BayonButton resPackBtn = new BayonButton(right - shortcutSize, top, shortcutSize, shortcutSize, "cube",
                Component.empty(), BayonButton.Style.SECONDARY, false,
                () -> client.gui.setScreen(new PackSelectionScreen(client.getResourcePackRepository(),
                        repository -> {
                            client.options.updateResourcePacks(repository);
                            client.gui.setScreen(this);
                        }, client.getResourcePackDirectory(), Component.translatable("resourcePack.title"))));
        resPackBtn.setTooltip(Tooltip.create(Component.translatable("resourcePack.title")));
        addRenderableWidget(resPackBtn);
        right -= shortcutSize + shortcutGap;

        // Shortcut 3: Options
        BayonButton optionsBtn = new BayonButton(right - shortcutSize, top, shortcutSize, shortcutSize, "options",
                Component.empty(), BayonButton.Style.SECONDARY, false,
                () -> client.gui.setScreen(new OptionsScreen(this, client.options, false)));
        optionsBtn.setTooltip(Tooltip.create(Component.translatable("menu.bayonclient.options")));
        addRenderableWidget(optionsBtn);
        right -= shortcutSize + shortcutGap;

        // Shortcut 2: Mods
        BayonButton modsBtn = new BayonButton(right - shortcutSize, top, shortcutSize, shortcutSize, "bag",
                Component.empty(), BayonButton.Style.SECONDARY, false, this::openModsScreen);
        modsBtn.setTooltip(Tooltip.create(Component.translatable("menu.bayonclient.mods")));
        addRenderableWidget(modsBtn);
        right -= shortcutSize + shortcutGap;

        // Shortcut 1: Bayon Customization / Wardrobe
        BayonButton customBtn = new BayonButton(right - shortcutSize, top, shortcutSize, shortcutSize, "shirt",
                Component.empty(), BayonButton.Style.SECONDARY, false,
                () -> client.gui.setScreen(new BayonCustomizationScreen(this)));
        customBtn.setTooltip(Tooltip.create(BayonUi.translate("menu.bayonclient.wardrobe")));
        addRenderableWidget(customBtn);
        right -= shortcutSize + shortcutGap;

        // Profile button: avatar + username (15px corner radius)
        String username = client.getUser().getName();
        int profileWidth = Math.max(110, Math.min(160, client.font.width(username) + 38));
        BayonProfileButton profileBtn = new BayonProfileButton(right - profileWidth, top, profileWidth, shortcutSize,
                () -> client.gui.setScreen(new BayonPlaceholderScreen(this,
                        BayonUi.translate("menu.bayonclient.account.title"),
                        BayonUi.translate("menu.bayonclient.account.description"))));
        profileBtn.setTooltip(Tooltip.create(Component.literal(username)));
        addRenderableWidget(profileBtn);
    }

    private void openModsScreen() {
        Minecraft client = Minecraft.getInstance();
        if (FabricLoader.getInstance().isModLoaded("modmenu")) {
            try {
                Class<?> apiClass = Class.forName("com.terraformersmc.modmenu.api.ModMenuApi");
                Method method = apiClass.getMethod("createModsScreen", Screen.class);
                Screen screen = (Screen) method.invoke(null, this);
                client.gui.setScreen(screen);
                return;
            } catch (Throwable ignored) {}
        }
        client.gui.setScreen(new BayonPlaceholderScreen(this,
                Component.translatable("menu.bayonclient.mods"),
                Component.translatable("menu.bayonclient.mods.description")));
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
        int logoSize = Math.max(88, Math.min(148, Math.round(height * 0.22f)));
        int logoY = Math.max(10, Math.round(height * 0.08f));
        int halo = Math.round(6 + pulse * 5);
        RenderUtil.glow(graphics, center - logoSize / 2, logoY, center + logoSize / 2, logoY + logoSize,
                logoSize / 2, 0x243D9BC4, 2, halo);
        RenderUtil.texture(graphics, LOGO, center - logoSize / 2, logoY, logoSize, logoSize, 768, 768);
    }

    private void drawFooter(GuiGraphicsExtractor graphics) {
        String version = FabricLoader.getInstance().getModContainer(BayonClient.MOD_ID)
                .map(container -> container.getMetadata().getVersion().getFriendlyString())
                .orElse("0.1.8");
        var font = Minecraft.getInstance().font;
        Component text = Component.literal("Bayon Client v" + version + " • Fabric 26.2");
        int textWidth = font.width(text);
        graphics.text(font, text, (width - textWidth) / 2, height - 16, 0xC0D6E2EA, true);
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
