---
title: "Build a Python Proxy That Splits the TLS Client Hello"
date: "2026-11-01"
updated: "2026-11-01"
excerpt: "An SNI filter resets your HTTPS? Build a 150-line Python CONNECT proxy that splits the Client Hello, and see which split sizes beat the DPI in a real test."
tags: ["networking", "security", "troubleshooting", "debugging"]
featured: false
lab: true
category: "security"
---

`curl: (35) Recv failure: Connection reset by peer`, right after `Client hello`, for one domain only. The [previous lab](/blog/tls-connection-reset-sni-blocking) proved that pattern was an on-path filter in the ISP network reading the SNI and injecting a TCP RST. Changing DNS doesn't touch it.

This post builds the other half: a small local proxy that sends the Client Hello in two TCP segments so the filter can't read the hostname, then tests it with curl and Chrome against the same filter.

> **Lab environment:** macOS 27.0.1 laptop on a home fiber connection whose ISP resets TLS connections with SNI `linkedin.com` (diagnosed in the [previous post](/blog/tls-connection-reset-sni-blocking)). Python 3.14, standard library only. `curl 8.7.1` (LibreSSL 3.3.6), headless Google Chrome. All runs as a normal user; the proxy listens on `127.0.0.1` only and the system proxy settings were never changed.

---

## TL;DR

- Many DPI boxes inspect the first segment of a flow and don't reassemble TCP. If the 5-byte TLS record header goes out alone, the hostname arrives in a segment they never parse.
- In this lab, splitting at byte **5** got through. Sending the hello whole, or splitting at byte **100**, still got reset.
- The trick needs `TCP_NODELAY` on the upstream socket. Without it the kernel may merge the two writes back into one segment.
- TLS is not decrypted. The browser still validates the real site certificate end to end.

Before using this anywhere: on a corporate or managed network, a filter is policy, and a tool built to slip past it is a policy violation however small it is. This is for networks you're entitled to use as you choose. Rules on circumventing ISP filtering vary by country.

---

## Step 1: confirm splitting works before writing a proxy

A proxy is wasted effort if the filter reassembles TCP. So first, one hand-built Client Hello, sent three ways. The script uses `ssl.MemoryBIO` to make Python produce a real Client Hello without sending it, then writes it to a plain socket:

```python
import socket, ssl, sys, time
ip, sni, split = sys.argv[1], sys.argv[2], int(sys.argv[3])
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
inc, out = ssl.MemoryBIO(), ssl.MemoryBIO()
obj = ctx.wrap_bio(inc, out, server_hostname=sni)
try: obj.do_handshake()
except ssl.SSLWantReadError: pass
hello = out.read()                      # the Client Hello bytes, not yet sent
s = socket.create_connection((ip, 443), timeout=6)
s.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
if split:
    s.send(hello[:split]); time.sleep(0.2); s.send(hello[split:])
else:
    s.send(hello)
# ... then feed the server's replies back into obj until the handshake completes
```

Certificate checks are off in this probe because the python.org build on this Mac shipped without a CA bundle. The certificate is checked separately with `openssl` below, and by curl through the finished proxy.

```
split=0: RESET
split=5: handshake OK TLSv1.3 sha256=975522fb60b100e2
split=100: RESET
```

The certificate that came back over the split connection:

```
$ openssl x509 -inform der -in cert_5.der -noout -subject -issuer -dates
subject= /C=US/ST=California/L=Sunnyvale/O=Linkedin Corporation/CN=www.linkedin.com
issuer= /C=US/O=DigiCert Inc/CN=DigiCert Global G2 TLS RSA SHA256 2020 CA1
notBefore=Sep 17 00:00:00 2026 GMT
notAfter=Mar 17 23:59:59 2027 GMT
```

That is the real LinkedIn certificate from a public CA, not a block page or an interception certificate. So the filter doesn't reassemble, at least not when the first segment holds only the record header.

**Why did `split=100` fail?** At byte 100 the hostname is also in the second segment, so a filter that only read the first segment should have missed it too. It didn't. One plausible reading: the filter recognizes a TLS flow from a first segment that looks like a full handshake record, then buffers a few segments for it, and a 5-byte segment is too short to be recognized. The lab only shows the result, not the box's logic. If you build this for another network, test several split points instead of assuming 5 works everywhere.

---

