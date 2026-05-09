package com.skywalker.cqr.rewrite;

/**
 * ConversationFrameBuilder prepares the compact conversational state
 * required by the fast-inference ML model. 
 * Rather than appending the entire transcript, we append the immediate prior turn.
 */
public class ConversationFrameBuilder {

    /**
     * Builds a prompt frame containing the last user query and the current follow-up query.
     * This frame is passed to the local FLAN-T5 model for structured resolution.
     */
    public static String buildFrame(String previousQuery, String currentQuery) {
        if (previousQuery == null || previousQuery.trim().isEmpty()) {
            return "Follow-up: " + currentQuery;
        }
        
        // Structured format expected by the fine-tuned instruction model
        return String.format("Conversation:\nUser: %s\n\nFollow-up: %s\n\nStandalone JSON:", 
            previousQuery.trim(), 
            currentQuery.trim()
        );
    }
}
