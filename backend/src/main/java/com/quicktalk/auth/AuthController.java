package com.quicktalk.auth;

import com.quicktalk.model.User;
import com.quicktalk.repo.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "http://localhost:3000") // frontend origin
public class AuthController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final OtpStore otpStore;
    private final EmailService emailService;

    public AuthController(UserRepository userRepository,
                          PasswordEncoder passwordEncoder,
                          OtpStore otpStore,
                          EmailService emailService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.otpStore = otpStore;
        this.emailService = emailService;
    }

    // =========================================================
    // 1) SIGN UP (REGISTER) – first time
    // =========================================================
    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody RegisterRequest dto) {
        // basic validation
        if (isBlank(dto.email()) || isBlank(dto.username())
                || isBlank(dto.password()) || isBlank(dto.confirmPassword())) {
            return ResponseEntity.badRequest().body("Email, username and password are required.");
        }

        if (!dto.password().equals(dto.confirmPassword())) {
            return ResponseEntity.badRequest().body("Passwords do not match.");
        }

        if (userRepository.existsByEmail(dto.email())) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body("Email is already registered.");
        }

        if (userRepository.existsByUsername(dto.username())) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body("Username is already taken.");
        }

        // create new user
        User user = new User();
        user.setEmail(dto.email());
        user.setUsername(dto.username()); // name shown in chats
        user.setFirstName(dto.firstName());
        user.setLastName(dto.lastName());
        user.setGender(dto.gender());
        user.setCountryOfOrigin(dto.countryOfOrigin());
        user.setDateOfBirth(dto.dateOfBirth());
        user.setCreatedAt(Instant.now());
        user.setEmailVerified(false);
        user.setPasswordHash(passwordEncoder.encode(dto.password()));

        userRepository.save(user);

        // generate OTP & send email
        String code = otpStore.generateAndStore(dto.email());
        try {
            emailService.sendOtpEmail(dto.email(), code);
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("User created but failed to send verification email.");
        }

        return ResponseEntity.ok("Registration successful. Please verify your email with the OTP.");
    }

    // =========================================================
    // 2) VERIFY EMAIL (OTP after sign up)
    // =========================================================
    @PostMapping("/verify-email")
    public ResponseEntity<?> verifyEmail(@RequestBody VerifyEmailRequest dto) {
        if (isBlank(dto.email()) || isBlank(dto.otp())) {
            return ResponseEntity.badRequest().body("Email and OTP are required.");
        }

        boolean ok = otpStore.verify(dto.email(), dto.otp());
        if (!ok) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body("Invalid or expired OTP.");
        }

        Optional<User> userOpt = userRepository.findByEmail(dto.email());
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body("User not found for this email.");
        }

        User user = userOpt.get();
        user.setEmailVerified(true);
        userRepository.save(user);

        return ResponseEntity.ok("Email verified successfully.");
    }

    // =========================================================
    // 3) LOGIN – email + password (no OTP)
    // =========================================================
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest dto) {
        if (isBlank(dto.email()) || isBlank(dto.password())) {
            return ResponseEntity.badRequest().body("Email and password are required.");
        }

        Optional<User> userOpt = userRepository.findByEmail(dto.email());
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body("Invalid email or password.");
        }

        User user = userOpt.get();

        if (!user.isEmailVerified()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Email is not verified. Please verify your email first.");
        }

        if (!passwordEncoder.matches(dto.password(), user.getPasswordHash())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body("Invalid email or password.");
        }

        // 🔹 Return username to frontend so it knows what to show in chats
        LoginResponse resp = new LoginResponse(user.getUsername());
        return ResponseEntity.ok(resp);
    }


    // =========================================================
    // 4) FORGOT PASSWORD – step 1: request reset OTP
    // =========================================================
    @PostMapping("/request-password-reset")
    public ResponseEntity<?> requestPasswordReset(@RequestBody EmailRequest dto) {
        if (isBlank(dto.email())) {
            return ResponseEntity.badRequest().body("Email is required.");
        }

        Optional<User> userOpt = userRepository.findByEmail(dto.email());
        if (userOpt.isEmpty()) {
            // for security, don't reveal if email exists or not
            return ResponseEntity.ok("If this email exists, a reset code has been sent.");
        }

        String code = otpStore.generateAndStore(dto.email());
        try {
            emailService.sendOtpEmail(dto.email(), code);
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to send reset OTP email.");
        }

        return ResponseEntity.ok("If this email exists, a reset code has been sent.");
    }

    // =========================================================
    // 5) FORGOT PASSWORD – step 2: reset with OTP + new password
    // =========================================================
    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@RequestBody ResetPasswordRequest dto) {
        if (isBlank(dto.email()) || isBlank(dto.otp())
                || isBlank(dto.newPassword()) || isBlank(dto.confirmPassword())) {
            return ResponseEntity.badRequest().body("All fields are required.");
        }

        if (!dto.newPassword().equals(dto.confirmPassword())) {
            return ResponseEntity.badRequest().body("Passwords do not match.");
        }

        boolean ok = otpStore.verify(dto.email(), dto.otp());
        if (!ok) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body("Invalid or expired OTP.");
        }

        Optional<User> userOpt = userRepository.findByEmail(dto.email());
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body("User not found for this email.");
        }

        User user = userOpt.get();
        user.setPasswordHash(passwordEncoder.encode(dto.newPassword()));
        userRepository.save(user);

        return ResponseEntity.ok("Password reset successful. You can now log in with the new password.");
    }

    // =========================================================
    // Helper
    // =========================================================
    private boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }

    // =========================================================
    // DTOs as inner records (no extra files needed)
    // =========================================================
    public record RegisterRequest(
            String email,
            String username,
            String firstName,
            String lastName,
            String password,
            String confirmPassword,
            String gender,
            LocalDate dateOfBirth,
            String countryOfOrigin
    ) {}

    public record VerifyEmailRequest(
            String email,
            String otp
    ) {}

    public record LoginRequest(
            String email,
            String password
    ) {}

    public record EmailRequest(
            String email
    ) {}

    public record ResetPasswordRequest(
            String email,
            String otp,
            String newPassword,
            String confirmPassword
    ) {}
    public record LoginResponse(String username) {}

}