## Step 2: the proxy

The design is a plain HTTP `CONNECT` proxy, the kind every browser and curl already supports:

```
Browser ──CONNECT www.linkedin.com:443──▶ 127.0.0.1:8899 ──▶ upstream:443
                                          │
                                          ├ resolve host over DoH
                                          ├ open TCP upstream, set TCP_NODELAY
                                          ├ reply "200 Connection Established"
                                          ├ read the browser's first packet
                                          │   starts with 0x16 (TLS handshake)?
                                          │   → send 5 bytes, wait 10 ms, send the rest
                                          └ relay bytes both ways, unchanged
```

Resolution goes over DNS-over-HTTPS because on this network the router's resolver answers `127.0.0.1` for the blocked domain. A `--domains` list limits splitting to the names that need it; everything else is passed through as a normal proxy.

The complete script:

```python
#!/usr/bin/env python3
"""Local HTTP CONNECT proxy that splits the TLS Client Hello into two TCP segments.

On-path DPI that does not reassemble TCP can't read the SNI when the TLS record
header (first 5 bytes) arrives in its own segment. TLS is never decrypted: after
the first packet, bytes are relayed unchanged in both directions.

Usage:
  python3 sni_split_proxy.py [--port 8899] [--split 5] [--domains linkedin.com,...]
  curl -x http://127.0.0.1:8899 https://www.linkedin.com
"""
import argparse
import asyncio
import json
import logging
import socket
import ssl
import time
import urllib.parse
import urllib.request

log = logging.getLogger("sni-split")

DOH_URL = "https://cloudflare-dns.com/dns-query?name={}&type=A"
_dns_cache: dict[str, tuple[str, float]] = {}


def _ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    # python.org builds on macOS ship without a CA bundle; use the system one.
    if not ctx.get_ca_certs():
        try:
            ctx.load_verify_locations("/etc/ssl/cert.pem")
        except OSError:
            pass
    return ctx


_SSL_CTX = _ssl_context()


def _doh_lookup(host: str) -> str:
    req = urllib.request.Request(DOH_URL.format(urllib.parse.quote(host)),
                                 headers={"accept": "application/dns-json"})
    with urllib.request.urlopen(req, timeout=5, context=_SSL_CTX) as r:
        data = json.load(r)
    for ans in data.get("Answer", []):
        if ans.get("type") == 1:
            return ans["data"]
    raise OSError(f"DoH: no A record for {host}")


async def resolve(host: str) -> str:
    """Resolve via DoH so a lying local resolver can't send us to 127.0.0.1."""
    try:
        socket.inet_aton(host)
        return host
    except OSError:
        pass
    cached = _dns_cache.get(host)
    if cached and cached[1] > time.time():
        return cached[0]
    try:
        ip = await asyncio.to_thread(_doh_lookup, host)
    except Exception as e:  # fall back to the system resolver
        log.warning("DoH failed for %s (%s), using system resolver", host, e)
        ip = (await asyncio.get_running_loop().getaddrinfo(host, None, family=socket.AF_INET))[0][4][0]
    _dns_cache[host] = (ip, time.time() + 300)
    return ip


def wants_split(host: str, domains: list[str]) -> bool:
    if not domains:
        return True
    host = host.lower().rstrip(".")
    return any(host == d or host.endswith("." + d) for d in domains)


async def pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        while data := await reader.read(65536):
            writer.write(data)
            await writer.drain()
    except (ConnectionError, asyncio.CancelledError):
        pass
    finally:
        try:
            writer.close()
        except Exception:
            pass


async def handle(client_r, client_w, args) -> None:
    peer = client_w.get_extra_info("peername")
    try:
        head = await asyncio.wait_for(client_r.readuntil(b"\r\n\r\n"), timeout=10)
    except Exception:
        client_w.close()
        return
    line = head.split(b"\r\n", 1)[0].decode("latin-1")
    parts = line.split()
    if len(parts) < 2 or parts[0].upper() != "CONNECT":
        # Only CONNECT (HTTPS) is supported; plain HTTP isn't the use case.
        client_w.write(b"HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n")
        await client_w.drain()
        client_w.close()
        return

    host, _, port = parts[1].rpartition(":")
    host, port = host.strip("[]"), int(port or 443)
    try:
        ip = await resolve(host)
        up_r, up_w = await asyncio.wait_for(asyncio.open_connection(ip, port), timeout=10)
    except Exception as e:
        log.warning("%s -> %s:%s connect failed: %s", peer, host, port, e)
        client_w.write(b"HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n")
        await client_w.drain()
        client_w.close()
        return

    up_w.get_extra_info("socket").setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    client_w.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
    await client_w.drain()

    first = await client_r.read(65536)
    split = wants_split(host, args.domains)
    if first and split and first[0] == 0x16 and len(first) > args.split:
        # TLS handshake record: send the header alone, then the rest.
        up_w.write(first[: args.split])
        await up_w.drain()
        await asyncio.sleep(args.delay)
        up_w.write(first[args.split:])
        mode = "split"
    else:
        up_w.write(first)
        mode = "pass"
    await up_w.drain()
    log.info("%s %s:%s (%s) %s", mode, host, port, ip, peer[0] if peer else "")

    await asyncio.gather(pipe(client_r, up_w), pipe(up_r, client_w))


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1", help="listen address (keep it on localhost)")
    ap.add_argument("--port", type=int, default=8899)
    ap.add_argument("--split", type=int, default=5, help="bytes in the first segment")
    ap.add_argument("--delay", type=float, default=0.01, help="seconds between the two segments")
    ap.add_argument("--domains", default="", help="comma-separated list; empty = split everything")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()
    args.domains = [d.strip().lower() for d in args.domains.split(",") if d.strip()]
    logging.basicConfig(level=logging.INFO if args.verbose else logging.WARNING,
                        format="%(asctime)s %(message)s", datefmt="%H:%M:%S")

    server = await asyncio.start_server(lambda r, w: handle(r, w, args), args.host, args.port)
    print(f"listening on {args.host}:{args.port}  split={args.split}  "
          f"domains={','.join(args.domains) or 'ALL'}", flush=True)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
```

