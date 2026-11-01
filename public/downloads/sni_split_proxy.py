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
