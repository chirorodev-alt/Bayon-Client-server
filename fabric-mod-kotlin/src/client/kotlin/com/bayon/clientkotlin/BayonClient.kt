package com.bayon.clientkotlin

import com.bayon.clientkotlin.screen.BayonMainMenuScreen
import net.fabricmc.api.ClientModInitializer
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents
import net.minecraft.SharedConstants
import net.minecraft.client.gui.screens.TitleScreen

object BayonClient : ClientModInitializer {
    private var windowTitleSet = false

    override fun onInitializeClient() {
        ClientTickEvents.END_CLIENT_TICK.register { client ->
            if (!windowTitleSet) {
                client.window.setTitle(WINDOW_TITLE)
                windowTitleSet = true
            }

            val currentScreen = client.gui.screen()
            if (currentScreen is TitleScreen) {
                client.gui.setScreen(BayonMainMenuScreen())
            }
        }
    }

    private val WINDOW_TITLE: String
        get() = "Bayon Client ${SharedConstants.getCurrentVersion().name()}"
}
