package com.skywalker.cqr.rewrite;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * An exact-match semantic cache to catch the "easy stuff" (e.g. users asking the exact same standalone question).
 * Any cache miss goes directly to the ML Hot Path.
 */
public class QueryCache {
    // Stores the raw query as the key, and the parsed JSON structured query as the value
    private final Map<String, String> cache = new ConcurrentHashMap<>();

    public String get(String query) {
        if (query == null) return null;
        return cache.get(query.trim().toLowerCase());
    }

    public void put(String query, String structuredJson) {
        if (query != null && structuredJson != null) {
            cache.put(query.trim().toLowerCase(), structuredJson);
        }
    }
    
    public void clear() {
        cache.clear();
    }
}
