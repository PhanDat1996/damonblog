---
title: "Connection Reset After Client Hello: Prove SNI Blocking"
date: "2026-11-01"
updated: "2026-11-01"
excerpt: "curl connects, sends Client Hello, then gets Connection reset by peer? Prove it is SNI-based blocking with --resolve, then find the hop that injects the RST."
tags: ["networking", "troubleshooting", "debugging", "security"]
featured: false
lab: true
category: "linux"
---

`curl: (35) Recv failure: Connection reset by peer`. The TCP connection to port 443 succeeds, curl sends the TLS Client Hello, and the very next thing it gets is a reset. Every other HTTPS site works. Only one domain fails, on every IP it resolves to, over IPv4 and IPv6.

This post walks through a real case where `linkedin.com` failed exactly like that, and the five commands that proved the cause: the hostname in the TLS handshake was being matched and reset by a device in the upstream network, not by the server, the client or the home router.

> **Lab environment:** macOS 27.0.1 laptop on a home Wi-Fi network (consumer router at `192.168.1.1`, residential fiber ISP). `curl 8.7.1` (LibreSSL 3.3.6), `DiG 9.10.6`, Python 3.14. Everything ran as a normal user; no packet capture or root was needed. The same commands work on Linux.

---

## TL;DR: is it SNI blocking?

```bash
# 1. Does DNS give the real answer? Compare the local resolver with DoH
dig +short www.linkedin.com
curl -s -H 'accept: application/dns-json' \
  'https://cloudflare-dns.com/dns-query?name=www.linkedin.com&type=A'

# 2. Same IP, harmless SNI: does the handshake finish?
curl -sv -k -I --resolve example.com:443:104.18.41.41 https://example.com

# 3. Blocked SNI, unrelated IP: is it still reset?
curl -sv -k -I --resolve www.linkedin.com:443:1.1.1.1 https://www.linkedin.com
```

If (2) completes the handshake and (3) is reset, the filter is looking at the hostname, not the IP. Then lower the IP TTL of the Client Hello to find the hop that sends the reset (see "Which hop sends the reset?" below).

---

## What the failure looks like

```
$ curl -sv -4 -I -m 10 https://www.linkedin.com
*   Trying 104.18.41.41:443...
* Connected to www.linkedin.com (104.18.41.41) port 443
* (304) (OUT), TLS handshake, Client hello (1):
* Recv failure: Connection reset by peer
* LibreSSL/3.3.6: error:02FFF036:system library:func(4095):Connection reset by peer
```

Three things in those lines matter:

- `Connected ... port 443`: the TCP three-way handshake finished, so the IP is not blackholed and nothing is dropping SYNs.
- `Client hello (1)` is the last thing that happened. The Client Hello is the first packet that carries the hostname, in the clear, in the SNI extension.
- `Connection reset by peer`: a TCP RST came back instead of a `Server hello`. A real TLS server that dislikes a request sends a TLS alert, not a bare reset.

IPv6 failed the same way, to a different address:

```
$ curl -sv -6 -I -m 10 https://www.linkedin.com
*   Trying [2a06:98c1:3109::6812:2929]:443...
* Connected to www.linkedin.com (2a06:98c1:3109::6812:2929) port 443
* (304) (OUT), TLS handshake, Client hello (1):
* Recv failure: Connection reset by peer
```

Meanwhile `https://www.google.com` and `https://www.microsoft.com` completed TLS 1.3 handshakes from the same laptop, so the TLS stack and the route out were fine.

| Symptom | Usually means |
|---|---|
| Reset before `Connected` | Port closed or a firewall rejecting the SYN, see [Cannot Connect to Server](/blog/cannot-connect-to-server-linux-troubleshooting) |
| Timeout before `Connected` | Packets dropped on the path |
| `Connected`, then reset right after `Client hello` | Something read the Client Hello and killed the flow: SNI filtering, or a server/LB that refuses that name |
| `Connected`, then a TLS alert (`handshake failure`, `unrecognized name`) | The real server rejected the SNI |

---

## Layer 1: DNS was also lying

Before the reset there was an earlier symptom: the default resolver pointed at the router, and the router returned localhost.

```
$ dig linkedin.com
...
;; ANSWER SECTION:
linkedin.com.		3281	IN	A	127.0.0.1

;; Query time: 3 msec
;; SERVER: fe80::1%15#53(fe80::1%15)
```

`fe80::1%15` is the router's IPv6 link-local address on interface 15 (`en0`). The router also answered `127.0.0.1` over IPv4:

```
$ dig @192.168.1.1 linkedin.com +short
127.0.0.1
```

`127.0.0.1` for a public domain is a classic DNS block page. The router either filters the name itself or forwards to an upstream resolver that does; from the client you can't tell which. Asking a public resolver directly, and DNS-over-HTTPS (which a port-53 interceptor can't touch), both gave the same real answers:

