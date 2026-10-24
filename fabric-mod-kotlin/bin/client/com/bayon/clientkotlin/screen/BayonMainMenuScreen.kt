package com.bayon.clientkotlin.screen

import com.bayon.clientkotlin.ui.BayonMenuButton
import com.bayon.clientkotlin.ui.BayonStyle
import net.minecraft.client.Minecraft
import net.minecraft.client.gui.GuiGraphicsExtractor
import net.minecraft.client.gui.screens.ConfirmScreen
import net.minecraft.client.gui.screens.Screen
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen
import net.minecraft.client.gui.screens.options.OptionsScreen
import net.minecraft.client.gui.screens.worldselection.SelectWorldScreen
import net.minecraft.client.renderer.RenderPipelines
import net.minecraft.network.chat.Component
import net.minecraft.resources.Identifier
import org.lwjgl.glfw.GLFW

class BayonMainMenuScreen : Screen(BayonStyle.translate("menu.bayonclient.title")) {
    private val logo = Identifier.fromNamespaceAndPath("bayonclientkotlin", "textures/gui/logo.png")
    private val background = Identifier.fromNamespaceAndPath("bayonclientkotlin", "textures/gui/background.png")

    override fun init() {
        val client = Minecraft.getInstance()
        val center = width / 2
        val buttonWidth = minOf(width - 32, maxOf(190, minOf(340, (width * 0.34f).toInt())))
        val buttonHeight = maxOf(28, minOf(38, (height * 0.065f).toInt()))
        val buttonX = center - buttonWidth / 2
        val buttonY = (height * 0.49f).toInt()
        val gap = maxOf(6, (height * 0.014f).toInt())

        addRenderableWidget(
            BayonMenuButton(
                buttonX,
                buttonY,
                buttonWidth,
                buttonHeight,
                "play",
                BayonStyle.translate("menu.bayonclient.singleplayer"),
                { client.gui.setScreen(SelectWorldScreen(this)) }
            )
        )
        addRenderableWidget(
            BayonMenuButton(
                buttonX,
                buttonY + buttonHeight + gap,
                buttonWidth,
                buttonHeight,
                "globe",
                BayonStyle.translate("menu.bayonclient.multiplayer"),
                { client.gui.setScreen(JoinMultiplayerScreen(this)) }
            )
        )

        val tabWidth = minOf(150, maxOf(76, (width * 0.12f).toInt()))
        val tabHeight = 48
        val tabGap = 8
        val tabsX = center - (tabWidth * 3 + tabGap * 2) / 2
        val tabsY = (height * 0.79f).toInt()
        val tabItems = listOf(
            Triple("shirt", "menu.bayonclient.wardrobe", "menu.bayonclient.wardrobe.description"),
            Triple("bag", "menu.bayonclient.cosmetic_store", "menu.bayonclient.cosmetic_store.description"),
            Triple("crown", "menu.bayonclient.store", "menu.bayonclient.store.description")
        )
        tabItems.forEachIndexed { index, item ->
            addRenderableWidget(
                BayonMenuButton(
                    tabsX + index * (tabWidth + tabGap),
                    tabsY,
                    tabWidth,
                    tabHeight,
                    item.first,
                    BayonStyle.translate(item.second),
                    {
                        client.gui.setScreen(
                            BayonPlaceholderScreen(
                                this,
                                BayonStyle.translate(item.second),
                                BayonStyle.translate(item.third)
                            )
                        )
                    },
                    chevron = false,
                    selected = index == 1
                )
            )
        }

        val controlSize = 28
        val controlGap = 6
        addRenderableWidget(
            BayonMenuButton(
                14, 14, controlSize, controlSize, "user", Component.empty(),
                {
                    client.gui.setScreen(
                        BayonPlaceholderScreen(
                            this,
                            BayonStyle.translate("menu.bayonclient.account.title"),
                            BayonStyle.translate("menu.bayonclient.account.description")
                        )
                    )
                },
                chevron = false
            )
        )
        var right = width - 14
        addRenderableWidget(
            BayonMenuButton(
                right - controlSize, 14, controlSize, controlSize, "close", Component.empty(),
                { confirmQuit() }, chevron = false
            )
        )
        right -= controlSize + controlGap
        addRenderableWidget(
            BayonMenuButton(
                right - controlSize, 14, controlSize, controlSize, "minimize", Component.empty(),
                { GLFW.glfwIconifyWindow(client.window.handle()) }, chevron = false
            )
        )
        right -= controlSize + controlGap
        addRenderableWidget(
            BayonMenuButton(
                right - controlSize, 14, controlSize, controlSize, "options", Component.empty(),
                { client.gui.setScreen(OptionsScreen(this, client.options, false)) },
                chevron = false
            )
        )
    }

    private fun confirmQuit() {
        val client = Minecraft.getInstance()
        client.gui.setScreen(
            ConfirmScreen(
                { confirmed ->
                    if (confirmed) client.stop() else client.gui.setScreen(this)
                },
                BayonStyle.translate("menu.bayonclient.quit.confirm.title"),
                BayonStyle.translate("menu.bayonclient.quit.confirm.message")
            )
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
        graphics.fillGradient(0, 0, width, height, 0x20000000, 0x80000000.toInt())
        graphics.fill(0, 0, width, 52, 0x70000000)
    }

    override fun extractRenderState(
        graphics: GuiGraphicsExtractor,
        mouseX: Int,
        mouseY: Int,
        partialTick: Float
    ) {
        drawBrand(graphics)
        drawFooter(graphics)
        super.extractRenderState(graphics, mouseX, mouseY, partialTick)
    }

    private fun drawBrand(graphics: GuiGraphicsExtractor) {
        val size = maxOf(72, minOf(112, (height * 0.16f).toInt()))
        val x = (width - size) / 2
        val y = (height * 0.20f).toInt()
        graphics.blit(
            RenderPipelines.GUI_TEXTURED,
            logo,
            x,
            y,
            0.0f,
            0.0f,
            size,
            size,
            768,
            768,
            768,
            768
        )

        val font = Minecraft.getInstance().font
        graphics.centeredText(font, BayonStyle.text("BAYON CLIENT"), width / 2, y + size + 7, BayonStyle.TEXT)
        graphics.centeredText(
            font,
            BayonStyle.translate("menu.bayonclient.tagline"),
            width / 2,
            y + size + 20,
            BayonStyle.MUTED
        )
    }

    private fun drawFooter(graphics: GuiGraphicsExtractor) {
        val version = "v${BayonClientVersion.value}"
        val font = Minecraft.getInstance().font
        graphics.text(font, BayonStyle.text("BAYON CLIENT $version"), 14, height - 18, BayonStyle.MUTED, false)
        val footer = BayonStyle.translate("menu.bayonclient.footer")
        graphics.text(font, footer, width - font.width(footer) - 14, height - 18, BayonStyle.MUTED, false)
    }

    override fun shouldCloseOnEsc(): Boolean = false

    override fun isPauseScreen(): Boolean = false
}
