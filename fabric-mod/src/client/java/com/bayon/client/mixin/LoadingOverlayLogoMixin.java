package com.bayon.client.mixin;

import com.bayon.client.ui.RenderUtil;
import com.mojang.blaze3d.pipeline.RenderPipeline;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.LoadingOverlay;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.resources.Identifier;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(LoadingOverlay.class)
public abstract class LoadingOverlayLogoMixin {
    @Redirect(method = "extractRenderState",
            at = @At(value = "INVOKE",
                    target = "Lnet/minecraft/client/gui/GuiGraphicsExtractor;fill(IIIII)V",
                    ordinal = 0))
    private void bayon$drawLoadingBackground(GuiGraphicsExtractor graphics,
                                             int left, int top, int right, int bottom, int color) {
        int width = right - left;
        int height = bottom - top;
        Identifier background = Identifier.fromNamespaceAndPath("bayonclient", "textures/gui/background.png");
        graphics.blit(RenderPipelines.GUI_TEXTURED, background, left, top, 0.0f, 0.0f,
                width, height, 1920, 1080);
        RenderUtil.gradient(graphics, left, top, right, bottom, 0x18000000, 0x5A000000);
    }

    @Redirect(method = "extractRenderState",
            at = @At(value = "INVOKE",
                    target = "Lnet/minecraft/client/gui/GuiGraphicsExtractor;blit(Lcom/mojang/blaze3d/pipeline/RenderPipeline;Lnet/minecraft/resources/Identifier;IIFFIIIIIII)V"))
    private void bayon$skipVanillaLoadingLogo(GuiGraphicsExtractor graphics, RenderPipeline pipeline,
                                              Identifier texture, int x, int y, float u, float v,
                                              int width, int height, int regionWidth, int regionHeight,
                                              int textureWidth, int textureHeight, int color) {
    }

    @Inject(method = "extractRenderState", at = @At("TAIL"))
    private void bayon$drawLoadingLogo(GuiGraphicsExtractor graphics, int mouseX, int mouseY,
                                       float partialTick, CallbackInfo callback) {
        int size = Math.max(96, Math.min(160, Math.min(graphics.guiWidth() / 5, graphics.guiHeight() / 3)));
        int x = (graphics.guiWidth() - size) / 2;
        int y = Math.round(graphics.guiHeight() * 0.36f) - size / 2;
        Identifier logo = Identifier.fromNamespaceAndPath("bayonclient", "textures/gui/logo.png");
        RenderUtil.texture(graphics, logo, x, y, size, size, 768, 768);
    }
}