```
$ dig @1.1.1.1 www.linkedin.com +short
www.es.lnkdns.net.
www.linkedin.com.cdn.cloudflare.net.
104.18.41.41
172.64.146.215

$ curl -s -H 'accept: application/dns-json' \
    'https://cloudflare-dns.com/dns-query?name=www.linkedin.com&type=A'
{"Status":0,...,"Answer":[{"name":"www.linkedin.com","type":5,"TTL":132,"data":"www.es.lnkdns.net."},
{"name":"www.es.lnkdns.net","type":5,"TTL":132,"data":"www.linkedin.com.cdn.cloudflare.net."},
{"name":"www.linkedin.com.cdn.cloudflare.net","type":1,"TTL":132,"data":"104.18.41.41"},
{"name":"www.linkedin.com.cdn.cloudflare.net","type":1,"TTL":132,"data":"172.64.146.215"}]}
```

DoH matching plain `dig @1.1.1.1` means port 53 to public resolvers was not being rewritten. Switching the Mac's DNS to `1.1.1.1` fixed name resolution, and that is where most "fix the DNS" advice stops. In this case it only moved the failure one layer up, to the reset above. (On a Mac, `dig` reads `/etc/resolv.conf` only and ignores per-domain resolvers; `scutil --dns` shows what the system really uses. The Linux equivalent is in [How to Check Which DNS Server Linux Is Using](/blog/dns-not-resolving-linux-fix).)

---

## Layer 2: prove the reset follows the hostname

`curl --resolve host:port:ip` lets you send any SNI to any IP. Two swaps separate "this IP is blocked" from "this name is blocked".

