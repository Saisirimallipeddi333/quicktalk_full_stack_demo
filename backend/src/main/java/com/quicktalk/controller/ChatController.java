package com.quicktalk.controller;

import com.quicktalk.model.ChatMessage;
import com.quicktalk.repo.ChatMessageRepository;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/messages")
@CrossOrigin(origins = "*")
public class ChatController {

    private final ChatMessageRepository chatMessageRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public ChatController(ChatMessageRepository chatMessageRepository,
                          SimpMessagingTemplate messagingTemplate) {
        this.chatMessageRepository = chatMessageRepository;
        this.messagingTemplate = messagingTemplate;
    }

    // -------- WEBSOCKET: SEND + SAVE --------
    // Frontend publishes to /app/chat.sendPrivate
    @MessageMapping("/chat.sendPrivate")
    public void sendPrivate(@Payload ChatMessage message) {

        if (message.getSender() == null ||
            message.getRecipient() == null ||
            message.getContent() == null ||
            message.getContent().trim().isEmpty()) {
            return;
        }

        // set timestamp if missing
        if (message.getSentAt() == null) {
            message.setSentAt(Instant.now());
        }

        // save to MySQL
        ChatMessage saved = chatMessageRepository.save(message);

        // send to sender
        messagingTemplate.convertAndSend(
                "/topic/user." + saved.getSender(),
                saved
        );

        // send to recipient (if not self-chat)
        if (!saved.getSender().equals(saved.getRecipient())) {
            messagingTemplate.convertAndSend(
                    "/topic/user." + saved.getRecipient(),
                    saved
            );
        }
    }

    // -------- REST: HISTORY FOR ONE USER --------
    // GET /api/messages/history?user=Siri
    @GetMapping("/history")
    public List<ChatMessage> historyForUser(@RequestParam("user") String user) {
        return chatMessageRepository.findAllForUser(user);
    }

    // -------- REST: CONVERSATION BETWEEN TWO USERS --------
    // GET /api/messages/conversation?user1=Siri&user2=Usha
    @GetMapping("/conversation")
    public List<ChatMessage> conversation(
            @RequestParam("user1") String user1,
            @RequestParam("user2") String user2
    ) {
        return chatMessageRepository.findConversation(user1, user2);
    }
}
