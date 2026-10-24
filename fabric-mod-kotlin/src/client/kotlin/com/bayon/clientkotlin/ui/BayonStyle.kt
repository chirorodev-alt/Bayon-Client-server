package com.bayon.clientkotlin.ui

import net.minecraft.network.chat.Component
import net.minecraft.network.chat.FontDescription
import net.minecraft.resources.Identifier

object BayonStyle {
    val FONT = FontDescription.Resource(Identifier.fromNamespaceAndPath("bayonclientkotlin", "bayon_pixel"))

    const val TEXT = 0xFFF1F1F1.toInt()
    const val MUTED = 0xFFAAAAAA.toInt()
    const val BORDER = 0xFF777777.toInt()
    const val PANEL = 0xB5111111.toInt()
    const val PANEL_HOVER = 0xD6272727.toInt()
    const val ACCENT = 0xFFE4E4E4.toInt()

    fun text(value: String): Component =
        Component.literal(value).withStyle { style -> style.withFont(FONT) }

    fun translate(key: String): Component =
        Component.translatable(key).withStyle { style -> style.withFont(FONT) }

    fun icon(name: String): Identifier =
        Identifier.fromNamespaceAndPath("bayonclientkotlin", "textures/gui/icons/$name.png")
}
