---
title: "netstat vs ss: Which to Use and What's the Difference"
date: "2026-04-22"
excerpt: "netstat vs ss — understand the differences, when to use each, equivalent command translations, and why ss is the modern replacement for netstat on Linux."
tags: ["linux", "networking", "troubleshooting", "debugging"]
featured: false
slug: "netstat-vs-ss-command-difference"
category: "linux"
---

Both show network connections and listening ports. `ss` is faster, more accurate, and pre-installed on all modern Linux. `netstat` is older, often missing, and deprecated — but still widely known and occasionally the only option.

---

## TL;DR

- **Use `ss`** — it's always there on modern Linux, reads directly from kernel
- **`netstat`** requires the `net-tools` package, often absent in containers and cloud images
- The commands are equivalent with different flag syntax
- `ss -tlnp` = `netstat -tlnp` in output, but `ss` is faster and more reliable

---

## Side-by-Side Command Translation

| What you want | ss | netstat |
|---|---|---|
| TCP listening ports + process | `ss -tlnp` | `netstat -tlnp` |
| All TCP connections | `ss -tn` | `netstat -tn` |
| UDP listening ports | `ss -ulnp` | `netstat -ulnp` |
| All connections, all states | `ss -tan` | `netstat -an` |
| Connection count summary | `ss -s` | `netstat -s` (different format) |
| Specific port | `ss -tlnp \| grep :8080` | `netstat -tlnp \| grep :8080` |
| By process name | `ss -tnp \| grep nginx` | `netstat -tnp \| grep nginx` |

---

## Why ss Is Better

### Speed

`ss` reads socket state directly from the kernel via netlink sockets. `netstat` reads from `/proc/net/tcp`, `/proc/net/udp`, etc. — parsing text files that the kernel generates on demand.

On a server with thousands of connections, `ss` is noticeably faster. On a typical server, the difference is milliseconds, but in scripts that run frequently, it adds up.

### Availability

`netstat` is part of `net-tools`, a deprecated package not installed by default on:
- Minimal Ubuntu / Debian cloud images
- RHEL 8+ (dnf install net-tools needed)
- Docker containers built from slim base images
- Alpine Linux

`ss` is part of `iproute2`, which is installed everywhere — you'll never be on a modern Linux system without it.

### More filtering options

`ss` has a filter syntax that `netstat` doesn't:

```bash
# Only established connections to port 5432
ss -tnp state established dport :5432

# Only TIME-WAIT connections
ss -tn state time-wait

# Connections from a specific IP
ss -tnp src 10.0.1.50

# Filter by socket option
ss -tn '( dport = :http or dport = :https )'
```

`netstat` requires piping to `grep` for all of these.

---

## Real Output Comparison

### ss -tlnp

```
State    Recv-Q  Send-Q  Local Address:Port  Peer Address:Port  Process
LISTEN   0       128     0.0.0.0:22          0.0.0.0:*          users:(("sshd",pid=1023,fd=3))
LISTEN   0       511     0.0.0.0:80          0.0.0.0:*          users:(("nginx",pid=2341,fd=6))
LISTEN   0       128     127.0.0.1:5432      0.0.0.0:*          users:(("postgres",pid=3012,fd=4))
```

### netstat -tlnp

```
Proto  Recv-Q  Send-Q  Local Address    Foreign Address  State   PID/Program name
tcp    0       0       0.0.0.0:22      0.0.0.0:*        LISTEN  1023/sshd
tcp    0       0       0.0.0.0:80      0.0.0.0:*        LISTEN  2341/nginx
tcp    0       0       127.0.0.1:5432  0.0.0.0:*        LISTEN  3012/postgres
```

Same information, different column order. `ss` output includes socket buffer sizes (`Recv-Q`, `Send-Q`) more prominently.

---

## When netstat Is Still Useful

### On systems where ss isn't available

Older RHEL 6/7 systems, some embedded Linux, legacy VMs:

```bash
# Install if needed
apt install net-tools     # Ubuntu
yum install net-tools     # RHEL 6/7
```

### Older syntax you might encounter in docs/scripts

Much documentation and many scripts still use `netstat`. Knowing the equivalent `ss` command lets you translate on the fly.

### Statistics output (slightly different)

```bash
netstat -s    # per-protocol statistics (TCP retransmits, UDP errors, etc.)
ss -s         # simpler connection count summary
```

`netstat -s` gives more detailed protocol statistics than `ss -s`.

---

## ss Advanced Features (No netstat Equivalent)

```bash
# Filter by connection state
ss -tn state time-wait        # only TIME-WAIT
ss -tn state established      # only ESTABLISHED
ss -tn state '( syn-sent or syn-recv )'  # handshaking connections

# Extended info (timers, round-trip time)
ss -tnoe                      # extended socket info

# Socket memory usage
ss -tm                        # show socket memory

# Filter by destination IP + port
ss -tnp dst 10.0.1.50:5432
```

None of these have `netstat` equivalents.

---

## Install netstat if You Need It

```bash
# Ubuntu/Debian
apt install net-tools

# RHEL/CentOS/Rocky
dnf install net-tools

# Alpine
apk add net-tools
```

---

## Common Mistakes

**Mistake 1: Using `netstat` on minimal containers**
It's not installed. Use `ss` — it's always available.

**Mistake 2: Expecting identical output format**
Column order differs. Scripts that parse `netstat` output by column position need to be rewritten for `ss`.

**Mistake 3: Not using state filters with ss**
The power of `ss` is its filter syntax. `ss -tn` without a state filter shows everything including TIME-WAIT which inflates connection counts.

```bash
ss -tn state established | wc -l   # real active connections
ss -tn | wc -l                      # all states including dead sockets
```

---

## Quick Reference

```bash
# ss equivalents for common netstat commands
netstat -tlnp    →  ss -tlnp
netstat -tnp     →  ss -tnp
netstat -an      →  ss -tan
netstat -s       →  ss -s  (limited) or netstat -s for full stats

# ss-only features
ss -tn state established
ss -tn state time-wait
ss -tnp dst 10.0.1.50
ss -tnoe   # extended info with timers
```

---

## Conclusion

Use `ss`. It's faster, always available, and has more filtering options. Learn `netstat` syntax to read existing documentation and scripts, then translate to `ss` for actual use. The only time `netstat` wins is on very old systems (RHEL 6, ancient Debian) where `ss` might not be available — and even then, `dnf/apt install net-tools` fixes that.

---

*Related: [Check Open Ports in Linux: ss vs netstat](/blog/check-open-ports-linux-ss-netstat-guide) — practical port checking with ss. [Linux Check Open Connections](/blog/linux-check-open-connections-command) — using ss to monitor active connections.*