The parts that matter:

| Line | Why it's there |
|---|---|
| `setsockopt(... TCP_NODELAY, 1)` | Stops Nagle's algorithm from coalescing the 5-byte write with the next one. Without separate segments there is no split. |
| `first[0] == 0x16` | `0x16` is the TLS record type for handshake. Anything else (not TLS) is passed through untouched. |
| `await asyncio.sleep(args.delay)` | A small gap so the two writes leave as two packets even under load. 10 ms is invisible to a page load. |
| `resolve()` over DoH | The router's resolver answers `127.0.0.1` for the blocked name. |
| `--host 127.0.0.1` default | An open proxy on the LAN is a gift to anyone else on it. Keep it on loopback. |

---

## Step 3: test it

Start it with splitting for every host, on port 8080 for this first run:

```
$ python3 sni_split_proxy.py --port 8080 -v
listening on 127.0.0.1:8080  split=5  domains=ALL
```

Direct first, then through the proxy:

```
$ curl -s -o /dev/null -m 10 -w "%{http_code} rc=%{exitcode}\n" https://www.linkedin.com
000 rc=35

$ for u in https://www.linkedin.com https://linkedin.com https://www.linkedin.com/in/ https://www.google.com; do
    curl -s -o /dev/null -m 15 -x http://127.0.0.1:8080 \
      -w "$u -> %{http_code} %{ssl_verify_result} time=%{time_total}s\n" $u
  done
https://www.linkedin.com -> 200 0 time=0.794938s
https://linkedin.com -> 200 0 time=0.412716s
https://www.linkedin.com/in/ -> 999 0 time=0.480528s
https://www.google.com -> 200 0 time=0.417441s
```

`ssl_verify_result` is `0` everywhere: curl validated the certificate chain itself, through the tunnel. The `999` on `/in/` is LinkedIn's own response to a non-browser client hitting profile URLs, not the filter. It arrived over a completed TLS session.

The verbose handshake through the proxy:

```
$ curl -sv -I -m 15 -x http://127.0.0.1:8080 https://www.linkedin.com
> CONNECT www.linkedin.com:443 HTTP/1.1
< HTTP/1.1 200 Connection Established
* SSL connection using TLSv1.3 / AEAD-CHACHA20-POLY1305-SHA256 / [blank] / UNDEF
*  subject: C=US; ST=California; L=Sunnyvale; O=Linkedin Corporation; CN=www.linkedin.com
*  issuer: C=US; O=DigiCert Inc; CN=DigiCert Global G2 TLS RSA SHA256 2020 CA1
* using HTTP/2
...
< HTTP/2 200
```

