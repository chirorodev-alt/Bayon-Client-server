package com.bayon.client.hud;

import com.bayon.client.config.HudConfig;
import com.bayon.client.config.HudConfig.Widget;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.world.phys.Vec3;
import com.bayon.client.ui.BayonButton;
import com.bayon.client.ui.BayonUi;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Glass-styled module manager, HUD layout editor and cosmetic controls. */
public final class BayonCustomizationScreen extends Screen {
    private static final int CARD_HEIGHT = 78;
    private static final int CARD_GAP = 9;
    private final Screen parent;
    private int page;
    private String category = "All";
    private String dragging;
    private double lastMouseX;
    private double lastMouseY;

    public BayonCustomizationScreen(Screen parent) {
        this(parent, 0);
    }

    public BayonCustomizationScreen(Screen parent, int initialPage) {
        super(BayonUi.text("Bayon Client"));
        this.parent = parent;
        this.page = initialPage;
    }

    private int panelWidth() { return Math.min(1240, width - 28); }
    private int panelHeight() { return Math.min(700, height - 28); }
    private int panelLeft() { return Math.max(14, (width - panelWidth()) / 2); }
    private int panelTop() { return Math.max(14, (height - panelHeight()) / 2); }
    private int contentLeft() { return panelLeft() + 174; }
    private int contentWidth() { return panelWidth() - 194; }
    private boolean hasPreviewPanel() { return panelWidth() >= 900; }
    private int previewWidth() { return hasPreviewPanel() ? 304 : 0; }
    private int cardAreaWidth() { return contentWidth() - (hasPreviewPanel() ? previewWidth() + 14 : 0); }
    private int cardColumns() { return cardAreaWidth() >= 600 ? 2 : 1; }
    private int cardWidth() { return (cardAreaWidth() - (cardColumns() - 1) * 9) / cardColumns(); }
    private int cardStartY() { return panelTop() + 110; }
    public boolean showHudPreview() { return page == 3; }

    @Override
    protected void init() {
        int left = panelLeft();
        int top = panelTop();
        int bottom = top + panelHeight() - 42;

        addRenderableWidget(navButton("Modules", 0, left, top));
        addRenderableWidget(navButton("HUD Layout", 3, left, top));
        addRenderableWidget(navButton("Cosmetics", 1, left, top));
        addRenderableWidget(navButton("Appearance", 2, left, top));

        if (page == 0) {
            String[] filters = {"All", "Combat", "Movement", "Visual", "Misc"};
            int filterX = contentLeft();
            for (String filter : filters) {
                int buttonWidth = filter.equals("Movement") ? 80 : 64;
                addRenderableWidget(new BayonButton(filterX, top + 66, buttonWidth, 22, BayonUi.text(filter), BayonButton.Style.COMPACT, () -> {
                    category = filter;
                    rebuildScreen();
                }).selected(category.equals(filter)));
                filterX += buttonWidth + 7;
            }

            List<String> modules = filteredModules();
            for (int index = 0; index < modules.size(); index++) {
                String id = modules.get(index);
                int column = index % cardColumns();
                int row = index / cardColumns();
                int x = contentLeft() + column * (cardWidth() + 9);
                int y = cardStartY() + row * (CARD_HEIGHT + CARD_GAP);
                Widget widget = HudConfig.get(id);
                addRenderableWidget(new BayonButton(x + cardWidth() - 58, y + 27, 48, 22, BayonUi.text(widget.enabled ? "ON" : "OFF"), BayonButton.Style.COMPACT, () -> {
                    widget.enabled = !widget.enabled;
                    HudConfig.save();
                    rebuildScreen();
                }).selected(widget.enabled));
            }
        } else if (page == 1 || page == 4) {
            int x = contentLeft();
            addRenderableWidget(new BayonButton(x, top + 82, Math.min(420, contentWidth()), 30, BayonUi.text("Bayon Cape   -   "
                    + (page == 4 ? "FREE COSMETIC" : HudConfig.capeEnabled() ? "EQUIPPED" : "OFF")), BayonButton.Style.SECONDARY,
                    () -> { HudConfig.setCapeEnabled(page == 4 || !HudConfig.capeEnabled()); rebuildScreen(); }).selected(HudConfig.capeEnabled()));
        } else if (page == 2) {
            int x = contentLeft();
            addRenderableWidget(new BayonButton(x, top + 78, Math.min(420, contentWidth()), 28, BayonUi.text("Theme   -   " + HudConfig.themeName() + "   ›"), BayonButton.Style.SECONDARY,
                    () -> { HudConfig.cycleTheme(); rebuildScreen(); }));
            addRenderableWidget(new BayonButton(x, top + 116, Math.min(420, contentWidth()), 28, BayonUi.text("Background   -   " + HudConfig.backgroundName() + "   ›"), BayonButton.Style.SECONDARY,
                    () -> { HudConfig.cycleBackground(); rebuildScreen(); }));
        } else {
            addRenderableWidget(new BayonButton(contentLeft(), top + 84, Math.min(300, contentWidth()), 26, BayonUi.text("Reset HUD positions and scale"), BayonButton.Style.SECONDARY, () -> {
                HudConfig.reset(); rebuildScreen();
            }));
        }

        addRenderableWidget(new BayonButton(left + panelWidth() - 96, bottom, 82, 24, BayonUi.text("Done"), BayonButton.Style.PRIMARY, this::onClose));
    }

