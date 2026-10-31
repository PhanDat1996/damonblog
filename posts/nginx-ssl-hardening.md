---
title: "NGINX SSL Hardening: TLS Config That Scores A+ on SSL Labs"
date: "2024-09-20"
updated: "2026-10-28"
excerpt: "Get NGINX to an A+ on SSL Labs: TLS 1.2/1.3 only, modern ciphers, HSTS done safely, and which old advice (4096-bit DH, OCSP, X-XSS) to drop."
tags: ["nginx", "ssl", "security", "infrastructure"]
featured: true
category: "security"
---

You run SSL Labs against your site and get a **B**, or a pentest report lands with "TLS 1.0 enabled" and "weak cipher suites" on page one. You search for a fix and find a dozen NGINX snippets, half of them from 2017. They generate 4096-bit DH parameters, set `X-XSS-Protection`, and enable OCSP stapling for a CA that no longer runs OCSP.

This post gives you a current config, explains each line so you know what you can safely change, and shows how to verify the result from the command line.

---

## TL;DR: the config

`/etc/nginx/snippets/tls.conf`:

```nginx
ssl_protocols TLSv1.2 TLSv1.3;

# Applies to TLS 1.2 only. TLS 1.3 suites are configured separately and are all strong.
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
ssl_prefer_server_ciphers off;

ssl_session_cache shared:SSL:10m;   # ~40,000 sessions
ssl_session_timeout 1d;
ssl_session_tickets off;

add_header Strict-Transport-Security "max-age=63072000" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

Server block:

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;                       # NGINX 1.25.1+; older: "listen 443 ssl http2;"
    server_name example.com www.example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    include snippets/tls.conf;
    server_tokens off;

    # ... locations
}

server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;
    return 301 https://$host$request_uri;
}
```

```bash
nginx -t && systemctl reload nginx
```

This matches the "intermediate" profile of the [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/), minus the DHE suites (see below). Use the generator as the reference when your NGINX or OpenSSL version differs.

If you also enable HTTP/3 with `listen 443 quic`, NGINX opens UDP sockets with their own set of 2026 advisories. How to check that and turn QUIC off cleanly: [NGINX HTTP/3 CVEs](/blog/nginx-cve-2026-42530-http3-quic).

---

## What drives the SSL Labs grade

SSL Labs scores protocol support, key exchange, and cipher strength, then applies caps for specific problems. The ones that usually hold sites back:

| Finding | Effect | Fix |
|---|---|---|
| TLS 1.0 or 1.1 enabled | Grade capped at B | `ssl_protocols TLSv1.2 TLSv1.3;` |
| Incomplete certificate chain | Grade capped at B | Use `fullchain.pem`, not `cert.pem` |
| Weak or non-forward-secret ciphers (RC4, 3DES, static RSA) | Lower grade | ECDHE-only `ssl_ciphers` |
| No HSTS | A at most, no A+ | `Strict-Transport-Security` header with a long max-age |

A+ needs a clean A plus HSTS with a long `max-age` (at least six months). OCSP stapling and custom DH parameters aren't required.

---

## Why each line is there

### Protocols: TLS 1.2 and 1.3 only

TLS 1.0 and 1.1 are formally deprecated (RFC 8996), and all current browsers have removed them. Dropping them only cuts off very old clients such as Android 4.3 and earlier, IE 10 and earlier, and Java 6.

If you can drop TLS 1.2 too (internal APIs, modern clients only), Mozilla's "modern" profile is just:

```nginx
ssl_protocols TLSv1.3;
ssl_prefer_server_ciphers off;
```

No `ssl_ciphers` line is needed there: that directive only affects TLS 1.2 and below.

### Ciphers: ECDHE + AEAD

Every suite in the list uses ECDHE (forward secrecy) and an AEAD cipher (AES-GCM or ChaCha20-Poly1305). No CBC, no RC4, no 3DES, no static-RSA key exchange.

`ssl_ciphers` doesn't touch TLS 1.3. With OpenSSL 1.1.1+, TLS 1.3 uses its own suite list (AES-GCM and ChaCha20), and all of those are strong. You can change it with `ssl_conf_command Ciphersuites ...` (NGINX 1.19.4+), but there's rarely a reason to.

### `ssl_prefer_server_ciphers off`

Older guides set this to `on` so the server could push clients away from weak ciphers. When every cipher you offer is strong, there's nothing to push away from. Letting the client choose lets phones without AES hardware pick ChaCha20, which is faster for them. Mozilla's intermediate and modern profiles both set it `off`. In a TLS 1.3-only config, all suites are strong, so the setting has no security effect at all.

### No `ssl_dhparam` needed

DH parameters only matter for **DHE** cipher suites. Since NGINX 1.11.0, DHE isn't used at all unless you set `ssl_dhparam`, and the list above contains no DHE suites. So skip `openssl dhparam 4096`. It takes minutes to generate and makes every DHE handshake slower.

If you must support clients that lack ECDHE (some Windows 7-era and embedded clients), add Mozilla's DHE suites and use the standardized `ffdhe2048` group that the Mozilla generator links to, not a self-generated 4096-bit file.

### Session cache on, tickets off

`ssl_session_cache shared:SSL:10m` lets returning clients resume sessions without a full handshake, shared across workers. `ssl_session_tickets off` follows Mozilla's guidance: NGINX doesn't rotate its ticket encryption key automatically, and a long-lived ticket key weakens forward secrecy. If you run many NGINX nodes behind a load balancer and need tickets for resumption, use `ssl_session_ticket_key` files and rotate them yourself.

### OCSP stapling: only if your CA still does OCSP

Older configs include:

