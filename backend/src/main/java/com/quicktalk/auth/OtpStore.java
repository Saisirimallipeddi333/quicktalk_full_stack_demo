package com.quicktalk.auth;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class OtpStore {

    private static class OtpEntry {
        String code;
        long expiresAt;
    }

    private final Map<String, OtpEntry> store = new ConcurrentHashMap<>();
    private static final long TTL_MILLIS = 5 * 60 * 1000; // 5 minutes

    private final Random random = new Random();

    public String generateAndStore(String email) {
        String code = String.format("%06d", random.nextInt(1_000_000));

        OtpEntry entry = new OtpEntry();
        entry.code = code;
        entry.expiresAt = System.currentTimeMillis() + TTL_MILLIS;

        store.put(email.toLowerCase(), entry);
        return code;
    }

    public boolean verify(String email, String code) {
        OtpEntry entry = store.get(email.toLowerCase());
        if (entry == null) return false;

        if (System.currentTimeMillis() > entry.expiresAt) {
            store.remove(email.toLowerCase());
            return false;
        }

        boolean ok = entry.code.equals(code);
        if (ok) {
            store.remove(email.toLowerCase());
        }
        return ok;
    }
}