    private BayonButton navButton(String title, int targetPage, int left, int top) {
        int index = switch (targetPage) { case 3 -> 1; case 1 -> 2; case 2 -> 3; default -> 0; };
        return new BayonButton(left + 12, top + 68 + index * 32, 146, 25, BayonUi.text(title), BayonButton.Style.SECONDARY, () -> {
            page = targetPage;
            rebuildScreen();
        }).selected(page == targetPage);
    }

    private void rebuildScreen() {
        clearWidgets();
        init();
    }

    private List<String> filteredModules() {
        List<String> ids = new ArrayList<>();
        for (String id : HudConfig.widgets().keySet()) {
            if (category.equals("All") || moduleCategory(id).equals(category)) ids.add(id);
        }
        return ids;
    }

    private static String moduleCategory(String id) {
        return switch (id) {
            case "cps" -> "Combat";
            case "keystrokes" -> "Movement";
            case "ping" -> "Misc";
            default -> "Visual";
        };
    }

    private static String label(String id) {
        return switch (id) {
            case "fps" -> "FPS Counter";
            case "keystrokes" -> "Keystrokes";
            case "cps" -> "CPS Counter";
            case "coordinates" -> "Coordinates";
            case "ping" -> "Ping Display";
            case "direction" -> "Direction";
            case "armor" -> "Armor Status";
            case "effects" -> "Potion Effects";
            default -> id;
        };
    }

    private static String description(String id) {
        return switch (id) {
            case "fps" -> "Displays your current FPS in-game.";
            case "keystrokes" -> "Shows movement and mouse buttons.";
            case "cps" -> "Counts left and right clicks per second.";
            case "coordinates" -> "Shows your current position (X, Y, Z).";
            case "ping" -> "Shows your network latency.";
            case "direction" -> "Shows the direction you are facing.";
            case "armor" -> "Displays equipped armor pieces.";
            case "effects" -> "Shows active potion effects.";
            default -> "Bayon Client game module.";
        };
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        graphics.fill(0, 0, width, height, HudConfig.backgroundColor());
        int left = panelLeft();
        int top = panelTop();
        int right = left + panelWidth();
        int bottom = top + panelHeight();
        int contentX = contentLeft();
        int contentRight = contentX + contentWidth();

        graphics.fill(left, top, right, bottom, HudConfig.panelColor());
        BayonUi.outlineRect(graphics, left, top, right, bottom, HudConfig.borderColor());
        graphics.fill(left + 1, top + 1, right - 1, top + 3, HudConfig.accentColor());
        graphics.fill(left + 164, top + 48, left + 165, bottom - 14, HudConfig.borderColor());

        if (page == 0) drawModuleCards(graphics);
        if (page == 0 && hasPreviewPanel()) drawPreview(graphics, contentRight - previewWidth(), top + 110, previewWidth(), bottom - top - 152);
        if (page == 1 || page == 4) drawCosmetics(graphics, contentX, top);
        if (page == 2) drawAppearance(graphics, contentX, top);
        if (page == 3) drawLayoutHelp(graphics, contentX, top);

        super.extractRenderState(graphics, mouseX, mouseY, partialTick);
        graphics.text(Minecraft.getInstance().font, BayonUi.text("BAYON CLIENT"), left + 16, top + 16, 0xFFF5F7FC, true);
        graphics.text(Minecraft.getInstance().font, BayonUi.text("PLAY  /  CUSTOMIZE  /  BE DIFFERENT"), left + 16, top + 31, 0xFF9CBCE5, false);

        String title = page == 0 ? "Module Manager" : page == 1 ? "Wardrobe" : page == 2 ? "Appearance" : page == 4 ? "Cosmetic Store" : "HUD Layout";
        String subtitle = page == 0 ? "Enable, disable and configure your client modules."
                : page == 1 ? "Equip the Bayon cosmetic for your player."
                : page == 4 ? "Cosmetics available to your Bayon profile."
                : page == 2 ? "Set a theme and background for your client UI."
                : "Arrange and scale the HUD widgets in-game.";
        graphics.text(Minecraft.getInstance().font, BayonUi.text(title), contentX, top + 17, 0xFFF5F7FC, true);
        graphics.text(Minecraft.getInstance().font, BayonUi.text(subtitle), contentX, top + 34, 0xFF9CBCE5, false);
        if (page == 0) drawCardText(graphics);
    }

