package com.quicktalk.controller;

import com.quicktalk.controller.dto.LoginRequest;
import com.quicktalk.model.User;
import com.quicktalk.repo.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
@CrossOrigin(origins = "http://localhost:5173") // allow your React dev server
public class UserController {

    private final UserRepository userRepository;

    @PostMapping("/login")
    public ResponseEntity<User> login(@RequestBody LoginRequest request) {
        String username = request.getUsername() != null
                ? request.getUsername().trim()
                : "";
        String email = request.getEmail() != null
                ? request.getEmail().trim()
                : "";

        if (username.isEmpty() || email.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }

        // Simple “upsert” login: find by username, otherwise create
        User user = userRepository.findByUsername(username)
                .orElseGet(() -> {
                    User u = new User();
                    u.setUsername(username);
                    u.setEmail(email);
                    u.setCreatedAt(Instant.now());
                    return u;
                });

        // if existing user had no email, update it
        if (user.getEmail() == null || user.getEmail().isBlank()) {
            user.setEmail(email);
        }

        user = userRepository.save(user);
        return ResponseEntity.ok(user);
    }

    // Optional: quick health check
    @GetMapping("/ping")
    public ResponseEntity<String> ping() {
        return ResponseEntity.ok("ok");
    }
}
