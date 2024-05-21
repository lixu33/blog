---
isTimeLine: true
title: 理解 AES 加解密算法
date: 2024-05-21
tags:
 - AES
 - 加密
 - 解密
categories:
 - 加密技术
keywords: AES, 加密, 解密, 对称加密, Java
---

# 理解 AES 加解密算法

AES（高级加密标准）是一种对称加密算法，被广泛应用于数据加密。它使用相同的密钥进行加密和解密操作。本文将详细介绍 AES 加解密的原理、使用。

## 1. AES 加密原理

AES 是一种对称加密算法，意味着加密和解密使用相同的密钥。AES 支持128位、192位和256位密钥长度。以下是 AES 加密的基本步骤：

1. **密钥生成**：选择一个密钥长度（128位、192位或256位）并生成密钥。
2. **数据分块**：将数据分成固定大小的块（128位）。
3. **加密过程**：使用密钥对每个数据块进行多轮加密操作（10、12或14轮，取决于密钥长度）。

## 2. AES 解密原理

AES 解密使用相同的密钥来解密由 AES 加密的数据。解密过程与加密过程相反，执行相同的步骤但顺序相反。

## 3. 使用示例

### 加密过程

假设我们要加密消息 "Hello, World!"：

1. 选择一个密钥（例如，128位密钥）。
2. 使用 AES 算法和密钥对消息进行加密，得到密文。

### 解密过程

使用相同的密钥和 AES 算法对密文进行解密，得到原始消息。

## 4. Java 示例代码

以下是使用 Java 实现 AES 加密和解密的示例代码：

```java
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;

public class AESExample {
    public static void main(String[] args) throws Exception {
        // 生成密钥
        KeyGenerator keyGen = KeyGenerator.getInstance("AES");
        keyGen.init(128); // 选择AES-128
        SecretKey secretKey = keyGen.generateKey();

        // 将密钥转换为字节数组
        byte[] keyBytes = secretKey.getEncoded();
        SecretKeySpec keySpec = new SecretKeySpec(keyBytes, "AES");

        // 数据加密
        Cipher cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");
        cipher.init(Cipher.ENCRYPT_MODE, keySpec);
        String message = "Hello, World!";
        byte[] encryptedMessage = cipher.doFinal(message.getBytes());
        String encodedMessage = Base64.getEncoder().encodeToString(encryptedMessage);
        System.out.println("Encrypted Message: " + encodedMessage);

        // 数据解密
        cipher.init(Cipher.DECRYPT_MODE, keySpec);
        byte[] decodedMessage = Base64.getDecoder().decode(encodedMessage);
        byte[] decryptedMessage = cipher.doFinal(decodedMessage);
        System.out.println("Decrypted Message: " + new String(decryptedMessage));
    }
}
```

**解释:**

1. 使用 `KeyGenerator` 生成AES密钥。
2. 将密钥转换为 `SecretKeySpec` 对象。
3. 使用 AES 算法和密钥加密消息。
4. 使用相同的密钥解密消息。

## 5. 总结

AES 是一种强大的对称加密算法，通过使用相同的密钥实现数据的加密和解密。本文详细介绍了 AES 的加解密原理、使用示例，并提供了 Java 的示例代码。

## 6. 参考

* [AES (Advanced Encryption Standard) - Wikipedia](https://en.wikipedia.org/wiki/Advanced_Encryption_Standard)
* [Java Cryptography Architecture (JCA) Reference Guide](https://docs.oracle.com/javase/8/docs/technotes/guides/security/crypto/CryptoSpec.html)