    private void drawModuleCards(GuiGraphicsExtractor graphics) {
        List<String> modules = filteredModules();
        for (int index = 0; index < modules.size(); index++) {
            String id = modules.get(index);
            int column = index % cardColumns();
            int row = index / cardColumns();
            int x = contentLeft() + column * (cardWidth() + 9);
            int y = cardStartY() + row * (CARD_HEIGHT + CARD_GAP);
            graphics.fill(x, y, x + cardWidth(), y + CARD_HEIGHT, 0xA80C1727);
            BayonUi.outlineRect(graphics, x, y, x + cardWidth(), y + CARD_HEIGHT, HudConfig.borderColor());
            graphics.fill(x + 10, y + 15, x + 52, y + 58, 0xAA071222);
            BayonUi.outlineRect(graphics, x + 10, y + 15, x + 52, y + 58, HudConfig.borderColor());
            graphics.text(Minecraft.getInstance().font, BayonUi.text(moduleGlyph(id)), x + 23, y + 28, HudConfig.accentColor(), true);
        }
        if (modules.isEmpty()) {
            graphics.text(Minecraft.getInstance().font, BayonUi.text("No modules in this category."), contentLeft() + 8, cardStartY() + 14, 0xFFB9C6D8, false);
        }
    }

    private void drawCardText(GuiGraphicsExtractor graphics) {
        List<String> modules = filteredModules();
        for (int index = 0; index < modules.size(); index++) {
            String id = modules.get(index);
            int column = index % cardColumns();
            int row = index / cardColumns();
            int x = contentLeft() + column * (cardWidth() + 9) + 62;
            int y = cardStartY() + row * (CARD_HEIGHT + CARD_GAP);
            graphics.text(Minecraft.getInstance().font, BayonUi.text(label(id)), x, y + 13, 0xFFF1F5FB, true);
            graphics.text(Minecraft.getInstance().font, BayonUi.text(moduleCategory(id)), x + 116, y + 14, HudConfig.accentColor(), false);
            graphics.text(Minecraft.getInstance().font, BayonUi.text(description(id)), x, y + 31, 0xFFB7C5D8, false);
            graphics.text(Minecraft.getInstance().font, BayonUi.text("Keybind: None"), x, y + 51, 0xFF7896BA, false);
        }
    }

