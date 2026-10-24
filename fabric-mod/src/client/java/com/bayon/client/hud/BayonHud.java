package com.bayon.client.hud;

import com.bayon.client.config.HudConfig;
import com.bayon.client.config.HudConfig.Widget;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.Vec3;
import net.minecraft.client.DeltaTracker;
import net.minecraft.core.Direction;
import net.minecraft.client.multiplayer.PlayerInfo;
import org.lwjgl.glfw.GLFW;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;

public final class BayonHud {
    private static final int PANEL = 0x99080808;
    private static final int BORDER = 0x55FFFFFF;
    private static final int TEXT = 0xFFF5F5F5;
    private static final int MUTED = 0xFFB9B9B9;
    private static final Deque<Long> leftClicks = new ArrayDeque<>();
    private static final Deque<Long> rightClicks = new ArrayDeque<>();
    private static boolean previousLeft;
    private static boolean previousRight;

    private BayonHud() {}

    public static void initialize() {}

    public static void tick(Minecraft client) {
        if (client.getWindow() == null || client.player == null || client.gui.screen() != null) {
            previousLeft = false;
            previousRight = false;
            return;
        }
        long window = client.getWindow().handle();
        boolean left = GLFW.glfwGetMouseButton(window, GLFW.GLFW_MOUSE_BUTTON_1) == GLFW.GLFW_PRESS;
        boolean right = GLFW.glfwGetMouseButton(window, GLFW.GLFW_MOUSE_BUTTON_2) == GLFW.GLFW_PRESS;
        long now = System.currentTimeMillis();
        if (left && !previousLeft) leftClicks.addLast(now);
        if (right && !previousRight) rightClicks.addLast(now);
        previousLeft = left;
        previousRight = right;
        trimClicks(leftClicks, now);
        trimClicks(rightClicks, now);
    }

    private static void trimClicks(Deque<Long> clicks, long now) {
        while (!clicks.isEmpty() && now - clicks.peekFirst() >= 1000) clicks.removeFirst();
    }

    public static void render(GuiGraphicsExtractor graphics, DeltaTracker ignored) {
        Minecraft client = Minecraft.getInstance();
        if (client.player == null || client.gui.hud.isHidden()) return;
        boolean preview = client.gui.screen() instanceof EditorScreen
                || client.gui.screen() instanceof BayonCustomizationScreen customScreen && customScreen.showHudPreview();
        for (String id : List.of("fps", "keystrokes", "cps", "coordinates", "ping", "direction", "armor", "effects")) {
            Widget widget = HudConfig.get(id);
            if (widget.enabled || preview) drawWidget(graphics, client, id, widget, preview);
        }
    }

    private static void drawWidget(GuiGraphicsExtractor graphics, Minecraft client, String id, Widget widget, boolean preview) {
        float scale = widget.scale;
        if (id.equals("keystrokes")) {
            drawKeystrokes(graphics, client, widget, preview);
            return;
        }
        List<String> lines = lines(client, id, preview);
        if (lines.isEmpty()) return;
        int contentWidth = 0;
        for (String line : lines) contentWidth = Math.max(contentWidth, client.font.width(line));
        int width = contentWidth + 12;
        int height = lines.size() * 11 + 8;
        graphics.pose().pushMatrix();
        graphics.pose().translate(widget.x, widget.y);
        graphics.pose().scale(scale, scale);
        graphics.fill(0, 0, width, height, HudConfig.panelColor());
        graphics.outline(0, 0, width, height, HudConfig.borderColor());
        for (int i = 0; i < lines.size(); i++) {
            graphics.text(client.font, Component.literal(lines.get(i)), 6, 4 + i * 11, i == 0 ? TEXT : MUTED, true);
        }
        graphics.pose().popMatrix();
    }

    private static void drawKeystrokes(GuiGraphicsExtractor graphics, Minecraft client, Widget widget, boolean preview) {
        int panelWidth = 112;
        int panelHeight = 78;
        graphics.pose().pushMatrix();
        graphics.pose().translate(widget.x, widget.y);
        graphics.pose().scale(widget.scale, widget.scale);
        com.bayon.client.ui.BayonUi.roundedRect(graphics, 0, 0, panelWidth, panelHeight, 4, HudConfig.panelColor());
        graphics.outline(0, 0, panelWidth, panelHeight, HudConfig.borderColor());
        graphics.text(client.font, Component.literal("KEYSTROKES"), 7, 5, MUTED, true);

        drawKeyCap(graphics, client, 45, 18, 22, 17, "W",
                preview || client.options.keyUp.isDown());
        drawKeyCap(graphics, client, 20, 38, 22, 17, "A", client.options.keyLeft.isDown());
        drawKeyCap(graphics, client, 45, 38, 22, 17, "S",
                client.options.keyDown.isDown());
        drawKeyCap(graphics, client, 70, 38, 22, 17, "D",
                preview || client.options.keyRight.isDown());
        drawKeyCap(graphics, client, 7, 59, 40, 14, "SPACE",
                client.options.keyJump.isDown());
        drawKeyCap(graphics, client, 50, 59, 25, 14, "LMB", preview || previousLeft);
        drawKeyCap(graphics, client, 78, 59, 27, 14, "RMB", previousRight);
        graphics.pose().popMatrix();
    }

