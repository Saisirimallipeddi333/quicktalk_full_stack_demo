package com.quicktalk.controller;

import com.quicktalk.e2ee.KeyPairService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.security.KeyPair;
import java.util.Map;

@RestController
@RequestMapping("/api/crypto")
public class CryptoController {

    private final KeyPairService keyPairService;

    public CryptoController(KeyPairService keyPairService) {
        this.keyPairService = keyPairService;
    }

    @GetMapping("/keypair")
    public ResponseEntity<?> generateKeyPair() throws Exception {
        KeyPair kp = keyPairService.generateKeyPair();
        String pub = keyPairService.toBase64(kp.getPublic());
        return ResponseEntity.ok(Map.of("publicKey", pub));
    }
}
