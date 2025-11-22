package com.quicktalk.auth;

public record OtpVerifyDto(String email, String username, String otp) {
}