    private static void drawKeyCap(GuiGraphicsExtractor graphics, Minecraft client, int x, int y, int width,
                                   int height, String label, boolean pressed) {
        int fill = pressed ? 0xFF454545 : 0xCC111111;
        int border = pressed ? HudConfig.accentColor() : HudConfig.borderColor();
        int text = pressed ? 0xFFFFFFFF : MUTED;
        com.bayon.client.ui.BayonUi.roundedRect(graphics, x, y, x + width, y + height, 2, fill);
        com.bayon.client.ui.BayonUi.outlineRect(graphics, x, y, x + width, y + height, border);
        graphics.centeredText(client.font, Component.literal(label), x + width / 2,
                y + Math.max(0, (height - client.font.lineHeight) / 2), text);
    }

    private static List<String> lines(Minecraft client, String id, boolean preview) {
        if (preview) {
            return switch (id) {
                case "fps" -> List.of("FPS " + client.getFps());
                case "keystrokes" -> List.of("W", "A  S  D", "SPACE   LMB   RMB");
                case "cps" -> List.of("LMB " + leftClicks.size() + " CPS", "RMB " + rightClicks.size() + " CPS");
                case "coordinates" -> List.of("XYZ  128, 64, -42");
                case "ping" -> List.of("PING  32 ms");
                case "direction" -> List.of("FACING  NORTH");
                case "armor" -> List.of("ARMOR  ■ ■ ■ ■");
                case "effects" -> List.of("EFFECTS  Speed II");
                default -> List.of();
            };
        }
        return switch (id) {
            case "fps" -> List.of("FPS  " + client.getFps());
            case "keystrokes" -> keyLines(client);
            case "cps" -> List.of("LMB  " + clickCount(leftClicks) + " CPS", "RMB  " + clickCount(rightClicks) + " CPS");
            case "coordinates" -> coordinates(client);
            case "ping" -> ping(client);
            case "direction" -> List.of("FACING  " + direction(client));
            case "armor" -> armor(client);
            case "effects" -> effects(client);
            default -> List.of();
        };
    }

    private static int clickCount(Deque<Long> clicks) {
        trimClicks(clicks, System.currentTimeMillis());
        return clicks.size();
    }

    private static List<String> keyLines(Minecraft client) {
        return List.of(
                key(client, "W", client.options.keyUp.isDown()),
                key(client, "A", client.options.keyLeft.isDown()) + "  " + key(client, "S", client.options.keyDown.isDown()) + "  " + key(client, "D", client.options.keyRight.isDown()),
                key(client, "SPACE", client.options.keyJump.isDown()), "LMB   " + (previousLeft ? "●" : "○") + "    RMB   " + (previousRight ? "●" : "○")
        );
    }

    private static String key(Minecraft client, String label, boolean down) {
        return down ? "[" + label + "]" : " " + label + " ";
    }

    private static List<String> coordinates(Minecraft client) {
        Vec3 p = client.player.position();
        return List.of(String.format("XYZ  %d, %d, %d", Mth.floor(p.x), Mth.floor(p.y), Mth.floor(p.z)));
    }

    private static List<String> ping(Minecraft client) {
        if (client.getConnection() == null) return List.of("PING  --");
        PlayerInfo info = client.getConnection().getPlayerInfo(client.player.getUUID());
        return List.of(info == null ? "PING  --" : "PING  " + info.getLatency() + " ms");
    }

    private static String direction(Minecraft client) {
        Direction direction = client.player.getDirection();
        return direction.getName().toUpperCase();
    }

    private static List<String> armor(Minecraft client) {
        List<String> result = new ArrayList<>();
        result.add("ARMOR");
        for (EquipmentSlot slot : List.of(EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET)) {
            ItemStack item = client.player.getItemBySlot(slot);
            result.add(item.isEmpty() ? "-" : item.getHoverName().getString());
        }
        return result;
    }

