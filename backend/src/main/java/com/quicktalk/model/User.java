package com.quicktalk.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "users")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * Unique name that appears in chats.
     */
    @Column(nullable = false, unique = true, length = 50)
    private String username;

    /**
     * Login email (used for signup / login / password reset).
     */
    @Column(nullable = false, unique = true, length = 255)
    private String email;

    @Column(length = 100)
    private String firstName;

    @Column(length = 100)
    private String lastName;

    /**
     * BCrypt-hashed password (never store plain text).
     */
    @Column(nullable = false, length = 255)
    private String passwordHash;

    @Column(length = 20)
    private String gender;

    /**
     * Date of birth (YYYY-MM-DD).
     */
    private LocalDate dateOfBirth;

    @Column(length = 100)
    private String countryOfOrigin;

    /**
     * Whether the user has verified their email via OTP.
     */
    @Column(nullable = false)
    private boolean emailVerified = false;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();
}
