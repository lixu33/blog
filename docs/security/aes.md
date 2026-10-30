---
isTimeLine: true
title: AES 与 RSA：对称与非对称加密怎么选
description: 对称加密与非对称加密的分工、密钥与模式选择，含 Java 实现。重点说明为什么不要用 AES/ECB、RSA 加密长度上限从哪来，以及 TLS 之外混合加密该怎么搭。
date: 2024-05-21
updated: 2026-10-31
tags:
- AES
- RSA
- 对称加密
- 非对称加密
- Java
- 加密算法
categories:
- 信息安全
- Security
- 加密技术
head:
- - meta
  - name: keywords
    content: AES, RSA, 对称加密, 非对称加密, AES/GCM, 加密模式, Java 加密, 混合加密, 密钥管理
---

加密的难点从来不是「怎么写加密代码」，而是「用哪个、怎么组合、哪里会漏」。选错工作模式、复用 IV、拿 RSA 直接加密业务数据——这几种错误在生产环境里都不难找到。

下面先给选型结论，再逐个拆开讲。

## 先说结论

| 场景 | 用什么 | 原因 |
|---|---|---|
| 大量数据加密（文件、字段、消息体） | AES-256-GCM | 对称加密，吞吐高，带认证 |
| 密钥交换、数字签名、证书 | RSA-2048 以上，或 ECDSA/Ed25519 | 非对称加密，能公开传递 |
| 既要传大文件又要防中间人 | 混合加密：RSA/ECDSA 协商密钥，AES 加密数据 | TLS 就是这么做的 |

一句话：**非对称加密负责"安全地把密钥送出去"，对称加密负责"真正搬数据"**。RSA 直接加密业务数据是常见误用，原因见下文长度上限。

---

## 一、AES：对称加密

AES（Advanced Encryption Standard）加密和解密用同一个密钥，支持 128/192/256 位密钥长度，明文按 128 位分块处理。

### 1.1 加密过程

1. **密钥生成**：选定 128、192 或 256 位密钥
2. **数据分块**：明文切成 128 位一块，不足一个块按填充规则补齐
3. **多轮变换**：每轮包括字节替换（SubBytes）、行移位（ShiftRows）、列混淆（MixColumns）和轮密钥加（AddRoundKey）

轮数由密钥长度决定：

| 密钥长度 | 分组大小 | 轮数 |
|---|---|---|
| AES-128 | 128 位 | 10 |
| AES-192 | 128 位 | 12 |
| AES-256 | 128 位 | 14 |

解密是上述步骤的逆运算：逆字节替换、逆行移位、逆列混淆、轮密钥加，顺序倒过来。

### 1.2 工作模式：ECB 不能用

AES 只是分组密码，实际加密要配合工作模式。这是最容易踩坑的地方：

| 模式 | 是否带认证 | 说明 |
|---|---|---|
| ECB | 否 | **不要用**。相同明文块产生相同密文块，图片加密后仍能看出轮廓 |
| CBC | 否 | 需要随机 IV，且 IV 不能重复；能防模式泄露但不防篡改 |
| CTR | 否 | 把分组密码变成流密码，同样不能重复使用计数器 |
| GCM | 是 | 推荐默认选项。加密同时校验完整性，IV 建议 96 位且绝不复用 |

用 ECB 的具体后果：加密一批结构相同的记录（比如身份证号、金额字段），密文中相同位置会出现相同的字节块，攻击者不需要解密就能看出哪些行相等。

### 1.3 Java 实现

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

要点：

- `AES/GCM/NoPadding` 不用填充，GCM 自带认证标签
- IV 必须随机生成并随密文一起存储（通常前置在密文头部），**同一个密钥下重复 IV 会直接破坏 GCM 的安全性**
- 老教程里的 `AES/ECB/PKCS5Padding` 能跑通，但不该出现在新代码里

---

## 二、RSA：非对称加密

RSA 用一对密钥：公钥加密、私钥解密。安全性基于大整数分解难题——已知 n = p×q，反推 p、q 在计算上不可行。