    private static List<String> effects(Minecraft client) {
        List<String> result = new ArrayList<>();
        result.add("EFFECTS");
        for (MobEffectInstance effect : client.player.getActiveEffects()) {
            result.add(effect.getEffect().value().getDisplayName().getString() + " " + (effect.getAmplifier() + 1));
            if (result.size() >= 5) break;
        }
        if (result.size() == 1) result.add("None");
        return result;
    }

    public static final class EditorScreen extends Screen {
        private final Screen parent;
        private String dragging;
        private double lastMouseX;
        private double lastMouseY;

        public EditorScreen(Screen parent) {
            super(Component.literal("Bayon HUD Editor"));
            this.parent = parent;
        }

        @Override
        protected void init() {
            int left = Math.max(12, (this.width - 360) / 2);
            int top = Math.max(12, (this.height - 300) / 2);
            addRenderableWidget(new com.bayon.client.ui.BayonButton(left, top + 258, 180, 20, Component.literal("Reset positions / scale"), com.bayon.client.ui.BayonButton.Style.SECONDARY, () -> { HudConfig.reset(); refreshEditorWidgets(); }));
            addRenderableWidget(new com.bayon.client.ui.BayonButton(left + 188, top + 258, 90, 20, Component.literal("Done"), com.bayon.client.ui.BayonButton.Style.PRIMARY, this::onClose));
            int row = 0;
            for (Map.Entry<String, Widget> entry : HudConfig.widgets().entrySet()) {
                String id = entry.getKey();
                Widget widget = entry.getValue();
                addRenderableWidget(net.minecraft.client.gui.components.Button.builder(
                        Component.literal((widget.enabled ? "ON  " : "OFF ") + label(id) + "  ·  scale " + String.format("%.1f", widget.scale)),
                        button -> { widget.enabled = !widget.enabled; HudConfig.save(); rebuildWidgets(); }
                ).bounds(left, top + row * 26, 280, 22).build());
                row++;
            }
            addRenderableWidget(net.minecraft.client.gui.components.Button.builder(
                    Component.literal("Cape  " + (HudConfig.capeEnabled() ? "ON" : "OFF")),
                    button -> { HudConfig.setCapeEnabled(!HudConfig.capeEnabled()); refreshEditorWidgets(); }
            ).bounds(left, top + row * 26, 280, 22).build());
        }

        private void refreshEditorWidgets() {
            clearWidgets();
            init();
        }

        private static String label(String id) {
            return switch (id) {
                case "fps" -> "FPS";
                case "keystrokes" -> "Keystrokes";
                case "cps" -> "CPS";
                case "coordinates" -> "Coordinates";
                case "ping" -> "Ping";
                case "direction" -> "Direction";
                case "armor" -> "Armor";
                case "effects" -> "Potion effects";
                default -> id;
            };
        }

        @Override
        public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
            graphics.fill(0, 0, width, height, 0x99000000);
            super.extractRenderState(graphics, mouseX, mouseY, partialTick);
            graphics.text(Minecraft.getInstance().font, Component.literal("Bayon HUD Editor — drag widgets to move, scroll to resize"), Math.max(12, (width - 360) / 2), Math.max(4, (height - 300) / 2 - 22), TEXT, true);
        }

        @Override
        public boolean mouseClicked(net.minecraft.client.input.MouseButtonEvent event, boolean doubleClick) {
            double x = event.x();
            double y = event.y();
            for (Map.Entry<String, Widget> entry : HudConfig.widgets().entrySet()) {
                Widget widget = entry.getValue();
                int widgetWidth = entry.getKey().equals("keystrokes") ? 112 : 150;
                int widgetHeight = entry.getKey().equals("keystrokes") ? 78 : 48;
                if (x >= widget.x && x <= widget.x + widgetWidth * widget.scale
                        && y >= widget.y && y <= widget.y + widgetHeight * widget.scale) {
                    dragging = entry.getKey();
                    lastMouseX = x;
                    lastMouseY = y;
                    return true;
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
            for (Map.Entry<String, Widget> entry : HudConfig.widgets().entrySet()) {
                Widget widget = entry.getValue();
                int widgetWidth = entry.getKey().equals("keystrokes") ? 112 : 150;
                int widgetHeight = entry.getKey().equals("keystrokes") ? 78 : 48;
                if (mouseX >= widget.x && mouseX <= widget.x + widgetWidth * widget.scale
                        && mouseY >= widget.y && mouseY <= widget.y + widgetHeight * widget.scale) {
                    widget.scale = Math.max(0.5f, Math.min(2.0f, widget.scale + (scrollY > 0 ? 0.1f : -0.1f)));
                    HudConfig.save();
                    return true;
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
}
