package com.bayon.clientkotlin.ui

import net.minecraft.client.Minecraft
import net.minecraft.client.gui.GuiGraphicsExtractor
import net.minecraft.client.gui.components.AbstractWidget
import net.minecraft.client.gui.narration.NarrationElementOutput
import net.minecraft.client.input.MouseButtonEvent
import net.minecraft.network.chat.Component
import net.minecraft.client.renderer.RenderPipelines

class BayonMenuButton(
    x: Int,
    y: Int,
    width: Int,
    height: Int,
    private val iconName: String,
    label: Component,
    private val action: () -> Unit,
    private val chevron: Boolean = true,
    private val selected: Boolean = false
) : AbstractWidget(x, y, width, height, label) {
    override fun extractWidgetRenderState(
        graphics: GuiGraphicsExtractor,
        mouseX: Int,
        mouseY: Int,
        partialTick: Float
    ) {
        val x = this.x
        val y = this.y
        val right = x + width
        val bottom = y + height
        val highlighted = active && (isHoveredOrFocused() || selected)
        val fill = if (highlighted) BayonStyle.PANEL_HOVER else BayonStyle.PANEL
        val border = if (highlighted) BayonStyle.ACCENT else BayonStyle.BORDER

        graphics.fill(x, y, right, bottom, fill)
        graphics.outline(x, y, width, height, border)
        graphics.fill(x + 1, y + 1, right - 1, y + 2, 0x40FFFFFF)

        val iconSize = minOf(24, height - 6).coerceAtLeast(16)
        val iconX = if (width < 80) x + (width - iconSize) / 2 else x + 13
        val iconY = y + (height - iconSize) / 2
        graphics.blit(
            RenderPipelines.GUI_TEXTURED,
            BayonStyle.icon(iconName),
            iconX,
            iconY,
            0.0f,
            0.0f,
            iconSize,
            iconSize,
            64,
            64,
            64,
            64
        )

        val font = Minecraft.getInstance().font
        val textY = y + (height - font.lineHeight) / 2
        if (width >= 80) {
            val centerOffset = if (chevron) 0 else 7
            graphics.centeredText(font, message, x + width / 2 + centerOffset, textY, BayonStyle.TEXT)
        }
        if (chevron) {
            graphics.text(font, BayonStyle.text(">"), right - 20, textY, BayonStyle.TEXT, false)
        }
    }

    override fun onClick(event: MouseButtonEvent, doubleClick: Boolean) {
        super.onClick(event, doubleClick)
        if (active && visible) action()
    }

    override fun updateWidgetNarration(output: NarrationElementOutput) {
        defaultButtonNarrationText(output)
    }
}
