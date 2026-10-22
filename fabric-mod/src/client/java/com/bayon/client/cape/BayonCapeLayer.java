package com.bayon.client.cape;

import com.bayon.client.config.HudConfig;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.model.geom.EntityModelSet;
import net.minecraft.client.model.player.PlayerCapeModel;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.resources.Identifier;

public final class BayonCapeLayer extends RenderLayer<AvatarRenderState, PlayerModel> {
    public static final Identifier TEXTURE = Identifier.fromNamespaceAndPath(
            "bayonclient", "textures/cape/bayon_cape.png"
    );
    public static final ModelLayerLocation MODEL_LAYER = new ModelLayerLocation(
            Identifier.fromNamespaceAndPath("bayonclient", "cape"), "main"
    );

    private final PlayerCapeModel capeModel;

    public BayonCapeLayer(RenderLayerParent<AvatarRenderState, PlayerModel> parent, EntityModelSet models) {
        super(parent);
        this.capeModel = new PlayerCapeModel(models.bakeLayer(MODEL_LAYER));
    }

    @Override
    public void submit(PoseStack poseStack, SubmitNodeCollector collector, int packedLight,
                       AvatarRenderState state, float yRot, float xRot) {
        if (!HudConfig.capeEnabled() || state.isInvisible || state.isSpectator) return;
        capeModel.setupAnim(state);
        poseStack.pushPose();
        collector.submitModel(
                capeModel,
                state,
                poseStack,
                RenderTypes.entitySolid(TEXTURE),
                packedLight,
                OverlayTexture.NO_OVERLAY,
                state.outlineColor,
                null
        );
        poseStack.popPose();
    }
}
