---
title: "Linux Check Disk I/O Usage: iostat Examples"
date: "2026-04-22"
excerpt: "Check disk I/O usage in Linux using iostat — read utilization, throughput, and latency metrics, identify saturated disks, and correlate I/O with application slowdowns."
tags: ["linux", "monitoring", "troubleshooting", "infrastructure"]
featured: false
slug: "linux-check-disk-io-iostat-examples"
category: "linux"
---

High load average, slow application, CPU mostly idle — the culprit is often disk I/O. `iostat` tells you which disk, how saturated it is, and how fast data is moving.

---

## TL;DR

```bash
# Install (part of sysstat)
apt install sysstat    # Ubuntu
dnf install sysstat    # RHEL

# Basic: 1-second updates
iostat -x 1

# Specific disk
iostat -x /dev/sda 1

# Human-readable with device names
iostat -xh 1
```

---

## Basic iostat Output

```bash
iostat -x 1
```

```
Device   r/s    w/s   rkB/s   wkB/s  await  r_await  w_await  %util
sda      0.50  45.20    8.00  1820.40  12.50    5.00    12.70  87.30
sdb      0.10   0.20    1.60     4.00   1.20    1.10     1.30   0.50
```

**The columns that matter:**

| Column | Meaning | Threshold to investigate |
|---|---|---|
| `r/s` | Reads per second | Workload-dependent |
| `w/s` | Writes per second | Workload-dependent |
| `rkB/s` | Read throughput (KB/s) | Compare to disk spec |
| `wkB/s` | Write throughput (KB/s) | Compare to disk spec |
| `await` | Average I/O latency (ms) | HDD > 20ms, SSD > 5ms = problem |
| `%util` | Disk utilization | **> 80% = saturated** |

`%util` at 100% means the disk is handling I/O 100% of the time — a queue is forming. Applications waiting on that disk will slow down or hang.

---

## Real Examples

### Watch all disks with 1-second updates

```bash
iostat -xh 1
```

The `-h` flag adds human-readable throughput (MB/s instead of kB/s).

### Monitor a specific disk

```bash
iostat -x /dev/sda 1 10    # 10 readings of sda
```

### Check NVMe drives (different naming)

```bash
iostat -x /dev/nvme0n1 1
```

### See only the columns you care about

```bash
# Just device, util, and latency
iostat -x 1 | awk 'NR>3 {printf "%-10s util:%5.1f%%  await:%6.2fms\n", $1, $NF, $10}'
```

### Find which disk is causing high load

```bash
# Run for 5 seconds and show average
iostat -x 5 1 | grep -v "^$\|Linux\|Device" | sort -k14 -rn
# Column 14 = %util — sorts by most utilized disk first
```

---

## Output Explanation: Full Column Reference

```bash
iostat -x 1
```

```
Device: rrqm/s wrqm/s  r/s  w/s  rkB/s  wkB/s  avgrq-sz  avgqu-sz  await  r_await  w_await  svctm  %util
sda       0.00  12.40 0.50 45.20  8.00 1820.40    78.40     0.57  12.50    5.00    12.70   1.10  87.30
```

| Column | Meaning |
|---|---|
| `rrqm/s` | Read requests merged per second (kernel merges adjacent reads) |
| `wrqm/s` | Write requests merged per second |
| `r/s` / `w/s` | Completed reads/writes per second |
| `rkB/s` / `wkB/s` | Throughput in KB/s |
| `avgrq-sz` | Average request size in sectors (512B each) |
| `avgqu-sz` | **Average queue depth** — > 1 means requests are queuing |
| `await` | Average total I/O latency (queue + service time) |
| `r_await` / `w_await` | Separate read/write latency |
| `svctm` | Service time (deprecated, ignore) |
| `%util` | **Disk utilization — 100% = fully saturated** |

