package com.bayon.client.skin;

import com.bayon.client.BayonClient;
import com.mojang.authlib.GameProfile;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.SkinTextureDownloader;
import net.minecraft.core.ClientAsset;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.player.PlayerSkin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Supplier;

public final class BayonOfflineSkin {
    private static final Logger LOGGER = LoggerFactory.getLogger(BayonOfflineSkin.class);
    private static final Identifier TEXTURE_ID = Identifier.fromNamespaceAndPath(
            BayonClient.MOD_ID, "skins/offline-profile"
    );
    private static final AtomicBoolean LOADING = new AtomicBoolean();
    private static volatile PlayerSkin customSkin;

    private BayonOfflineSkin() {}

    public static Supplier<PlayerSkin> wrap(GameProfile profile, Supplier<PlayerSkin> original) {
        Minecraft client = Minecraft.getInstance();
        if (!profile.name().equalsIgnoreCase(client.getUser().getName())) {
            return original;
        }

        Path skinDirectory = client.gameDirectory.toPath().resolve("config").resolve(BayonClient.MOD_ID);
        Path standardSkin = skinDirectory.resolve("offline-skin.png");
        Path legacySkin = skinDirectory.resolve("offline-skin-legacy.png");
        Path skinPath = Files.isRegularFile(standardSkin) ? standardSkin : legacySkin;
        if (!Files.isRegularFile(skinPath)) {
            return original;
        }

        if (customSkin == null && LOADING.compareAndSet(false, true)) {
            try {
                boolean legacy = skinPath.equals(legacySkin);
                SkinTextureDownloader downloader = new SkinTextureDownloader(
                        Proxy.NO_PROXY, client.getTextureManager(), client
                );
                CompletableFuture<ClientAsset.Texture> texture = downloader.downloadAndRegisterSkin(
                        TEXTURE_ID, skinPath, "Bayon offline profile", legacy
                );
                texture.thenApply(loadedTexture -> {
                    PlayerSkin fallback = original.get();
                    return PlayerSkin.insecure(
                            loadedTexture, fallback.cape(), fallback.elytra(), fallback.model()
                    );
                }).whenComplete((skin, error) -> {
                    if (error != null) {
                        LOGGER.warn("Could not load the Bayon offline profile skin.", error);
                        return;
                    }
                    customSkin = skin;
                });
            } catch (RuntimeException error) {
                LOGGER.warn("Could not start loading the Bayon offline profile skin.", error);
            }
        }

        return () -> {
            PlayerSkin loadedSkin = customSkin;
            return loadedSkin != null ? loadedSkin : original.get();
        };
    }
}