    private void drawPreview(GuiGraphicsExtractor graphics, int x, int y, int w, int h) {
        graphics.fill(x, y, x + w, y + h, 0xA708111E);
        BayonUi.outlineRect(graphics, x, y, x + w, y + h, HudConfig.borderColor());
        graphics.text(Minecraft.getInstance().font, BayonUi.text("Preview"), x + 12, y + 12, 0xFFF1F5FB, true);
        graphics.text(Minecraft.getInstance().font, BayonUi.text("How modules look in-game."), x + 12, y + 28, 0xFF9CBCE5, false);

        int sceneTop = y + 48;
        graphics.fill(x + 9, sceneTop, x + w - 9, y + h - 10, 0xFF18263A);
        graphics.fill(x + 9, y + h - 68, x + w - 9, y + h - 10, 0xFF17271F);
        graphics.fill(x + 9, y + h - 70, x + w - 9, y + h - 68, 0xFF39523B);
        graphics.fill(x + 18, y + h - 48, x + w - 18, y + h - 47, 0xFF26372E);

        int sampleColor = HudConfig.panelColor();
        graphics.fill(x + 18, sceneTop + 10, x + 90, sceneTop + 28, sampleColor);
        BayonUi.outlineRect(graphics, x + 18, sceneTop + 10, x + 90, sceneTop + 28, HudConfig.borderColor());
        graphics.text(Minecraft.getInstance().font, BayonUi.text("FPS: " + Minecraft.getInstance().getFps()), x + 24, sceneTop + 15, 0xFFF5F7FC, false);

        int keyX = x + 20, keyY = sceneTop + 38;
        drawKey(graphics, keyX + 20, keyY, "W");
        drawKey(graphics, keyX, keyY + 18, "A"); drawKey(graphics, keyX + 20, keyY + 18, "S"); drawKey(graphics, keyX + 40, keyY + 18, "D");
        drawKey(graphics, keyX, keyY + 38, "LMB"); drawKey(graphics, keyX + 40, keyY + 38, "RMB");

        Minecraft client = Minecraft.getInstance();
        if (client.player != null) {
            Vec3 pos = client.player.position();
            String[] coords = {
                    "X: " + (int) pos.x,
                    "Y: " + (int) pos.y,
                    "Z: " + (int) pos.z
            };
            int infoX = x + w - 91;
            graphics.fill(infoX, sceneTop + 10, x + w - 17, sceneTop + 64, sampleColor);
            BayonUi.outlineRect(graphics, infoX, sceneTop + 10, x + w - 17, sceneTop + 64, HudConfig.borderColor());
            for (int line = 0; line < coords.length; line++) {
                graphics.text(Minecraft.getInstance().font, BayonUi.text(coords[line]), infoX + 7, sceneTop + 14 + line * 12, 0xFFF5F7FC, false);
            }
        }
        graphics.fill(x + 18, y + h - 30, x + w - 18, y + h - 18, 0xFF111923);
        BayonUi.outlineRect(graphics, x + 18, y + h - 30, x + w - 18, y + h - 18, HudConfig.borderColor());
    }

    private static void drawKey(GuiGraphicsExtractor graphics, int x, int y, String text) {
        graphics.fill(x, y, x + 36, y + 15, 0xDD08111F);
        BayonUi.outlineRect(graphics, x, y, x + 36, y + 15, HudConfig.borderColor());
        graphics.text(Minecraft.getInstance().font, BayonUi.text(text), x + 5, y + 3, 0xFFF1F5FB, false);
    }

    private static String moduleGlyph(String id) {
        return switch (id) {
            case "fps" -> "FPS";
            case "keystrokes" -> "KEY";
            case "cps" -> "CPS";
            case "coordinates" -> "XYZ";
            case "ping" -> "NET";
            case "direction" -> "DIR";
            case "armor" -> "ARM";
            case "effects" -> "FX";
            default -> "BC";
        };
    }

    private void drawCosmetics(GuiGraphicsExtractor graphics, int x, int top) {
        graphics.fill(x, top + 140, x + Math.min(520, contentWidth()), top + 300, 0xA80C1727);
        BayonUi.outlineRect(graphics, x, top + 140, x + Math.min(520, contentWidth()), top + 300, HudConfig.borderColor());
        graphics.text(Minecraft.getInstance().font, BayonUi.text(page == 4 ? "COSMETIC STORE" : "BAYON CAPE"), x + 18, top + 164, HudConfig.accentColor(), true);
        graphics.text(Minecraft.getInstance().font, BayonUi.text("Monochrome temple design"), x + 18, top + 185, 0xFFB9C6D8, false);
        graphics.text(Minecraft.getInstance().font, BayonUi.text(page == 4 ? "Included with Bayon Client - no purchase required" : HudConfig.capeEnabled() ? "Equipped on your player" : "Not equipped"), x + 18, top + 212, 0xFFF1F5FB, false);
    }