**`avgqu-sz > 1`** means the disk is receiving requests faster than it can serve them. This is often more revealing than `%util` — a fast SSD at 90% util with avgqu-sz of 0.1 is fine; an HDD at 70% util with avgqu-sz of 8 is a problem.

---

## Correlate I/O with Processes

`iostat` tells you the disk is busy — `iotop` tells you which process is responsible:

```bash
# Install
apt install iotop

# Show only processes doing I/O
iotop -o

# Non-interactive, 3 snapshots
iotop -b -n 3 -o
```

Combined workflow:

```bash
# Step 1: confirm which disk
iostat -x 1

# Step 2: find which process
iotop -o

# Step 3: confirm (lsof shows what files)
lsof -p <pid> | grep -E "REG|DIR"
```

---

## Real-World Use Case: Database Slowdown Investigation

Application response times spiked at 2am. CPU was idle. Memory was fine.

```bash
# Check disk I/O at the time (sar stores historical data)
sar -d --starttime=02:00:00 --endtime=02:30:00 -f /var/log/sysstat/sa22

# Or check current state during a reproduction
iostat -x 1 10
```

```
Device  %util  await  avgqu-sz
sda     98.20  85.40     8.20   ← disk saturated, 85ms latency, deep queue
```

Then:

```bash
iotop -o
# postgres  pid=3012  DISK WRITE: 45.2M/s  Total: 47.1M/s
```

PostgreSQL was doing a checkpoint (bulk write to disk). The disk couldn't keep up. Fix: tune `checkpoint_completion_target` in PostgreSQL, or upgrade to SSD/NVMe.

---

## Common Mistakes

**Mistake 1: Only looking at `%util` on SSDs**
An SSD can handle parallel I/O efficiently. `%util=90%` on an SSD might be fine if `await` is 0.5ms. `%util=50%` on an HDD with `await=100ms` is a problem. Always check `await` together.

**Mistake 2: Reading the first iostat line**
The first line after `iostat -x 1` is the average since boot, not the current rate. The second and subsequent lines are real-time. Ignore line 1.

**Mistake 3: Not enabling sysstat for historical data**
```bash
# Enable sysstat data collection
systemctl enable --now sysstat
# Or on Ubuntu: edit /etc/default/sysstat
# ENABLED="true"
```
Without this enabled, `sar -d` has no historical data.

**Mistake 4: Ignoring the write merge rate**
High `wrqm/s` means the kernel is efficiently merging write requests — that's good. Low `wrqm/s` with high `w/s` means lots of small random writes, which destroys HDD performance.

---

## Pro Tips

```bash
# Historical disk I/O with sar
sar -d 1 10                    # current, 10 readings
sar -d -f /var/log/sysstat/sa$(date +%d)   # today's data

# I/O statistics per partition
iostat -xp sda 1

# Monitor NVMe with extended metrics
iostat -x /dev/nvme0n1 1

# Alert when disk utilization exceeds threshold
while true; do
  util=$(iostat -d /dev/sda 1 1 | awk 'NR==4{print $NF+0}')
  [ "$util" -gt 80 ] && echo "$(date): sda util=${util}% — ALERT"
  sleep 5
done

# Disk I/O by process, sorted by total I/O
iotop -b -n 1 | sort -k4 -rn | head -10
```

---

## Conclusion

`iostat -x 1` is the starting point for any I/O performance investigation. `%util > 80%` and `await > 20ms (HDD) / 5ms (SSD)` are the thresholds that indicate a disk problem. The first iostat output line is since-boot average — skip it and read from line 2 onward. For process-level attribution, `iotop -o` shows exactly which process is generating the I/O.

---

*Related: [Linux High CPU Usage: Step-by-Step Troubleshooting Guide](/blog/linux-high-cpu-usage-troubleshooting) — when high I/O leads to high load average, distinguish the two. [How to Find Large Files in Linux](/blog/find-large-files-linux-guide) — if high write I/O is filling disk, find the file responsible.*
