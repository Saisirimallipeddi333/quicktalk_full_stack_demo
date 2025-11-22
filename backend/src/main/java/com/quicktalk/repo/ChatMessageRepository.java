package com.quicktalk.repo;

import com.quicktalk.model.ChatMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    // All messages where this user is sender OR recipient
    @Query("""
           SELECT m FROM ChatMessage m
           WHERE m.sender = :user OR m.recipient = :user
           ORDER BY m.sentAt ASC, m.id ASC
           """)
    List<ChatMessage> findAllForUser(@Param("user") String user);

    // Conversation between two users (both directions)
    @Query("""
           SELECT m FROM ChatMessage m
           WHERE (m.sender = :user1 AND m.recipient = :user2)
              OR (m.sender = :user2 AND m.recipient = :user1)
           ORDER BY m.sentAt ASC, m.id ASC
           """)
    List<ChatMessage> findConversation(@Param("user1") String user1,
                                       @Param("user2") String user2);
}
