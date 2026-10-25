package com.bayon.client.mixin;

import com.bayon.client.config.BayonConfig;
import com.bayon.client.ui.BayonMainMenu;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.TitleScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Intercepts vanilla TitleScreen initialization and replaces it with BayonMainMenu. */
@Mixin(TitleScreen.class)
public abstract class TitleScreenMixin {
    @Inject(method = "init", at = @At("HEAD"), cancellable = true)
    private void bayon$openCustomMainMenu(CallbackInfo ci) {
        if (BayonConfig.customTitleScreenEnabled()) {
            Minecraft client = Minecraft.getInstance();
            if (!(client.gui.screen() instanceof BayonMainMenu)) {
                client.gui.setScreen(new BayonMainMenu());
                ci.cancel();
            }
        }
    }
}

