package com.quicktalk.repo;

import com.quicktalk.model.ChatMessage;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {
    // For now we only need save(); we can add history queries later.
}
