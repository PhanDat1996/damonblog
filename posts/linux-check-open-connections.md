---
title: "Linux Check Open Connections: ss, netstat, lsof Examples"
date: "2026-04-22"
excerpt: "Check open network connections in Linux using ss, netstat, and lsof — see established connections, connection counts by state, and find which process owns each connection."
tags: ["linux", "networking", "troubleshooting", "monitoring"]
featured: false
slug: "linux-check-open-connections-command"
category: "linux"
---

Need to see all active connections on a Linux server? Whether you're debugging a service, auditing network activity, or investigating a slow application, these commands show you exactly what's connected and who owns it.

---

## TL;DR

```bash
ss -tnp state established          # all active TCP connections
ss -s                              # connection count by state
ss -tnp | grep :8080               # connections to a specific port
lsof -i -sTCP:ESTABLISHED         # established connections with process detail
netstat -tnp                       # older alternative
```

---

## ss: The Primary Tool

### All established TCP connections

```bash
ss -tnp state established
```

```
Recv-Q  Send-Q  Local Address:Port  Peer Address:Port  Process
0       0       10.0.1.10:80        1.2.3.4:54321      users:(("nginx",pid=1234,fd=12))
0       0       10.0.1.10:80        5.6.7.8:49201      users:(("nginx",pid=1235,fd=8))
0       0       10.0.1.10:5432      10.0.1.20:34521    users:(("postgres",pid=3012,fd=22))
```

Flags:
- `-t` — TCP only
- `-n` — show port numbers, not service names
- `-p` — show process name and PID

### Connection count by state (overview)

```bash
ss -s
```

```
Total: 287
TCP:   45 (estab 12, closed 8, orphaned 0, timewait 23)

Transport Total  IP   IPv6
RAW       0      0    0
UDP       8      5    3
TCP       45     42   3
```

This is the fastest way to see if TIME-WAIT is accumulating or connection counts are abnormal.

### Filter by port

```bash
# Who is connected to port 80?
ss -tnp state established dport :80

# Who is connected to port 5432 (Postgres)?
ss -tnp state established dport :5432

# What is this server connected TO on port 443?
ss -tnp state established sport :443
```

---

## Count Connections by Source IP

```bash
# Who is connecting most?
ss -tn state established | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn | head -10
```

```
    142 10.0.1.50     ← internal load balancer (normal)
     23 1.2.3.4       ← external IP, 23 connections (investigate)
      8 10.0.1.100
```

---

## Monitor Connections Over Time

```bash
# Connection count trend every 2 seconds
watch -n 2 'ss -s | grep TCP'

# TIME-WAIT count (causes 502s under load if too high)
watch -n 1 'ss -tn state time-wait | wc -l'

# Established connection count to a specific port
watch -n 2 'ss -tn state established dport :80 | wc -l'
```

---

## lsof: Connections With More Process Detail

```bash
# All established TCP connections
lsof -i -sTCP:ESTABLISHED

# Connections from a specific process
lsof -p 1234 -i

# Everything connected to port 8080
lsof -i :8080

# All connections for nginx
lsof -c nginx -i
```

Output:

```
COMMAND  PID   USER  FD  TYPE  NODE  NAME
nginx   1234  www    8u  IPv4  TCP   server:http->client:54321 (ESTABLISHED)
nginx   1234  www   12u  IPv4  TCP   server:http->client:49201 (ESTABLISHED)
```

---

## All Connection States

```bash
ss -tan    # all TCP connections, all states
```

States you'll see:

| State | Meaning |
|---|---|
| `ESTABLISHED` | Active connection, data flowing |
| `TIME-WAIT` | Connection closed, waiting 60s before releasing port |
| `CLOSE-WAIT` | Remote side closed, waiting for local close |
| `LISTEN` | Waiting for incoming connections |
| `SYN-SENT` | Connection attempt in progress |
| `FIN-WAIT-1/2` | Local side initiated close |

**High TIME-WAIT count** (> 5000) = TCP connections closing too fast, usually from missing keepalive in nginx or connection pool exhaustion.

**High CLOSE-WAIT count** = application not calling `close()` on sockets — typically a code bug.

---

## Real Examples

### Verify connections drop after nginx restart

```bash
# Before restart
ss -tn state established dport :80 | wc -l
# 142

systemctl reload nginx

# After reload (should drain gracefully, not drop)
watch -n 1 'ss -tn state established dport :80 | wc -l'
```

### Find connection leak in application

```bash
# Application connection count growing over time
PID=$(pgrep -x myapp)
while true; do
  COUNT=$(ss -tnp | grep "pid=$PID" | wc -l)
  echo "$(date +%H:%M:%S): $COUNT connections"
  sleep 30
done
```

If it grows without releasing: connection leak.

### Check database connection pool exhaustion

```bash
# How many connections to Postgres right now?
ss -tnp state established dport :5432 | wc -l

# Compare against max_connections
sudo -u postgres psql -c "SHOW max_connections;"
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"
```

---

## Common Mistakes

**Mistake 1: Confusing TIME-WAIT for active connections**
`ss -tn state established` shows only active connections. `ss -tan` shows all states including TIME-WAIT which aren't real connections.

**Mistake 2: Not filtering state when counting**
```bash
ss -tn | wc -l        # includes header line + all states
ss -tn state established | wc -l   # only real connections
```

**Mistake 3: Forgetting `-p` needs root for process names**
```bash
sudo ss -tnp state established   # shows process for all sockets
```

---

## Quick Reference

```bash
ss -tnp state established           # active connections + process
ss -s                               # count by state
ss -tnp state time-wait | wc -l    # TIME-WAIT count
ss -tnp dport :5432                 # connections to postgres
ss -tan                             # all states

lsof -i -sTCP:ESTABLISHED          # with more process detail
lsof -p <pid> -i                   # for specific process
```

---

## Conclusion

`ss -tnp state established` is the go-to command. Pair it with `ss -s` for a state summary. Watch TIME-WAIT counts during load — if they climb past 5000, you likely have a keepalive misconfiguration. For per-process connection detail, `lsof -p <pid> -i` gives more readable output.

---

*Related: [Check Open Ports in Linux: ss vs netstat](/blog/check-open-ports-linux-ss-netstat-guide) — listeners vs established connections. [NGINX 502 Bad Gateway Under Load](/blog/nginx-502-under-load) — high TIME-WAIT causing 502 errors explained.*
