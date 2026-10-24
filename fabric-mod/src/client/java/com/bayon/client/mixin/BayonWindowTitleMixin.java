package com.bayon.client.mixin;

import net.minecraft.SharedConstants;
import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Minecraft.class)
public abstract class BayonWindowTitleMixin {
    @Inject(method = "updateTitle", at = @At("TAIL"))
    private void bayon$setWindowTitle(CallbackInfo callback) {
        Minecraft client = (Minecraft) (Object) this;
        client.getWindow().setTitle("Bayon Client " + SharedConstants.getCurrentVersion().name());
    }
}