### 2.1 密钥生成过程

1. 选两个大素数 p 和 q
2. 计算 n = p × q，作为模数
3. 计算欧拉函数 φ(n) = (p−1)(q−1)
4. 选整数 e，满足 1 < e < φ(n) 且 e 与 φ(n) 互质（常用 65537）
5. 计算 d，使 d × e ≡ 1 (mod φ(n))
6. 公钥 (e, n)，私钥 (d, n)

加密：C = M^e mod n；解密：M = C^d mod n。

### 2.2 密钥长度与一个硬性上限

| 密钥长度 | 状态 |
|---|---|
| 1024 位 | 已不安全，不要再用于新系统 |
| 2048 位 | 当前最低要求 |
| 3072/4096 位 | 更高安全边际，运算更慢 |

**关键限制**：RSA 能加密的数据长度受密钥长度约束。以 2048 位密钥 + PKCS#1 v1.5 填充为例，单块最多 245 字节（256 字节密钥容量减去 11 字节填充开销）。超过就必须分段，而分段加密又容易引入 padding oracle 类问题。

所以 RSA 的正确用途是加密**对称密钥**（32 字节左右），不是加密业务数据。

### 2.3 Java 实现

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

要点：

- `RSA/ECB/...` 里的 "ECB" 不代表分组模式，RSA 只处理单块，这个写法是历史遗留
- 填充用 OAEP，不要用 PKCS1Padding（后者存在 padding oracle 攻击面）
- 密文必须 Base64 或 Hex 编码后再传输/存储，二进制直接转字符串会丢字节
- 4096 位密钥签名速度约为 2048 位的 4 倍耗时，服务端高频签名场景要评估

### 2.4 从私钥提取公钥

RSA 私钥的 PKCS#8 结构里包含 CRT 参数（模数 n、公钥指数 e、私钥指数 d、p、q 等），因此可以从私钥重建公钥：

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

注意：只有 CRT 格式的私钥能这么做。如果私钥被剥离成仅含 (d, n)，公钥指数 e 就找不回来了。

---

## 三、两者如何配合

TLS 就是标准答案：

1. 客户端与服务端用 RSA 或 ECDHE 协商出一个会话密钥
2. 之后的流量全部用 AES-GCM 加密
3. 非对称部分只在握手时用一次

自建系统里同样适用：

```
随机生成 AES-256 密钥 K
用对方的 RSA 公钥加密 K → 传输
双方用 K 做 AES-GCM 通信，密钥定期轮换
```

这样做的收益：非对称运算次数降到最低（RSA 解密比 AES 慢几个数量级），大流量走对称加密。

---

## 四、实践要点

| 事项 | 要求 |
|---|---|
| AES 模式 | GCM 优先；CBC 必须随机 IV 且不复用 |
| IV / Nonce | 每次加密重新生成，随密文存储，绝不复用 |
| RSA 填充 | OAEP SHA-256，不用 PKCS1 v1.5 |
| RSA 密钥 | 2048 位起步，1024 位视为失效 |
| 密文编码 | Base64 或 Hex，禁止直接二进制转字符串 |
| 密钥存储 | 不写死在代码里；用 KMS、环境变量或密钥库 |
| 认证 vs 加密 | GCM 自带完整性校验；CBC 需额外加 HMAC |

## 参考

- [NIST SP 800-38D：GCM 模式规范](https://csrc.nist.gov/pubs/sp/800/38/d/final)
- [RFC 8017：PKCS #1 RSA 规范（含填充与长度约束）](https://www.rfc-editor.org/rfc/rfc8017)
- [Java Cryptography Architecture (JCA) Reference Guide](https://docs.oracle.com/en/java/javase/21/security/java-cryptography-architecture-jca-reference-guide.html)
- [AES (Advanced Encryption Standard) - Wikipedia](https://en.wikipedia.org/wiki/Advanced_Encryption_Standard)
