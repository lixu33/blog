---
isTimeLine: true
title: Detailed Explanation of the AES Encryption and Decryption Algorithm
description: Understand the basic principles, usage, and Java implementation of AES encryption and decryption.
date: 2024-05-21
tags:
- AES
- Symmetric encryption
- Java
categories:
- Information Security
- Security
- Encryption technology
head:
- - meta
  - name: keywords
    content: AES,Encryption,Decryption,Symmetric encryption,Java,Data security,Encryption algorithm
translatedFrom: c5933653ea395e33
---
# Understanding the AES Encryption and Decryption Algorithm

AES (Advanced Encryption Standard) is a symmetric encryption algorithm widely used for data encryption. It uses the same key for both encryption and decryption. This article introduces the principles of AES encryption and decryption, how to use it, and its implementation in Java in detail.

## 1. Principles of AES Encryption

AES is a symmetric encryption algorithm, meaning that encryption and decryption use the same key. AES supports key lengths of 128, 192, and 256 bits. The basic steps of AES encryption are as follows:

1. **Key generation**: Choose a key length (128, 192, or 256 bits) and generate a key.
2. **Data blocking**: Divide the data into fixed-size blocks (128 bits).
3. **Encryption process**: Use the key to perform multiple rounds of encryption operations on each data block (10, 12, or 14 rounds, depending on the key length).

### 1.1 Key Generation

AES supports three different key lengths: 128, 192, and 256 bits. The longer the key, the higher the security, but encryption and decryption are also slightly slower.

### 1.2 Data Blocking

AES divides the input data into fixed-size blocks (128 bits). If the data length is less than one block, padding is used to fill it.

### 1.3 Encryption Process

The encryption process consists of multiple rounds of substitution and permutation operations. Each round includes SubBytes, ShiftRows, MixColumns, and AddRoundKey operations. The number of rounds depends on the key length: 10 rounds for a 128-bit key, 12 rounds for a 192-bit key, and 14 rounds for a 256-bit key.

## 2. Principles of AES Decryption

AES decryption uses the same key to decrypt data encrypted by AES. The decryption process is the reverse of the encryption process, performing the same steps in reverse order.

### 2.1 Decryption Process

The decryption process consists of multiple rounds of inverse operations. Each round includes InvSubBytes, InvShiftRows, InvMixColumns, and AddRoundKey operations.

## 3. Usage Example

### 3.1 Encryption Process

Suppose we want to encrypt the message "Hello, World!":

1. Choose a key (for example, a 128-bit key).
2. Use the AES algorithm and the key to encrypt the message and obtain the ciphertext.

### 3.2 Decryption Process

Use the same key and the AES algorithm to decrypt the ciphertext and obtain the original message.

## 4. Java Example Code

The following is example code for implementing AES encryption and decryption in Java:

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

**Explanation:**

1. Use `KeyGenerator` to generate an AES key.
2. Convert the key into a `SecretKeySpec` object.
3. Use the AES algorithm and the key to encrypt the message.
4. Use the same key to decrypt the message.

## 5. Summary

AES is a powerful symmetric encryption algorithm that encrypts and decrypts data by using the same key. This article introduces the principles of AES encryption and decryption, usage examples, and provides Java example code in detail.

## 6. References

* [AES (Advanced Encryption Standard) - Wikipedia](https://en.wikipedia.org/wiki/Advanced_Encryption_Standard)
* [Java Cryptography Architecture (JCA) Reference Guide](https://docs.oracle.com/javase/8/docs/technotes/guides/security/crypto/CryptoSpec.html)