package com.bayon.client.ui;

/** Small frame-time based easing helpers shared by Bayon widgets. */
public final class AnimationUtil {
    private AnimationUtil() {}

    public static float easeOutCubic(float value) {
        float t = clamp(value);
        return 1 - (float) Math.pow(1 - t, 3);
    }

    public static float approach(float value, float target, float deltaSeconds, float speed) {
        if (deltaSeconds <= 0) return value;
        float amount = 1 - (float) Math.exp(-Math.max(0, speed) * Math.min(deltaSeconds, 0.1f));
        return lerp(value, target, amount);
    }

    public static float lerp(float from, float to, float amount) {
        return from + (to - from) * clamp(amount);
    }

    private static float clamp(float value) {
        return Math.max(0, Math.min(1, value));
    }
}
