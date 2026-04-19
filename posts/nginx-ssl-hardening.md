---
title: "NGINX SSL Hardening: From C Grade to A+ on SSL Labs"
date: "2024-09-20"
excerpt: "A step-by-step walkthrough of the NGINX TLS configuration changes that take you from a mediocre SSL rating to a perfect score — without breaking compatibility."
tags: ["nginx", "ssl", "security", "infrastructure"]
featured: true
---

## The Starting Point

A client's NGINX server was serving HTTPS, but an SSL Labs scan returned a **C grade**. The reasons:

- Supporting TLS 1.0 and 1.1 (deprecated, vulnerable)
- Weak cipher suites enabled (RC4, DES, 3DES)
- No HSTS header
- No OCSP stapling
- Default Diffie-Hellman parameters (768-bit, weak)

Let's fix all of it.

## Step 1: Generate Strong DH Parameters

The default DH params that ship with OpenSSL are weak. Generate your own:

```bash
# This takes a few minutes — that's normal
openssl dhparam -out /etc/nginx/ssl/dhparam.pem 4096
```

Use 4096-bit for maximum security. If you need faster TLS handshakes on high-traffic servers, 2048-bit is still acceptable.

## Step 2: The TLS Configuration

Create a shared TLS config snippet at `/etc/nginx/snippets/ssl-params.conf`:

```nginx
# Protocols: TLS 1.2 minimum, 1.3 preferred
ssl_protocols TLSv1.2 TLSv1.3;

# Strong cipher suites only
# ECDHE for forward secrecy, AES-GCM for AEAD, no weak ciphers
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;

# Prefer server cipher order
ssl_prefer_server_ciphers on;

# Custom DH params
ssl_dhparam /etc/nginx/ssl/dhparam.pem;

# Session cache and tickets
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 1d;
ssl_session_tickets off;  # Disable for forward secrecy

# OCSP Stapling
ssl_stapling on;
ssl_stapling_verify on;
resolver 1.1.1.1 8.8.8.8 valid=300s;
resolver_timeout 5s;

# Security headers
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header X-Frame-Options DENY always;
add_header X-Content-Type-Options nosniff always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
```

## Step 3: Apply to Your Server Block

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name example.com www.example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/example.com/chain.pem;

    include snippets/ssl-params.conf;

    # ... rest of config
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;
    return 301 https://$host$request_uri;
}
```

## Step 4: Verify Before Reloading

Always test your config before applying:

```bash
nginx -t
```

If it passes:

```bash
systemctl reload nginx
```

## Step 5: Test the Results

**Online:** [SSL Labs Server Test](https://www.ssllabs.com/ssltest/) — aim for A+.

**CLI with openssl:**

```bash
# Check supported protocols
openssl s_client -connect example.com:443 -tls1 2>&1 | grep -E "SSL|error"
openssl s_client -connect example.com:443 -tls1_1 2>&1 | grep -E "SSL|error"
# Both should show handshake failure

# Check TLS 1.3 works
openssl s_client -connect example.com:443 -tls1_3 2>&1 | grep "Protocol"
# Should show: Protocol  : TLSv1.3
```

**Check HSTS:**

```bash
curl -sI https://example.com | grep -i strict
# Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

**Check OCSP stapling:**

```bash
openssl s_client -connect example.com:443 -status 2>/dev/null | grep -A 10 "OCSP Response"
```

## Common Issues

**OCSP stapling not working:**
- Make sure `ssl_trusted_certificate` points to the CA chain (not the full cert)
- Verify your DNS resolver can reach the OCSP endpoint
- Check NGINX error logs: `grep ocsp /var/log/nginx/error.log`

**Breaking older clients:**
- Dropping TLS 1.0/1.1 will break IE11 on Windows 7 and some old Android versions. If you must support them, add `TLSv1` back and accept the grade hit. For most production APIs, don't — those clients are a security liability.

**`ssl_session_tickets off` concerns:**
- Session tickets can compromise forward secrecy if the ticket key leaks. On a single-server setup the risk is minimal, but it's best practice to disable them.

## The Result

Before: **C grade** — deprecated protocols, weak ciphers, no HSTS.

After: **A+ grade** — TLS 1.2/1.3 only, strong ECDHE ciphers, HSTS with preload, OCSP stapling.

The whole process takes under 30 minutes and meaningfully improves your security posture. There's no good reason not to do it.