**Control run.** The same proxy with `--split 99999`, which never splits, so it is a plain CONNECT proxy:

```
$ curl -s -o /dev/null -m 10 -x http://127.0.0.1:8081 -w "no-split -> %{http_code} rc=%{exitcode}\n" https://www.linkedin.com
no-split -> 000 rc=35
```

Reset again. The proxy itself, the DoH lookup and the different source port change nothing. The split is the only thing that gets the connection through.

The proxy's log for those requests:

```
18:56:51 split www.linkedin.com:443 (104.18.41.41) 127.0.0.1
18:56:51 split linkedin.com:443 (130.211.32.14) 127.0.0.1
18:56:52 split www.linkedin.com:443 (104.18.41.41) 127.0.0.1
18:56:52 split www.google.com:443 (142.251.154.119) 127.0.0.1
18:56:53 split www.linkedin.com:443 (104.18.41.41) 127.0.0.1
```

### A real browser

A headless Chrome with a throwaway profile pointed at the proxy rendered the LinkedIn home page (sign-in buttons, cookie banner, full layout). The proxy log for that one page load shows how many hosts a modern page touches:

```
   5 split static.licdn.com:443
   3 split www.linkedin.com:443
   3 split www.gstatic.com:443
   3 split www.google.com:443
   3 split accounts.google.com:443
   2 split update.googleapis.com:443
   1 split www.googleapis.com:443
   1 split tzm.protechts.net:443
   1 split ri.px-cloud.net:443
   1 split platform.linkedin.com:443
   1 split li.protechts.net:443
   1 split fonts.gstatic.com:443
...
```

To run it for daily use without touching the system proxy, start a separate Chrome profile:

```bash
open -na "Google Chrome" --args --user-data-dir="$HOME/.chrome-sni-split" \
  --proxy-server=http://127.0.0.1:8899
```

### Split only what's blocked

With `--domains`, everything else is a straight relay:

```
$ python3 sni_split_proxy.py --domains linkedin.com -v
listening on 127.0.0.1:8899  split=5  domains=linkedin.com
18:57:52 split www.linkedin.com:443 (172.64.146.215) 127.0.0.1
18:57:53 pass www.google.com:443 (142.251.152.119) 127.0.0.1
```

Both requests returned `200`.

One practical note from the lab: the first choice of port, 8080, was already taken on this Mac by an SSH port-forward from Colima listening on `*:8080`. macOS still let the proxy bind `127.0.0.1:8080`, because the more specific address wins, so the tests worked. But that is a confusing way to share a port. The script now defaults to 8899. Check with `lsof -nP -iTCP:8899 -sTCP:LISTEN` before picking a port.

---

## Limits

| Limit | Effect |
|---|---|
| Filter starts reassembling TCP | Splitting stops working; use WARP or a VPN |
| IPv4 upstream only | Fine for dual-stack sites; IPv6-only hosts won't connect |
| `CONNECT` only | Plain HTTP gets `405`; the HTTP `Host` header filter isn't handled |
| QUIC/HTTP/3 | Browsers fall back to TCP through an HTTP proxy, so it isn't an issue here |
| Encrypted Client Hello | The real fix where both sides support it. The site in this lab publishes no `ech` key in its HTTPS record, so it's not an option |

Endpoint security tools may flag a local proxy that evades filtering, whatever the intent. On a work laptop, ask first.

---

## FAQ

**Does this proxy decrypt or inspect HTTPS?**
No. After forwarding the first packet in two pieces, it relays bytes unchanged. The browser validates the site's own certificate, as `ssl_verify_result 0` and the DigiCert issuer above show.

**Why not split every packet?**
The filter only reads the start of the flow. Splitting later packets adds latency and changes nothing.

**Is 5 the right split size for every network?**
No. Here 5 worked and 100 didn't. Different DPI products parse differently, so run the one-packet probe with a few split points first.

**Why does it need DoH?**
On this network the router's resolver returned `127.0.0.1` for the blocked domain. Without an honest resolver, the proxy would connect to localhost. See [How to Check Which DNS Server Linux Is Using](/blog/dns-not-resolving-linux-fix) for finding which resolver is answering.
