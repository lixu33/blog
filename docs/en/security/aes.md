---
isTimeLine: true
title: "AES vs RSA: Choosing Between Symmetric and Asymmetric Encryption"
description: Division of labor between symmetric and asymmetric encryption, key and mode selection, with Java implementation. Focus on why not to use AES/ECB, where RSA's encryption length limit comes from, and how to build hybrid encryption outside TLS.
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
- Information security
- Security
- Encryption technology
head:
- - meta
  - name: keywords
    content: AES,RSA,Symmetric encryption,Asymmetric encryption,AES/GCM,Encryption Mode,Java Encryption,Hybrid encryption,Key Management
translatedFrom: 1369c801450ded9f
---
## The Short Answer

| Scenario | Use | Reason |
|---|---|---|
| Bulk data encryption (files, fields, message bodies) | AES-256-GCM | Symmetric encryption, high throughput, with authentication |
| Key exchange, digital signatures, certificates | RSA-2048 or higher, or ECDSA/Ed25519 | Asymmetric encryption, can be transmitted publicly |
| Need to transfer large files while preventing man-in-the-middle attacks | Hybrid encryption: negotiate a key with RSA/ECDSA, encrypt data with AES | This is how TLS works |

In one sentence: **Asymmetric encryption is responsible for “securely sending the key out,” while symmetric encryption is responsible for “actually moving the data.”** Encrypting business data directly with RSA is a common misuse; see the length limit below for why.

---

## 1. AES: Symmetric Encryption

AES (Advanced Encryption Standard) uses the same key for encryption and decryption, supports 128/192/256-bit key lengths, and processes plaintext in 128-bit blocks.

### 1.1 Encryption Process

1. **Key generation**: Choose a 128-, 192-, or 256-bit key
2. **Data blocking**: Split the plaintext into 128-bit blocks; pad the final block according to the padding rules if it is incomplete
3. **Multiple rounds of transformations**: Each round includes SubBytes, ShiftRows, MixColumns, and AddRoundKey

The number of rounds depends on key length:

| Key length | Block size | Rounds |
|---|---|---|
| AES-128 | 128-bit | 10 |
| AES-192 | 128-bit | 12 |
| AES-256 | 128-bit | 14 |

Decryption is the inverse of the above steps: inverse byte substitution, inverse shift rows, inverse mix columns, and add round key, in reverse order.

### 1.2 Modes of Operation: ECB Must Not Be Used

AES is only a block cipher; practical encryption must use a mode of operation. This is where mistakes are most likely:

| Mode | Authenticated? | Description |
|---|---|---|
| ECB | No | **Do not use**. Identical plaintext blocks produce identical ciphertext blocks; after encrypting an image, its outline is still visible |
| CBC | No | Requires a random IV, and the IV must not be reused; prevents pattern leakage but not tampering |
| CTR | No | Turns a block cipher into a stream cipher; likewise, the counter must not be reused |
| GCM | Yes | Recommended default. Encrypts and verifies integrity at the same time; use a 96-bit IV and never reuse it |

Specific consequence of using ECB: when encrypting a batch of records with the same structure (e.g., ID numbers or amount fields), identical byte blocks appear at the same positions in the ciphertext, and an attacker can tell which rows are equal without decrypting them.

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

- `AES/GCM/NoPadding` does not use padding; GCM has its own authentication tag
- The IV must be randomly generated and stored with the ciphertext (usually prefixed to the ciphertext). **Reusing an IV under the same key directly breaks GCM's security**
- `AES/ECB/PKCS5Padding` from old tutorials may run, but it should not appear in new code

---

## 2. RSA: Asymmetric Encryption

RSA uses a key pair: the public key encrypts, and the private key decrypts. Its security is based on the difficulty of integer factorization—given n = p×q, deriving p and q is computationally infeasible.

### 2.1 Key Generation Process

1. Choose two large primes p and q
2. Compute n = p × q as the modulus
3. Compute Euler's totient φ(n) = (p−1)(q−1)
4. Choose an integer e such that 1 < e < φ(n) and e is coprime to φ(n) (65537 is commonly used)
5. Compute d such that d × e ≡ 1 (mod φ(n))
6. Public key (e, n), private key (d, n)

Encryption: C = M^e mod n; decryption: M = C^d mod n.

### 2.2 Key Length and a Hard Limit

| Key length | Status |
|---|---|
| 1024-bit | No longer secure; do not use in new systems |
| 2048-bit | Current minimum requirement |
| 3072/4096-bit | Greater security margin, slower computation |

**Key limitation**: The amount of data RSA can encrypt is constrained by the key length. With a 2048-bit key and PKCS#1 v1.5 padding, for example, a single block can hold at most 245 bytes (256 bytes of key capacity minus 11 bytes of padding overhead). Anything larger must be split into blocks, and block-wise encryption tends to introduce padding oracle-type issues.

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

- The “ECB” in `RSA/ECB/...` does not denote a block mode; RSA only handles a single block, and this notation is a historical leftover
- Use OAEP padding, not PKCS1Padding (the latter has a padding oracle attack surface)
- Ciphertext must be Base64 or Hex encoded before transmission/storage; converting binary directly to a string loses bytes
- Signing with a 4096-bit key takes about 4 times as long as with a 2048-bit key; evaluate this for high-frequency server-side signing scenarios

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

Note: Only private keys in CRT format allow this. If the private key is stripped down to only (d, n), the public exponent e cannot be recovered.

---

## 3. How the Two Work Together

TLS is the standard answer:

1. The client and server negotiate a session key using RSA or ECDHE
2. All subsequent traffic is encrypted with AES-GCM
3. The asymmetric part is used only once during the handshake

The same applies to self-built systems:

```
随机生成 AES-256 密钥 K
用对方的 RSA 公钥加密 K → 传输
双方用 K 做 AES-GCM 通信，密钥定期轮换
```

The benefit: asymmetric operations are minimized (RSA decryption is orders of magnitude slower than AES), and high-volume traffic uses symmetric encryption.

---

## 4. Practical Guidelines

| Item | Requirement |
|---|---|
| AES mode | Prefer GCM; CBC must use a random, non-reused IV |
| IV / Nonce | Regenerate for every encryption, store with the ciphertext, never reuse |
| RSA padding | OAEP SHA-256, not PKCS1 v1.5 |
| RSA key | Start at 2048-bit; treat 1024-bit as invalid |
| Ciphertext encoding | Base64 or Hex; direct binary-to-string conversion is forbidden |
| Key storage | Do not hardcode in source; use KMS, environment variables, or a keystore |
| Authentication vs encryption | GCM provides built-in integrity verification; CBC requires an additional HMAC |

## References

- [NIST SP 800-38D: GCM mode specification](https://csrc.nist.gov/pubs/sp/800/38/d/final)
- [RFC 8017: PKCS #1 RSA specification (including padding and length constraints)](https://www.rfc-editor.org/rfc/rfc8017)
- [Java Cryptography Architecture (JCA) Reference Guide](https://docs.oracle.com/en/java/javase/21/security/java-cryptography-architecture-jca-reference-guide.html)
- [AES (Advanced Encryption Standard) - Wikipedia](https://en.wikipedia.org/wiki/Advanced_Encryption_Standard)