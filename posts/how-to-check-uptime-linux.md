---
title: "How to Check Uptime in Linux: uptime, w, and Beyond"
date: "2026-04-22"
excerpt: "Check Linux server uptime with uptime, w, and /proc/uptime — read load average correctly, find when the last reboot happened, and script uptime checks."
tags: ["linux", "monitoring", "infrastructure", "troubleshooting"]
featured: false
slug: "how-to-check-uptime-linux"
---

Uptime tells you how long the system has been running — and the load average tells you how hard it's been working. Both are packed into a single line.

---

## TL;DR

```bash
uptime              # uptime + load average
w                   # uptime + logged in users + their activity
last reboot         # when the system was last restarted
cat /proc/uptime    # uptime in seconds (for scripting)
```

---

## uptime Command

```bash
uptime
```

```
 09:15:42 up 14 days,  2:31,  3 users,  load average: 1.24, 0.87, 0.63
```

Breaking it down:

| Part | Meaning |
|---|---|
| `09:15:42` | Current time |
| `up 14 days, 2:31` | System running for 14 days, 2 hours, 31 minutes |
| `3 users` | 3 active sessions (SSH + console) |
| `load average: 1.24, 0.87, 0.63` | 1, 5, 15-minute averages |

### Uptime with one-liner format

```bash
uptime -p          # human-readable duration only
# up 2 weeks, 14 hours, 31 minutes

uptime -s          # boot time as timestamp
# 2026-04-08 06:44:11
```

---

## Load Average Explained

```
load average: 1.24, 0.87, 0.63
              1min  5min  15min
```

Load average = average number of processes either running or waiting to run (including I/O-waiting processes).

**How to read it:**

```bash
nproc    # number of CPU cores
# 4 cores

# load 1.24 on 4 cores = 31% utilization → healthy
# load 4.00 on 4 cores = 100% utilization → at capacity
# load 6.50 on 4 cores = 163% utilization → overloaded
```

**Trend reading:**
- `1.24, 0.87, 0.63` — load rising (1min > 15min) → system getting busier
- `0.50, 1.20, 2.10` — load falling (1min < 15min) → recovering from spike
- `1.24, 1.25, 1.23` — load stable

---

## w: Uptime + Active Users

```bash
w
```

```
 09:15:42 up 14 days,  2:31,  3 users,  load average: 1.24, 0.87, 0.63
USER     TTY      FROM             LOGIN@   IDLE JCPU   PCPU WHAT
damon    pts/0    10.0.1.42        09:00    0.00s  0.10s  0.01s w
ops      pts/1    192.168.1.100    08:30    5:23   0.20s  0.00s bash
deploy   pts/2    10.0.1.50        09:10    0.00s  2.10s  2.09s npm run build
```

Useful for seeing who's connected and what they're running — especially during an incident where you want to know if someone is actively working on the server.

Columns: `IDLE` = how long since last input, `PCPU` = current CPU usage of the command.

---

## Find When the System Last Rebooted

```bash
# Last reboot event
last reboot | head -5

# Output:
# reboot   system boot  5.15.0-91-gene Mon Apr  8 06:44   still running
# reboot   system boot  5.15.0-91-gene Sun Mar 31 14:22 - 06:44 (9+16:21)

# Using who
who -b
# system boot  2026-04-08 06:44

# Using uptime -s
uptime -s
# 2026-04-08 06:44:11
```

---

## /proc/uptime for Scripting

```bash
cat /proc/uptime
# 1234567.89 4987654.21
# First number = uptime in seconds
# Second number = idle time in seconds (across all CPUs)
```

Convert to human-readable in a script:

```bash
seconds=$(awk '{print int($1)}' /proc/uptime)
days=$((seconds / 86400))
hours=$(( (seconds % 86400) / 3600 ))
minutes=$(( (seconds % 3600) / 60 ))
echo "Uptime: ${days}d ${hours}h ${minutes}m"
```

---

## Real Examples

### Check if a server was recently rebooted (monitoring script)

```bash
#!/bin/bash
# Alert if server rebooted in the last 10 minutes
uptime_seconds=$(awk '{print int($1)}' /proc/uptime)
if [ "$uptime_seconds" -lt 600 ]; then
  echo "ALERT: Server rebooted $(($uptime_seconds / 60)) minutes ago"
  last reboot | head -2
fi
```

### Check uptime across multiple servers

```bash
for host in web01 web02 db01; do
  echo -n "$host: "
  ssh $host 'uptime -p'
done
```

### Correlate uptime with load average trend

```bash
# Is load average trending up over the past 15 minutes?
uptime | awk '{
  split($NF, a, ",");
  load1=a[1]; load15=a[3];
  if (load1 > load15 * 1.2)
    print "Load rising: 1min=" load1 " 15min=" load15
  else
    print "Load stable: 1min=" load1 " 15min=" load15
}'
```

---

## Common Mistakes

**Mistake 1: High load average always means CPU problem**
Load average includes I/O-waiting processes. A server with 20 processes stuck on a hung NFS mount shows load 20 with CPU at 5%. Check `%wa` in top.

**Mistake 2: Not accounting for CPU count when reading load**
Load average of 4.0 is:
- Critical on a 2-core server (200% utilization)
- Healthy on an 8-core server (50% utilization)

Always check `nproc` alongside load average.

**Mistake 3: Using uptime to determine if a service restarted**
`uptime` shows OS uptime, not service uptime. A service can crash and restart while the OS keeps running.

```bash
# Service uptime, not OS uptime
systemctl status nginx | grep "Active:"
# Active: active (running) since Mon 2026-04-20 14:22 UTC; 1h 30min ago
```

---

## Pro Tips

```bash
# Compact uptime summary
uptime | awk '{printf "Up: %s %s, Load: %s %s %s\n", $3, $4, $(NF-2), $(NF-1), $NF}'

# Monitor load average with timestamps
while true; do
  echo "$(date '+%H:%M:%S') - $(uptime | awk -F'load average:' '{print $2}')"
  sleep 10
done

# Find the last 5 reboots
last reboot | head -5

# Show uptime in seconds (exact, for monitoring)
awk '{print int($1)}' /proc/uptime
```

---

## Conclusion

`uptime` in one line gives you OS uptime and load average trend. The load average only means something relative to your CPU count — always check `nproc`. A rising trend (1min > 15min) means the system is getting busier; a falling trend means it's recovering. For scripting, `/proc/uptime` gives you seconds directly without parsing.

---

*Related: [How to Check CPU Usage in Linux](/blog/check-cpu-usage-linux-commands) — diagnose high load average with CPU investigation tools. [Linux Check Running Services with systemctl](/blog/linux-check-running-services-systemctl) — check what's been running since the last boot.*