    private void drawAppearance(GuiGraphicsExtractor graphics, int x, int top) {
        graphics.fill(x, top + 178, x + Math.min(520, contentWidth()), top + 276, 0xA80C1727);
        BayonUi.outlineRect(graphics, x, top + 178, x + Math.min(520, contentWidth()), top + 276, HudConfig.borderColor());
        graphics.text(Minecraft.getInstance().font, BayonUi.text("LIVE THEME PREVIEW"), x + 18, top + 198, HudConfig.accentColor(), true);
        graphics.fill(x + 18, top + 218, x + 250, top + 258, HudConfig.panelColor());
        BayonUi.outlineRect(graphics, x + 18, top + 218, x + 250, top + 258, HudConfig.borderColor());
        graphics.text(Minecraft.getInstance().font, BayonUi.text(HudConfig.themeName() + "  /  " + HudConfig.backgroundName()), x + 28, top + 233, 0xFFF1F5FB, false);
    }

    private void drawLayoutHelp(GuiGraphicsExtractor graphics, int x, int top) {
        graphics.fill(x, top + 128, x + Math.min(720, contentWidth()), top + 260, 0xA80C1727);
        BayonUi.outlineRect(graphics, x, top + 128, x + Math.min(720, contentWidth()), top + 260, HudConfig.borderColor());
        graphics.text(Minecraft.getInstance().font, BayonUi.text("DRAG TO POSITION"), x + 18, top + 151, HudConfig.accentColor(), true);
        graphics.text(Minecraft.getInstance().font, BayonUi.text("Move a visible widget anywhere on the game screen."), x + 18, top + 173, 0xFFB9C6D8, false);
        graphics.text(Minecraft.getInstance().font, BayonUi.text("SCROLL TO RESIZE"), x + 18, top + 204, HudConfig.accentColor(), true);
        graphics.text(Minecraft.getInstance().font, BayonUi.text("Scroll over a widget to adjust its scale."), x + 18, top + 226, 0xFFB9C6D8, false);
    }

    @Override
    public boolean mouseClicked(net.minecraft.client.input.MouseButtonEvent event, boolean doubleClick) {
        double x = event.x();
        double y = event.y();
        int left = panelLeft();
        int top = panelTop();
        if (x >= left && x <= left + panelWidth() && y >= top && y <= top + panelHeight()) {
            return super.mouseClicked(event, doubleClick);
        }
        if (page == 3) {
            for (Map.Entry<String, Widget> entry : HudConfig.widgets().entrySet()) {
                Widget widget = entry.getValue();
                if (widget.enabled && x >= widget.x && x <= widget.x + 150 * widget.scale
                        && y >= widget.y && y <= widget.y + 48 * widget.scale) {
                    dragging = entry.getKey();
                    lastMouseX = x;
                    lastMouseY = y;
                    return true;
                }
            }
        }
        return super.mouseClicked(event, doubleClick);
    }

    @Override
    public boolean mouseReleased(net.minecraft.client.input.MouseButtonEvent event) {
        if (dragging != null) {
            dragging = null;
            HudConfig.save();
        }
        return super.mouseReleased(event);
    }

    @Override
    public void mouseMoved(double mouseX, double mouseY) {
        if (dragging != null) {
            Widget widget = HudConfig.get(dragging);
            widget.x = Math.max(0, Math.min(width - 30, widget.x + (int) Math.round(mouseX - lastMouseX)));
            widget.y = Math.max(0, Math.min(height - 20, widget.y + (int) Math.round(mouseY - lastMouseY)));
            lastMouseX = mouseX;
            lastMouseY = mouseY;
            HudConfig.save();
        }
        super.mouseMoved(mouseX, mouseY);
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY) {
        if (page == 3) {
            for (Map.Entry<String, Widget> entry : HudConfig.widgets().entrySet()) {
                Widget widget = entry.getValue();
                if (widget.enabled && mouseX >= widget.x && mouseX <= widget.x + 150 * widget.scale
                        && mouseY >= widget.y && mouseY <= widget.y + 48 * widget.scale) {
                    widget.scale = Math.max(0.5f, Math.min(2.0f, widget.scale + (scrollY > 0 ? 0.1f : -0.1f)));
                    HudConfig.save();
                    return true;
                }
            }
        }
        return super.mouseScrolled(mouseX, mouseY, scrollX, scrollY);
    }

    @Override
    public void onClose() {
        HudConfig.save();
        Minecraft.getInstance().gui.setScreen(parent);
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }
}
