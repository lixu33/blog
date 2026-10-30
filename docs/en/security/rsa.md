---
isTimeLine: true
title: RSA Encryption and Decryption Algorithm Explained
description: Deep Dive into the RSA Encryption Algorithm and Its Implementation in Java
date: 2024-05-21
tags:
- RSA
- Asymmetric encryption
- Java
categories:
- Information Security
- Security
- Encryption Technology
head:
- - meta
  - name: keywords
    content: RSA,Encryption,Decryption,Asymmetric encryption,Java,Public key,Private Key,Secure transmission
translatedFrom: 44672b14151422cf
---
# Understanding the RSA Encryption and Decryption Algorithm

RSA is an asymmetric encryption algorithm widely used for secure data transmission. It uses a pair of keys (a public key and a private key) to perform encryption and decryption operations. This article describes the principles of RSA encryption and decryption in detail, along with their implementation in Java.

## 1. Principles of RSA Encryption

The RSA encryption algorithm is based on the mathematical properties of two large primes. It uses a public key to encrypt data, and the data can only be decrypted with the corresponding private key. The following are the basic steps of RSA encryption:

1. **Choose two large primes p and q**: These primes are used to generate the keys.
2. **Compute n = p * q**: n is used as the modulus.
3. **Compute φ(n) = (p-1) * (q-1)**: This is Euler's totient function.
4. **Choose a small integer e**: 1 < e < φ(n), and e is coprime with φ(n).
5. **Compute d**: d is the modular multiplicative inverse of e modulo φ(n), that is, d * e ≡ 1 (mod φ(n)).
6. **Public key (e, n)**: used for encryption.
7. **Private key (d, n)**: used for decryption.

## 2. Principles of RSA Decryption

RSA decryption uses the private key to decrypt data that was encrypted with the public key. The decryption process is as follows:

1. **Receive the encrypted message C**.
2. **Use the private key d and the modulus n to compute M = C^d mod n**: this yields the plaintext M.

## 3. Usage Example

### Encryption Process

Suppose we want to encrypt the message "Hello":

1. Convert the message into a numeric representation.
2. Use the public key (e, n) to compute the ciphertext C = M^e mod n.

### Decryption Process

Use the private key (d, n) to compute the plaintext M = C^d mod n.

### Java Example Code

The following is example code that implements RSA encryption and decryption in Java:

```java
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import javax.crypto.Cipher;

public class RSAExample {
    public static void main(String[] args) throws Exception {
        // 生成密钥对
        KeyPairGenerator keyPairGen = KeyPairGenerator.getInstance("RSA");
        keyPairGen.initialize(2048);
        KeyPair pair = keyPairGen.generateKeyPair();
        PublicKey publicKey = pair.getPublic();
        PrivateKey privateKey = pair.getPrivate();

        // 数据加密
        Cipher cipher = Cipher.getInstance("RSA/ECB/PKCS1Padding");
        cipher.init(Cipher.ENCRYPT_MODE, publicKey);
        String message = "Hello, World!";
        byte[] encryptedMessage = cipher.doFinal(message.getBytes());
        System.out.println("Encrypted Message: " + new String(encryptedMessage));

        // 数据解密
        cipher.init(Cipher.DECRYPT_MODE, privateKey);
        byte[] decryptedMessage = cipher.doFinal(encryptedMessage);
        System.out.println("Decrypted Message: " + new String(decryptedMessage));
    }
}
```

**Explanation:**

1. Use `KeyPairGenerator` to generate an RSA key pair.
2. Use the public key to encrypt the message.
3. Use the private key to decrypt the message.

## 4. How to Obtain the Public Key from the Private Key

The process of obtaining the public key (e, n) from the private key (d, n) is as follows:

1. d and n are known.
2. Compute e such that d * e ≡ 1 (mod φ(n)).

### Java Example Code

The following is example code that obtains the public key from the private key in Java:

```java
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.spec.RSAPrivateCrtKeySpec;
import java.security.spec.RSAPublicKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.math.BigInteger;

public class RSAKeyExample {
    public static void main(String[] args) throws Exception {
        // 生成密钥对
        KeyPairGenerator keyPairGen = KeyPairGenerator.getInstance("RSA");
        keyPairGen.initialize(2048);
        KeyPair pair = keyPairGen.generateKeyPair();
        PrivateKey privateKey = pair.getPrivate();

        // 从私钥中提取公钥
        KeyFactory keyFactory = KeyFactory.getInstance("RSA");
        RSAPrivateCrtKeySpec privSpec = keyFactory.getKeySpec(privateKey, RSAPrivateCrtKeySpec.class);
        BigInteger modulus = privSpec.getModulus();
        BigInteger publicExponent = privSpec.getPublicExponent();
        
        RSAPublicKeySpec pubSpec = new RSAPublicKeySpec(modulus, publicExponent);
        PublicKey publicKey = keyFactory.generatePublic(pubSpec);

        System.out.println("Public Key: " + publicKey);
    }
}
```

**Explanation:**

1. Use `KeyPairGenerator` to generate an RSA key pair.
2. Extract the modulus and exponent of the private key.
3. Generate a public key object.

## 5. Summary

RSA is a powerful encryption algorithm that enables secure data transmission through the use of a public key and a private key. This article has described in detail the principles of RSA encryption and decryption, a usage example, the method for obtaining the public key from the private key, and has provided Java example code.

## 6. References

* [RSA (cryptosystem) - Wikipedia](https://en.wikipedia.org/wiki/RSA_(cryptosystem))
* [Java Cryptography Architecture (JCA) Reference Guide](https://docs.oracle.com/javase/8/docs/technotes/guides/security/crypto/CryptoSpec.html)