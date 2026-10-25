package com.bayon.client.hud;

import com.bayon.client.ui.BayonBackground;
import com.bayon.client.ui.BayonButton;
import com.bayon.client.ui.BayonTheme;
import com.bayon.client.ui.BayonUi;
import com.bayon.client.ui.RenderUtil;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.TransferState;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.network.chat.Component;

/** Live Bayon partner-server directory backed by the launcher service. */
public final class BayonPartnerServersScreen extends Screen {
    private static final URI SERVERS_ENDPOINT = URI.create("https://bayon-backend.onrender.com/api/servers");
    private static final HttpClient HTTP_CLIENT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    private static final int ROW_HEIGHT = 66;
    private static final int ROW_GAP = 8;

    private final Screen parent;
    private List<PartnerServer> servers = List.of();
    private String error;
    private boolean loading;
    private int firstVisible;

    public BayonPartnerServersScreen(Screen parent) {
        super(Component.translatable("menu.bayonclient.partner_servers.title"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        int buttonWidth = Math.min(180, Math.max(1, (width - 42) / 2));
        int bottomY = Math.max(8, height - 42);
        addRenderableWidget(new BayonButton(width / 2 - buttonWidth - 5, bottomY, buttonWidth, 32,
                Component.translatable("menu.bayonclient.partner_servers.back"), BayonButton.Style.SECONDARY,
                this::onClose));
        addRenderableWidget(new BayonButton(width / 2 + 5, bottomY, buttonWidth, 32,
                Component.translatable("menu.bayonclient.partner_servers.retry"), BayonButton.Style.PRIMARY,
                this::refreshServers));

        if (!loading && servers.isEmpty() && error == null) {
            loadServers();
        }

        int rowWidth = Math.max(1, width - 32);
        int rowsVisible = Math.max(1, (height - 166) / (ROW_HEIGHT + ROW_GAP));
        int lastVisible = Math.min(servers.size(), firstVisible + rowsVisible);
        for (int index = firstVisible; index < lastVisible; index++) {
            PartnerServer server = servers.get(index);
            int rowTop = 82 + (index - firstVisible) * (ROW_HEIGHT + ROW_GAP);
            int joinWidth = Math.min(100, Math.max(64, rowWidth / 3));
            int joinX = width - 16 - joinWidth;
            BayonButton joinButton = new BayonButton(joinX, rowTop + 17, joinWidth, 32,
                    "globe", Component.translatable("menu.bayonclient.partner_servers.join"),
                    BayonButton.Style.PRIMARY, false, () -> connect(server));
            joinButton.active = !Boolean.FALSE.equals(server.online);
            addRenderableWidget(joinButton);
        }
    }

    private void refreshServers() {
        if (loading) return;
        firstVisible = 0;
        servers = List.of();
        error = null;
        loading = true;
        init();
        loadServers();
    }

    private void loadServers() {
        loading = true;
        CompletableFuture.supplyAsync(BayonPartnerServersScreen::fetchServers)
                .whenComplete((loadedServers, failure) -> Minecraft.getInstance().execute(() -> {
                    Minecraft client = Minecraft.getInstance();
                    if (client.gui.screen() != this) return;

                    loading = false;
                    if (failure != null) {
                        Throwable cause = failure instanceof CompletionException && failure.getCause() != null
                                ? failure.getCause() : failure;
                        error = cause.getMessage() == null ? "Unable to load partner servers." : cause.getMessage();
                    } else {
                        servers = loadedServers;
                        if (servers.isEmpty()) {
                            error = Component.translatable("menu.bayonclient.partner_servers.empty").getString();
                        }
                    }
                    init();
                }));
    }

    private static List<PartnerServer> fetchServers() {
        HttpRequest request = HttpRequest.newBuilder(SERVERS_ENDPOINT)
                .timeout(Duration.ofSeconds(15))
                .header("Accept", "application/json")
                .header("User-Agent", "BayonClient-Fabric/0.1.8")
                .GET()
                .build();
        HttpResponse<String> response;
        try {
            response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new CompletionException("Loading partner servers was interrupted.", exception);
        } catch (IOException exception) {
            throw new CompletionException("Could not reach the Bayon server directory.", exception);
        }

        if (response.statusCode() != 200) {
            throw new IllegalStateException("Server directory returned HTTP " + response.statusCode() + ".");
        }

        JsonObject root = JsonParser.parseString(response.body()).getAsJsonObject();
        JsonElement serverList = root.get("servers");
        if (serverList == null || !serverList.isJsonArray()) {
            throw new IllegalStateException("Server directory returned an invalid response.");
        }

        JsonArray entries = serverList.getAsJsonArray();
        List<PartnerServer> result = new ArrayList<>(entries.size());
        for (JsonElement entry : entries) {
            if (!entry.isJsonObject()) continue;
            JsonObject server = entry.getAsJsonObject();
            String name = stringValue(server, "name");
            String address = stringValue(server, "address");
            if (name.isBlank() || address.isBlank() || !ServerAddress.isValidAddress(address)) continue;

            Boolean online = server.has("online") && server.get("online").isJsonPrimitive()
                    && server.get("online").getAsJsonPrimitive().isBoolean()
                    ? server.get("online").getAsBoolean() : null;
            int onlinePlayers = integerValue(server, "onlinePlayers");
            int maxPlayers = integerValue(server, "maxPlayers");
            result.add(new PartnerServer(name, address, online, onlinePlayers, maxPlayers));
        }
        if (result.isEmpty() && !entries.isEmpty()) {
            throw new IllegalStateException(
                    Component.translatable("menu.bayonclient.partner_servers.invalid").getString());
        }
        return List.copyOf(result);
    }

    private static String stringValue(JsonObject object, String key) {
        JsonElement value = object.get(key);
        return value != null && value.isJsonPrimitive() && value.getAsJsonPrimitive().isString()
                ? value.getAsString().trim() : "";
    }

    private static int integerValue(JsonObject object, String key) {
        JsonElement value = object.get(key);
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber()) return 0;
        try {
            return Math.max(0, value.getAsInt());
        } catch (NumberFormatException exception) {
            return 0;
        }
    }

    private void connect(PartnerServer server) {
        Minecraft client = Minecraft.getInstance();
        ServerData serverData = new ServerData(server.name, server.address, ServerData.Type.OTHER);
        ConnectScreen.startConnecting(this, client, ServerAddress.parseString(server.address), serverData, false,
                new TransferState(Map.of(), Map.of(), false));
    }

    @Override
    public void extractBackground(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        BayonBackground.draw(graphics, width, height);
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        int panelWidth = Math.max(0, width - 28);
        int panelLeft = (width - panelWidth) / 2;
        int rowsVisible = Math.max(1, (height - 166) / (ROW_HEIGHT + ROW_GAP));
        int lastVisible = Math.min(servers.size(), firstVisible + rowsVisible);
        for (int index = firstVisible; index < lastVisible; index++) {
            PartnerServer server = servers.get(index);
            int rowTop = 82 + (index - firstVisible) * (ROW_HEIGHT + ROW_GAP);
            RenderUtil.roundedBorder(graphics, panelLeft, rowTop, panelLeft + panelWidth,
                    rowTop + ROW_HEIGHT, BayonTheme.CORNER_RADIUS, 1, BayonTheme.BORDER, BayonTheme.PANEL);
            graphics.text(Minecraft.getInstance().font, Component.literal(server.name),
                    panelLeft + 16, rowTop + 12, BayonTheme.TEXT, false);
            graphics.text(Minecraft.getInstance().font, Component.literal(server.address),
                    panelLeft + 16, rowTop + 36, BayonTheme.MUTED, false);
            String status = Boolean.FALSE.equals(server.online)
                    ? Component.translatable("menu.bayonclient.partner_servers.offline").getString()
                    : Component.translatable("menu.bayonclient.partner_servers.online").getString();
            if (server.maxPlayers > 0) {
                status += "  " + server.onlinePlayers + "/" + server.maxPlayers;
            }
            graphics.text(Minecraft.getInstance().font, Component.literal(status),
                    panelLeft + panelWidth - 126, rowTop + 25,
                    Boolean.FALSE.equals(server.online) ? 0xFFE68A92 : BayonTheme.ACCENT_BRIGHT, false);
        }

        var font = Minecraft.getInstance().font;
        graphics.centeredText(font, getTitle(), width / 2, 24, BayonTheme.TEXT);
        Component subtitle = loading
                ? Component.translatable("menu.bayonclient.partner_servers.loading")
                : error == null ? Component.translatable("menu.bayonclient.partner_servers.description")
                : Component.literal(error);
        graphics.centeredText(font, subtitle, width / 2, 48, error == null ? BayonTheme.MUTED : 0xFFE68A92);
        super.extractRenderState(graphics, mouseX, mouseY, partialTick);
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double horizontalAmount, double verticalAmount) {
        int rowsVisible = Math.max(1, (height - 166) / (ROW_HEIGHT + ROW_GAP));
        int maxFirst = Math.max(0, servers.size() - rowsVisible);
        int nextFirst = Math.max(0, Math.min(maxFirst, firstVisible - (int) Math.signum(verticalAmount)));
        if (nextFirst == firstVisible) return super.mouseScrolled(mouseX, mouseY, horizontalAmount, verticalAmount);
        firstVisible = nextFirst;
        init();
        return true;
    }

    @Override
    public void onClose() {
        Minecraft.getInstance().gui.setScreen(parent);
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }

    private record PartnerServer(String name, String address, Boolean online, int onlinePlayers, int maxPlayers) {}
}
