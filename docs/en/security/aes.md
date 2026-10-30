---
isTimeLine: true
title: "AES vs. RSA: How to Choose Between Symmetric and Asymmetric Encryption"
description: Division of labor between symmetric and asymmetric encryption, key and mode selection, with Java implementation. Focuses on why not to use AES/ECB, where the RSA encryption length limit comes from, and how to build hybrid encryption outside TLS.
date: 2024-05-21
updated: 2026-10-31
tags:
- AES
- RSA
- Symmetric encryption
- Asymmetric encryption
- Java
- Encryption algorithm
categories:
- Information Security
- Security
- Encryption
head:
- - meta
  - name: keywords
    content: AES,RSA,Symmetric encryption,Asymmetric encryption,AES/GCM,Encryption mode,Java Encryption,Hybrid encryption,Key Management
translatedFrom: 05cd202de22310d7
---
# AES and RSA: How to Choose Between Symmetric and Asymmetric Encryption

AES and RSA solve different problems: the former encrypts data, the latter encrypts keys. Used separately, neither is complicated; when combined for hybrid encryption, choosing modes and padding is where mistakes easily happen.

Below, I cover selection, AES, RSA, and hybrid encryption in that order.

## The Bottom Line

| Scenario | What to Use | Why |
|---|---|---|
| Encrypting large amounts of data (files, fields, message bodies) | AES-256-GCM | Symmetric encryption, high throughput, with authentication |
| Key exchange, digital signatures, certificates | RSA-2048 or above, or ECDSA/Ed25519 | Asymmetric encryption, can be transmitted publicly |
| Transmitting large files while preventing man-in-the-middle attacks | Hybrid encryption: RSA/ECDSA negotiates the key, AES encrypts the data | This is how TLS works |

In one sentence: **asymmetric encryption is responsible for "securely sending the key out," while symmetric encryption is responsible for "actually moving the data."** Directly using RSA to encrypt business data is a common misuse; see the length limit below for the reason.

---

## 1. AES: Symmetric Encryption

AES (Advanced Encryption Standard) uses the same key for encryption and decryption, supports 128/192/256-bit key lengths, and processes plaintext in 128-bit blocks.

### 1.1 Encryption Process

1. **Key generation**: Choose a 128-, 192-, or 256-bit key
2. **Data blocking**: Split the plaintext into 128-bit blocks; pad the final incomplete block according to the padding rule
3. **Multiple rounds of transformation**: Each round includes SubBytes, ShiftRows, MixColumns, and AddRoundKey

The number of rounds is determined by the key length:

| Key Length | Block Size | Rounds |
|---|---|---|
| AES-128 | 128 bits | 10 |
| AES-192 | 128 bits | 12 |
| AES-256 | 128 bits | 14 |

Decryption is the inverse of the above steps: inverse SubBytes, inverse ShiftRows, inverse MixColumns, and AddRoundKey, in reverse order.

### 1.2 Working Modes: ECB Must Not Be Used

AES is only a block cipher; practical encryption must be combined with a working mode. This is the easiest place to make mistakes:

| Mode | Authenticated | Description |
|---|---|---|
| ECB | No | **Do not use.** The same plaintext block produces the same ciphertext block; after encrypting an image, its outline is still visible |
| CBC | No | Requires a random IV, and the IV must not be reused; prevents pattern leakage but not tampering |
| CTR | No | Turns the block cipher into a stream cipher; the counter likewise must not be reused |
| GCM | Yes | Recommended default. Verifies integrity while encrypting; the IV should be 96 bits and must never be reused |

The concrete consequence of using ECB: when encrypting a batch of records with the same structure (for example, ID numbers or amount fields), identical byte blocks appear at the same positions in the ciphertext. An attacker can tell which rows are equal without decrypting anything.

### 1.3 Java Implementation

```java
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.security.SecureRandom;
import java.util.Base64;

public class AesGcmExample {
    private static final int GCM_TAG_BITS = 128;
    private static final int IV_BYTES = 12; // 96 位，GCM 推荐

    public static void main(String[] args) throws Exception {
        KeyGenerator keyGen = KeyGenerator.getInstance("AES");
        keyGen.init(256);
        SecretKey key = keyGen.generateKey();

        byte[] iv = new byte[IV_BYTES];
        new SecureRandom().nextBytes(iv); // 每次加密都必须重新生成

        String message = "Hello, World!";
        byte[] cipherText = encrypt(message.getBytes("UTF-8"), key, iv);
        System.out.println("cipher: " + Base64.getEncoder().encodeToString(cipherText));

        byte[] plain = decrypt(cipherText, key, iv);
        System.out.println("plain: " + new String(plain, "UTF-8"));
    }

    static byte[] encrypt(byte[] plain, SecretKey key, byte[] iv) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, iv));
        return cipher.doFinal(plain);
    }

    static byte[] decrypt(byte[] cipherText, SecretKey key, byte[] iv) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, iv));
        return cipher.doFinal(cipherText);
    }
}
```

Key points:

- `AES/GCM/NoPadding` uses no padding; GCM has its own authentication tag
- The IV must be randomly generated and stored together with the ciphertext (usually prepended to the ciphertext header). **Reusing an IV under the same key directly breaks GCM's security**
- The `AES/ECB/PKCS5Padding` found in old tutorials may run, but it should not appear in new code

---

## 2. RSA: Asymmetric Encryption

RSA uses a key pair: the public key encrypts, and the private key decrypts. Security is based on the hardness of integer factorization—given n = p×q, deriving p and q is computationally infeasible.

### 2.1 Key Generation Process

