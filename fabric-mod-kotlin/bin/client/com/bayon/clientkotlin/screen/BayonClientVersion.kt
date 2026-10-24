package com.bayon.clientkotlin.screen

import net.fabricmc.loader.api.FabricLoader

object BayonClientVersion {
    val value: String
        get() = FabricLoader.getInstance()
            .getModContainer("bayonclientkotlin")
            .map { it.metadata.version.friendlyString }
            .orElse("unknown")
}
