package com.quicktalk.controller;

import com.quicktalk.model.ChatMessage;
import com.quicktalk.repo.ChatMessageRepository;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.time.Instant;

@Controller
public class ChatController {

    private final SimpMessagingTemplate messagingTemplate;
    private final ChatMessageRepository chatMessageRepository;

    public ChatController(SimpMessagingTemplate messagingTemplate,
                          ChatMessageRepository chatMessageRepository) {
        this.messagingTemplate = messagingTemplate;
        this.chatMessageRepository = chatMessageRepository;
    }

    // Create a stable room id for a pair of users: siri|usha, same for both sides
    private String buildRoom(String user1, String user2) {
        if (user1 == null || user2 == null) {
            return "global";
        }
        String a = user1.trim().toLowerCase();
        String b = user2.trim().toLowerCase();
        return (a.compareTo(b) < 0) ? a + "|" + b : b + "|" + a;
    }

    // Called from frontend: destination '/app/chat.sendPrivate'
    @MessageMapping("/chat.sendPrivate")
    public void sendPrivate(@Payload ChatMessage message) {
        if (message.getSender() == null || message.getRecipient() == null) {
            return; // ignore bad messages
        }

        message.setSentAt(Instant.now());
        message.setRoom(buildRoom(message.getSender(), message.getRecipient()));

        ChatMessage saved = chatMessageRepository.save(message);

        // Push to sender's personal topic
        messagingTemplate.convertAndSend("/topic/user." + message.getSender(), saved);

        // Push to recipient's personal topic
        messagingTemplate.convertAndSend("/topic/user." + message.getRecipient(), saved);
    }
}