1. Choose two large primes p and q
2. Compute n = p × q as the modulus
3. Compute Euler's totient φ(n) = (p−1)(q−1)
4. Choose an integer e such that 1 < e < φ(n) and e is coprime with φ(n) (commonly 65537)
5. Compute d such that d × e ≡ 1 (mod φ(n))
6. Public key (e, n), private key (d, n)

Encryption: C = M^e mod n; decryption: M = C^d mod n.

### 2.2 Key Length and a Hard Upper Limit

| Key Length | Status |
|---|---|
| 1024 bits | No longer secure; do not use for new systems |
| 2048 bits | Current minimum requirement |
| 3072/4096 bits | Higher security margin, slower computation |

**Key limitation**: The length of data RSA can encrypt is constrained by the key length. For example, with a 2048-bit key and PKCS#1 v1.5 padding, a single block can hold at most 245 bytes (256 bytes of key capacity minus 11 bytes of padding overhead). Anything larger must be split into blocks, and block-wise encryption easily introduces padding oracle-type problems.

Therefore, the correct use of RSA is to encrypt a **symmetric key** (around 32 bytes), not business data.

### 2.3 Java Implementation

```java
import javax.crypto.Cipher;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.util.Base64;

public class RsaExample {
    public static void main(String[] args) throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048);
        KeyPair pair = gen.generateKeyPair();
        PublicKey publicKey = pair.getPublic();
        PrivateKey privateKey = pair.getPrivate();

        String message = "Hello, World!";
        byte[] cipherText = encrypt(message.getBytes("UTF-8"), publicKey);
        // 密文是二进制，输出必须编码，否则直接 new String 会得到乱码
        System.out.println("cipher: " + Base64.getEncoder().encodeToString(cipherText));

        byte[] plain = decrypt(cipherText, privateKey);
        System.out.println("plain: " + new String(plain, "UTF-8"));
    }

    static byte[] encrypt(byte[] plain, PublicKey key) throws Exception {
        Cipher cipher = Cipher.getInstance("RSA/ECB/OAEPWithSHA-256AndMGF1Padding");
        cipher.init(Cipher.ENCRYPT_MODE, key);
        return cipher.doFinal(plain);
    }

    static byte[] decrypt(byte[] cipherText, PrivateKey key) throws Exception {
        Cipher cipher = Cipher.getInstance("RSA/ECB/OAEPWithSHA-256AndMGF1Padding");
        cipher.init(Cipher.DECRYPT_MODE, key);
        return cipher.doFinal(cipherText);
    }
}
```

Key points:

- The "ECB" in `RSA/ECB/...` does not represent a block mode; RSA only processes a single block, and this notation is a historical legacy
- Use OAEP for padding, not PKCS1Padding (the latter has a padding oracle attack surface)
- The ciphertext must be Base64- or Hex-encoded before transmission/storage; directly converting binary to a string will lose bytes
- Signing with a 4096-bit key takes about 4 times as long as with 2048 bits; evaluate this for high-frequency server-side signing scenarios

### 2.4 Extracting the Public Key from the Private Key

The PKCS#8 structure of an RSA private key contains the CRT parameters (modulus n, public exponent e, private exponent d, p, q, etc.), so the public key can be reconstructed from the private key:

```java
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.spec.RSAPrivateCrtKeySpec;
import java.security.spec.RSAPublicKeySpec;

KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
gen.initialize(2048);
KeyPair pair = gen.generateKeyPair();
PrivateKey privateKey = pair.getPrivate();

KeyFactory keyFactory = KeyFactory.getInstance("RSA");
RSAPrivateCrtKeySpec privSpec = keyFactory.getKeySpec(privateKey, RSAPrivateCrtKeySpec.class);
RSAPublicKeySpec pubSpec =
        new RSAPublicKeySpec(privSpec.getModulus(), privSpec.getPublicExponent());
PublicKey publicKey = keyFactory.generatePublic(pubSpec);
```

Note: Only CRT-format private keys can do this. If the private key has been stripped down to only (d, n), the public exponent e cannot be recovered.

---

## 3. How the Two Work Together

TLS is the standard answer:

1. The client and server use RSA or ECDHE to negotiate a session key
2. All subsequent traffic is encrypted with AES-GCM
3. The asymmetric part is used only once during the handshake

The same applies in self-built systems:

```
随机生成 AES-256 密钥 K
用对方的 RSA 公钥加密 K → 传输
双方用 K 做 AES-GCM 通信，密钥定期轮换
```

The benefit: asymmetric operations are reduced to a minimum (RSA decryption is orders of magnitude slower than AES), and high-volume traffic goes through symmetric encryption.

---

## 4. Practical Points

| Item | Requirement |
|---|---|
| AES mode | Prefer GCM; CBC must use a random IV and must not reuse it |
| IV / Nonce | Regenerate for every encryption, store with the ciphertext, never reuse |
| RSA padding | OAEP SHA-256, not PKCS1 v1.5 |
| RSA key | Start at 2048 bits; treat 1024 bits as invalid |
| Ciphertext encoding | Base64 or Hex; never directly convert binary to a string |
| Key storage | Do not hard-code in source; use KMS, environment variables, or a key store |
| Authentication vs encryption | GCM provides built-in integrity checking; CBC requires an additional HMAC |

## References

- [NIST SP 800-38D: GCM Mode Specification](https://csrc.nist.gov/pubs/sp/800/38/d/final)
- [RFC 8017: PKCS #1 RSA Specification (including padding and length constraints)](https://www.rfc-editor.org/rfc/rfc8017)
- [Java Cryptography Architecture (JCA) Reference Guide](https://docs.oracle.com/en/java/javase/21/security/java-cryptography-architecture-jca-reference-guide.html)
- [AES (Advanced Encryption Standard) - Wikipedia](https://en.wikipedia.org/wiki/Advanced_Encryption_Standard)