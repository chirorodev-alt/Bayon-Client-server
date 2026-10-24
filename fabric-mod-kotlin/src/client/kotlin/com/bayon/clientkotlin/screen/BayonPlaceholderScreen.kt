package com.bayon.clientkotlin.screen

import com.bayon.clientkotlin.ui.BayonStyle
import net.minecraft.client.Minecraft
import net.minecraft.client.gui.GuiGraphicsExtractor
import net.minecraft.client.gui.components.Button
import net.minecraft.client.gui.screens.Screen
import net.minecraft.client.renderer.RenderPipelines
import net.minecraft.network.chat.Component
import net.minecraft.resources.Identifier

class BayonPlaceholderScreen(
    private val parent: Screen,
    private val heading: Component,
    private val description: Component
) : Screen(heading) {
    private val background = Identifier.fromNamespaceAndPath("bayonclientkotlin", "textures/gui/background.png")

    override fun init() {
        val buttonWidth = minOf(220, width - 32)
        addRenderableWidget(
            Button.builder(BayonStyle.translate("menu.bayonclient.back")) {
                Minecraft.getInstance().gui.setScreen(parent)
            }.bounds(width / 2 - buttonWidth / 2, height - 70, buttonWidth, 28).build()
        )
    }

    override fun extractBackground(graphics: GuiGraphicsExtractor, mouseX: Int, mouseY: Int, partialTick: Float) {
        graphics.blit(
            RenderPipelines.GUI_TEXTURED,
            background,
            0,
            0,
            0.0f,
            0.0f,
            width,
            height,
            1920,
            1080
        )
        graphics.fillGradient(0, 0, width, height, 0x30000000, 0x90000000.toInt())
    }

    override fun extractRenderState(
        graphics: GuiGraphicsExtractor,
        mouseX: Int,
        mouseY: Int,
        partialTick: Float
    ) {
        val font = Minecraft.getInstance().font
        graphics.centeredText(font, heading, width / 2, height / 2 - 22, BayonStyle.TEXT)
        graphics.centeredText(font, description, width / 2, height / 2 + 2, BayonStyle.MUTED)
        super.extractRenderState(graphics, mouseX, mouseY, partialTick)
    }
}
