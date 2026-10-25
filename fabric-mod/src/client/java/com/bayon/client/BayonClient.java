package com.bayon.client;

import com.bayon.client.config.HudConfig;
import com.bayon.client.config.BayonConfig;
import com.bayon.client.hud.BayonHud;
import com.bayon.client.hud.BayonCustomizationScreen;
import com.bayon.client.hud.BayonMainMenuScreen;
import com.bayon.client.ui.BayonMainMenu;
import com.bayon.client.cape.BayonCapeLayer;
import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.fabricmc.fabric.api.client.rendering.v1.LivingEntityRenderLayerRegistrationCallback;
import net.fabricmc.fabric.api.client.rendering.v1.ModelLayerRegistry;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.client.model.player.PlayerCapeModel;
import net.minecraft.client.KeyMapping;
import net.minecraft.SharedConstants;
import net.minecraft.resources.Identifier;
import org.lwjgl.glfw.GLFW;

public final class BayonClient implements ClientModInitializer {
    public static final String MOD_ID = "bayonclient";
    private static final KeyMapping.Category CATEGORY = KeyMapping.Category.register(
            Identifier.fromNamespaceAndPath(MOD_ID, "hud")
    );
    private static KeyMapping openEditor;
    private static boolean windowTitleInitialized;

    @Override
    public void onInitializeClient() {
        BayonConfig.load();
        HudConfig.load();
        BayonHud.initialize();
        ModelLayerRegistry.registerModelLayer(BayonCapeLayer.MODEL_LAYER, PlayerCapeModel::createCapeLayer);
        LivingEntityRenderLayerRegistrationCallback.EVENT.register((entityType, renderer, layers, context) -> {
            if (renderer instanceof AvatarRenderer<?> avatarRenderer) {
                layers.register(new BayonCapeLayer(avatarRenderer, context.getModelSet()));
            }
        });
        openEditor = KeyMappingHelper.registerKeyMapping(new KeyMapping(
                "key.bayonclient.open_hud_editor",
                InputConstants.Type.KEYSYM,
                GLFW.GLFW_KEY_RIGHT_SHIFT,
                CATEGORY
        ));
        HudElementRegistry.attachElementBefore(
                VanillaHudElements.CHAT,
                Identifier.fromNamespaceAndPath(MOD_ID, "hud"),
                BayonHud::render
        );
        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            if (!windowTitleInitialized) {
                client.getWindow().setTitle("Bayon Client " + SharedConstants.getCurrentVersion().name());
                windowTitleInitialized = true;
            }
            if (BayonConfig.customTitleScreenEnabled()
                    && client.gui.screen() instanceof net.minecraft.client.gui.screens.TitleScreen
                    && !(client.gui.screen() instanceof BayonMainMenu)) {
                client.gui.setScreen(new BayonMainMenu());
                return;
            }
            while (openEditor.consumeClick()) {
                if (client.player != null) {
                    client.gui.setScreen(new BayonCustomizationScreen(client.gui.screen()));
                }
            }
            BayonCustomizationScreen.tickKeybinds(client);
            BayonHud.tick(client);
        });
    }
}