```nginx
ssl_stapling on;
ssl_stapling_verify on;
```

Let's Encrypt shut down its OCSP service in 2025, and its certificates no longer contain an OCSP URL. With those certificates NGINX logs `"ssl_stapling" ignored, no OCSP responder URL in the certificate` and staples nothing. Keep stapling only if your CA's certificates still include an OCSP responder. It doesn't affect the SSL Labs grade either way.

---

## HSTS: the A+ requirement, with sharp edges

```nginx
add_header Strict-Transport-Security "max-age=63072000" always;
```

After a browser sees this header, it refuses plain HTTP for your domain for `max-age` seconds (here, two years). Before you set it:

- **Start small.** Use `max-age=300` for a day, confirm nothing breaks, then raise it.
- **`includeSubDomains`** applies the rule to every subdomain. Any internal tool still served over plain HTTP (`http://legacy.example.com`) becomes unreachable in browsers.
- **`preload`** asks browsers to hardcode your domain. Removal from the preload list takes months. Add it only when every subdomain is HTTPS-only for good.

### The `add_header` inheritance trap

`add_header` directives are inherited from the outer level **only if the current level defines none of its own**. One `add_header Cache-Control ...` inside a location silently drops HSTS and every other security header for that location:

```nginx
server {
    include snippets/tls.conf;           # HSTS defined here

    location /static/ {
        add_header Cache-Control "public, max-age=86400";
        # HSTS, nosniff, Referrer-Policy are NOT sent for /static/ anymore
    }
}
```

Either repeat the `include` inside such locations, or check responses with `curl -sI` after every config change. This is the most common reason a site's header scan disagrees with its config.

### Headers to drop

- **`X-XSS-Protection`**: modern browsers removed the XSS auditor it controlled, and the header itself has caused vulnerabilities. Omit it (or send `0`).
- **`X-Frame-Options DENY`**: still fine, but a `Content-Security-Policy: frame-ancestors 'none'` is the modern equivalent. A full CSP is application-specific, so don't copy one blindly.

---

## Verify from the command line

```bash
# Which protocol and cipher does a modern client get?
openssl s_client -connect example.com:443 -servername example.com </dev/null 2>/dev/null \
  | grep -E "Protocol|Cipher"
#     Protocol  : TLSv1.3
#     Cipher    : TLS_AES_256_GCM_SHA384

# Does TLS 1.2 still work?
openssl s_client -connect example.com:443 -servername example.com -tls1_2 </dev/null 2>/dev/null \
  | grep -E "Protocol|Cipher"

# HSTS present?
curl -sI https://example.com | grep -i strict-transport
# strict-transport-security: max-age=63072000
```

**Testing that TLS 1.0/1.1 are really off:** a failing `openssl s_client -tls1` doesn't prove much, because OpenSSL 3.x often refuses TLS 1.0/1.1 on the **client** side at its default security level. Use a scanner that tests from the server's perspective:

```bash
nmap --script ssl-enum-ciphers -p 443 example.com
# or: testssl.sh example.com
```

For the public grade, run [SSL Labs](https://www.ssllabs.com/ssltest/). If the scan fails on certificate or chain errors rather than protocol settings, the TLS section of the [NGINX troubleshooting guide](/blog/nginx-troubleshooting-guide) shows how to check the cert/key pair and chain.

---

## Beyond TLS: the rest of the hardening

TLS settings are one part of an NGINX security baseline. The [NGINX CIS Hardening Checker](/tools/nginx-cis-hardening-checker) audits a pasted config against the CIS benchmark items: `server_tokens`, request size limits, missing headers, and the TLS settings above. Since TLS bugs in NGINX itself also matter, check your installed version (`nginx -v`) against known vulnerabilities with the [NGINX CVE Checker](/tools/nginx-cve-checker). On a distro package, confirm each result in the package changelog, because fixes are usually backported without a version change: [Is my NGINX vulnerable? Version vs distro backports](/blog/check-nginx-version-vulnerable-backports). The host underneath needs the same treatment; [CIS Level 1 hardening for Ubuntu](/blog/cis-level1-ubuntu-hardening) covers the OS side.

---

## Checklist

1. `ssl_protocols TLSv1.2 TLSv1.3`, ECDHE+AEAD ciphers, `ssl_prefer_server_ciphers off`.
2. `fullchain.pem` as `ssl_certificate`.
3. No `ssl_dhparam` unless you deliberately enable DHE.
4. Remove `ssl_stapling` if your CA no longer provides OCSP.
5. HSTS with a short `max-age` first, then two years. Add `includeSubDomains`/`preload` only deliberately.
6. Check every location for `add_header` overrides with `curl -sI`.
7. `nginx -t && systemctl reload nginx`, then re-scan.

---

## FAQ

**Is ssl_prefer_server_ciphers on still recommended?**
Not with a modern cipher list. When every offered TLS 1.2 cipher is strong, `off` lets clients pick the fastest one for their hardware. It mattered when servers had to offer weak ciphers for compatibility.

**Do I still need to generate dhparam.pem?**
No, if your cipher list has no DHE suites, as above. If you need DHE for old clients, use the RFC 7919 `ffdhe2048` group rather than generating your own.

**Will dropping TLS 1.0 and 1.1 break anything?**
Only very old clients and some legacy embedded devices or scripts on old runtimes. Check your access logs with `$ssl_protocol` in the log format for a few days if you're unsure.

---

*Related: [NGINX Troubleshooting Guide](/blog/nginx-troubleshooting-guide) for handshake and certificate errors. [Linux Security Hardening Guide](/blog/linux-security-hardening-guide) for the rest of the host.*
