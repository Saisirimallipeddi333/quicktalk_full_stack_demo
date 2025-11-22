package com.quicktalk.auth;

import org.springframework.stereotype.Service;

@Service
public class EmailService {

    public void sendOtpEmail(String to, String otp) {
        // For now, just log the OTP to the console.
        // Later we can replace this with real email sending using Spring Mail.
        System.out.println("=== MOCK EMAIL SERVICE ===");
        System.out.println("To: " + to);
        System.out.println("Your QuickTalk OTP is: " + otp);
        System.out.println("==========================");
    }
}
