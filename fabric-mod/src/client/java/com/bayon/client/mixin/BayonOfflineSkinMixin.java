package com.bayon.client.mixin;

import com.bayon.client.skin.BayonOfflineSkin;
import com.mojang.authlib.GameProfile;
import net.minecraft.client.resources.SkinManager;
import net.minecraft.world.entity.player.PlayerSkin;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

import java.util.function.Supplier;

@Mixin(SkinManager.class)
public abstract class BayonOfflineSkinMixin {
    @Inject(method = "createLookup", at = @At("RETURN"))
    private void bayon$useOfflineProfileSkin(GameProfile profile, boolean requireSecure,
                                             CallbackInfoReturnable<Supplier<PlayerSkin>> callback) {
        callback.setReturnValue(BayonOfflineSkin.wrap(profile, callback.getReturnValue()));
    }
}