**Same LinkedIn IP, harmless SNI.** The handshake completes (with `-k`, because the certificate obviously won't match):

```
$ curl -sv -4 -I -m 10 -k --resolve example.com:443:104.18.41.41 https://example.com
*   Trying 104.18.41.41:443...
* Connected to example.com (104.18.41.41) port 443
* (304) (OUT), TLS handshake, Client hello (1):
* (304) (IN), TLS handshake, Server hello (2):
...
* SSL connection using TLSv1.3 / AEAD-CHACHA20-POLY1305-SHA256 / [blank] / UNDEF
* Server certificate:
*  subject: CN=example.com
```

**LinkedIn SNI, IP that has nothing to do with LinkedIn.** Here the IP is Cloudflare's public resolver, `1.1.1.1`:

```
$ curl -sv -4 -I -m 10 -k --resolve www.linkedin.com:443:1.1.1.1 https://www.linkedin.com
*   Trying 1.1.1.1:443...
* Connected to www.linkedin.com (1.1.1.1) port 443
* (304) (OUT), TLS handshake, Client hello (1):
* Recv failure: Connection reset by peer
```

`1.1.1.1` would answer an unknown SNI with a TLS alert or an HTTP 403, never a reset. The reset comes from whatever read the hostname on the way. The same thing happened with `example.com`'s IP (`172.66.147.243`) as the target.

A shared IP made the point even sharper: `lnkd.in` resolves to `130.211.32.14`, the same address as `linkedin.com`, and it worked:

```
$ curl -sv -4 -I -m 10 https://lnkd.in
*   Trying 130.211.32.14:443...
* Connected to lnkd.in (130.211.32.14) port 443
...
* SSL connection using TLSv1.3 / AEAD-CHACHA20-POLY1305-SHA256 / [blank] / UNDEF
* Server certificate:
*  subject: C=US; ST=California; L=Sunnyvale; O=Linkedin Corporation; CN=www.linkedin.com
```

Same IP, same certificate, different SNI, different result. That rules out an IP blocklist completely. LinkedIn's CDN names (`static.licdn.com`, `media.licdn.com`) also completed their handshakes.

### What exactly is matched

Sending different SNI values to `1.1.1.1` shows the rule. `000 rc=35` is a reset; `403 rc=0` means the handshake finished and Cloudflare answered:

```
SNI=www.linkedin.com -> 000 rc=35
SNI=linkedin.com -> 000 rc=35
SNI=LINKEDIN.COM -> 000 rc=35
SNI=xlinkedin.com -> 403 rc=0
SNI=linkedin.com.example.org -> 403 rc=0
SNI=linkedin.co -> 403 rc=0
SNI=lnkd.in -> 403 rc=0
SNI=example.com -> 403 rc=0
```

The filter matches the domain `linkedin.com` and its subdomains, case-insensitively, but not a plain substring: `xlinkedin.com` and `linkedin.com.example.org` pass. So it is a proper domain-suffix match, not a naive `grep`.

Plain HTTP was filtered too, on the `Host` header:

```
$ curl -sv -4 -I -m 10 http://www.linkedin.com
*   Trying 172.64.146.215:80...
* Connected to www.linkedin.com (172.64.146.215) port 80
> HEAD / HTTP/1.1
* Recv failure: Connection reset by peer
```

---

## Which hop sends the reset?

An injected RST doesn't come from the server, so you can find the injector by limiting how far the Client Hello travels. Open the TCP connection normally, then lower the socket's IP TTL before the TLS handshake. If the Client Hello expires before it reaches the filter, nothing answers. Once the TTL is high enough to pass the filter, the reset appears.

```python
import socket, ssl, sys
ip, sni = sys.argv[1], sys.argv[2]
for ttl in range(1, 13):
    s = socket.create_connection((ip, 443), timeout=4)
    s.setsockopt(socket.IPPROTO_IP, socket.IP_TTL, ttl)
    ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
    try:
        t = ctx.wrap_socket(s, server_hostname=sni); r = "handshake OK"
    except ConnectionResetError: r = "RESET"
    except socket.timeout: r = "timeout (no reply)"
    except Exception as e: r = type(e).__name__ + ": " + str(e)[:60]
    print(f"TTL={ttl:2d}  SNI={sni:20s} -> {r}", flush=True)
    s.close()
    if r == "RESET" or "OK" in r: break
```

```
$ python3 ttlprobe.py 104.18.41.41 www.linkedin.com
TTL= 1  SNI=www.linkedin.com     -> timeout (no reply)
TTL= 2  SNI=www.linkedin.com     -> timeout (no reply)
TTL= 3  SNI=www.linkedin.com     -> timeout (no reply)
TTL= 4  SNI=www.linkedin.com     -> timeout (no reply)
TTL= 5  SNI=www.linkedin.com     -> RESET
```

Put that next to a traceroute to the same address:

```
$ traceroute -n -m 8 -w 1 -q 1 104.18.41.41
traceroute to 104.18.41.41 (104.18.41.41), 8 hops max, 40 byte packets
 1  192.168.1.1  4.414 ms
 2  118.69.185.181  7.006 ms
 3  42.116.133.12  7.224 ms
 4  42.112.0.76  6.774 ms
 5  *
 6  *
 7  *
 8  118.69.250.243  51.721 ms
```

With TTL 1 the Client Hello dies at the home router, and no reset came back, so **the router is not the injector**. The local machine isn't either: a local proxy or endpoint agent would reset at every TTL. The reset appears only once the packet gets past hop 4, which is inside the ISP's network (`whois` puts hops 2 to 8 in the same ISP's AS). The device at hop 5 doesn't answer traceroute, which is typical for inline filtering gear.

```
  laptop ── router ── ISP hop 2 ── hop 3 ── hop 4 ── [hop 5: SNI filter] ──...── CDN
             │                                              │
             └ DNS answers 127.0.0.1                         └ reads SNI / Host,
               (layer 1)                                       injects TCP RST (layer 2)
```

The 127.0.0.1 DNS answer and the SNI reset are two separate controls. Fixing the first only exposes the second.

---

## What you can do about it

| Where the block is | Fix |
|---|---|
| DNS on your own router (parental control, AdGuard/Pi-hole) | Remove the rule in the router, or point clients at another resolver |
| DNS on the ISP resolver | Use another resolver or DoH; this fixes name resolution only |
| SNI/Host reset inside the ISP | Not fixable from DNS. Use a different network (mobile data), a VPN, or ask the ISP. If the filter doesn't reassemble TCP, a [local proxy that splits the Client Hello](/blog/python-sni-split-proxy) also works |
| Corporate firewall or proxy | It's policy. Talk to IT; don't tunnel around it |

Things that won't help against an on-path SNI filter: changing DNS, switching IPv4/IPv6, flushing caches, or trying another browser. Encrypted Client Hello (ECH) hides the SNI, but only when both the browser and the site's CDN support it, so it is not something you can turn on for one blocked site.

To confirm the fix, rerun step 3 of the TL;DR on the new network or VPN: the handshake should complete, or end with the server's own TLS alert.

---

## FAQ

**Can a server cause "Connection reset by peer" right after Client Hello?**
Yes. A load balancer with no matching virtual host, or a server refusing the SNI, can do it. The `--resolve` swap tells you: if the reset follows the name to an unrelated IP like `1.1.1.1`, it is not the server.

**Why did changing DNS to 1.1.1.1 not fix it?**
DNS only returns the IP. The SNI filter acts later, on the hostname inside the TLS handshake, regardless of which IP you connect to.

**Does lowering TTL with Python need root?**
No. `setsockopt(IP_TTL)` on a normal TCP socket works as an unprivileged user on macOS and Linux.

**Is an RST from hop 5 always the ISP?**
It is the first device past hop 4, which here sat inside the ISP's address space. Use `whois` on the surrounding hops to see who owns that segment. See [traceroute examples](/blog/cannot-connect-to-server-linux-troubleshooting) for reading the `*` hops.
