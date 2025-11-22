package com.quicktalk.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Entity
@Table(name = "chat_messages")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChatMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Logical "room" between two users, e.g. "siri|usha"
    private String room;

    // Who sent the message
    private String sender;

    // Who should receive the message
    private String recipient;

    // Actual text
    private String content;

    // When it was sent
    private Instant sentAt = Instant.now();
}
