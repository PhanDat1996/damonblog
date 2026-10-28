---
title: "Check Disk I/O on Linux with iostat: What the Columns Mean"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "High load but idle CPU? Use iostat -x to check disk I/O latency and saturation, read r_await, aqu-sz and %util right, then find the process with pidstat."
tags: ["linux", "monitoring", "troubleshooting", "infrastructure"]
featured: false
noindex: true
category: "linux"
---

Load average is 12 on an 8-core box, the app is slow, but `top` shows the CPUs mostly idle. Look at the `wa` (iowait) value in `top`'s CPU line: if it's high, processes are stuck waiting for the disk. `iostat` tells you which disk, how slow each request is, and whether it's simply overloaded.

```bash
sudo apt install sysstat      # Debian/Ubuntu
sudo dnf install sysstat      # Fedora/RHEL

iostat -dxy 2                 # extended per-device stats every 2 s, skip the since-boot report
```

Read three numbers per device: **`r_await` / `w_await`** (latency in ms), **`aqu-sz`** (requests in flight), and **`%util`**, which is only meaningful on single spinning disks. Details below.

---

## Reading `iostat -x` output

Current sysstat (version 12 and later, shipped in Ubuntu 20.04+, RHEL 8+, Debian 11+) prints this, trimmed here to the columns you'll use most:

```
Device     r/s     rkB/s  r_await rareq-sz     w/s     wkB/s  w_await wareq-sz  aqu-sz  %util
nvme0n1  412.00  26368.00    0.21    64.00  1830.50  58576.00    0.88    32.00    1.70  64.20
sda        3.50     56.00    9.14    16.00   182.00   5824.00   46.37    32.00    8.47  99.60
```

| Column | Meaning |
|---|---|
| `r/s`, `w/s` | Read and write requests completed per second (IOPS) |
| `rkB/s`, `wkB/s` | Throughput in kB/s (`-h` or `-m` for friendlier units) |
| `r_await`, `w_await` | Average time per request in ms, **including time spent queued**. This is what your application feels. |
| `rareq-sz`, `wareq-sz` | Average request size in kB. Small (4–16) means random I/O; large (256+) means sequential. |
| `rrqm/s`, `wrqm/s` | Requests merged by the kernel before reaching the device |
| `aqu-sz` | Average number of requests queued or in flight |
| `%util` | Percentage of time the device had at least one request in progress |

Older sysstat (version 11 and earlier, e.g. CentOS 7) uses different names: `avgrq-sz` (in 512-byte sectors), `avgqu-sz`, a combined `await`, and `svctm`. `svctm` was never accurate and was removed; ignore it if you see it.

**Always skip the first report.** Without `-y`, the first block iostat prints is the average **since boot**, which hides any current problem. Either use `-y` or ignore the first block.

---

## How to tell if a disk is the bottleneck

### Latency first

`r_await` and `w_await` are the most direct signal. Rough expectations for a healthy device under normal load:

| Device | Typical latency |
|---|---|
| NVMe SSD | well under 1 ms |
| SATA SSD | around 1 ms or less |
| 7200 rpm HDD | 5–15 ms for random I/O |
| Cloud block storage (EBS, Persistent Disk) | about 0.5–3 ms, rising sharply when you hit the volume's IOPS or throughput limit |

These are rules of thumb, not specs. What matters is the change: if `w_await` was 1 ms yesterday and is 40 ms now, something is wrong even if 40 ms sounds acceptable for an HDD.

In the sample above, `sda` is the problem: 46 ms writes, 8+ requests waiting, 99.6% busy.

### Why %util lies on SSDs and RAID

`%util` only measures whether the device had *any* request in flight. A single HDD serves one request at a time, so 100% really means saturated. An NVMe drive or a RAID array serves many requests in parallel; it can show 100% `%util` while having plenty of capacity left. On those devices judge by latency and by whether IOPS/throughput are near the device's or cloud volume's limit.

### aqu-sz

`aqu-sz` around 8 on a single HDD means requests are waiting in line, and each one waits for all the ones ahead. On an NVMe drive, an `aqu-sz` of 8 can be completely normal because the device works on them in parallel. Read it together with `await`: a high queue **and** rising latency means the device can't keep up.

### Cloud volumes

On cloud block storage you can hit the **provisioned limit** long before the hardware is busy. If `r/s + w/s` sits flat at a round number (3000, 16000) or throughput flat at the volume's MB/s cap while latency climbs, you're being throttled. The fix is a bigger or faster volume tier, not tuning.

---

## Which process is causing the I/O?

`iostat` is per device. To get per process, `pidstat` comes in the same `sysstat` package:

```bash
pidstat -d 2
```

```
10:42:01 AM   UID       PID   kB_rd/s   kB_wr/s kB_ccwr/s iodelay  Command
10:42:03 AM   999      3012      0.00  44180.00      0.00      87  postgres
10:42:03 AM     0       412      0.00    186.00      0.00       0  jbd2/sda1-8
10:42:03 AM  1000     18233   5120.00      0.00      0.00      12  rsync
```

`iotop -o` shows the same information interactively (needs root). On kernel 5.14 and later, its `IO>` percentage column stays empty unless delay accounting is enabled (`sysctl kernel.task_delayacct=1`); the read/write rates work regardless.

Then see what files that process is working on:

```bash
sudo ls -l /proc/3012/fd | grep -v -e socket -e pipe
```

Common culprits: database checkpoints or vacuum, backup jobs (`rsync`, `tar`), log shipping, `updatedb`/`mlocate` cron runs, swapping (check `si`/`so` in `vmstat 1`), and a log being written at debug level.

If the I/O is from deleting or cleaning up a huge number of files, see [Delete Large Files Safely](/blog/how-to-delete-large-files-linux-safely) for ways to throttle it.

---

## Is anything actually waiting? (PSI)

On kernel 4.20 and later, pressure stall information tells you how much time tasks spent stalled on I/O, which is closer to "is this hurting the application" than any iostat column:

```bash
cat /proc/pressure/io
# some avg10=34.12 avg60=28.40 avg300=12.05 total=918273645
# full avg10=21.77 avg60=17.90 avg300=7.31 total=601928374
```

`some` = percentage of time at least one task was waiting on I/O; `full` = all non-idle tasks were. A `full avg10` in double digits means real stalls.

---

## Looking at the past with sar

The slowdown happened at 2 a.m. and it's 9 a.m. now. If sysstat's collector is enabled, `sar` has the history:

```bash
sudo systemctl enable --now sysstat     # start collecting (Debian/Ubuntu also: ENABLED="true" in /etc/default/sysstat)

sar -d -p -s 02:00:00 -e 02:30:00 -f /var/log/sysstat/sa28    # Debian/Ubuntu
sar -d -p -s 02:00:00 -e 02:30:00 -f /var/log/sa/sa28          # RHEL/Fedora
```

`-p` prints real device names instead of `dev8-0`, `sa28` is the file for the 28th of the month, and `-s`/`-e` limit the time window. Default collection is every 10 minutes, so short spikes get averaged out.

---

## Useful variations

```bash
iostat -dxy sda nvme0n1 2       # only these devices
iostat -dxyp sda 2              # sda and its partitions
iostat -dxym 2                  # throughput in MB/s
iostat -dxy 5 3                 # three 5-second reports, then exit
```

For a simple watch in a script, use `-y` and a single report so you never read the since-boot numbers:

```bash
iostat -dxy sda 5 1 | awk '$1=="Device" {for (i=1; i<=NF; i++) col[$i]=i}
                           $1=="sda"    {print "w_await=" $col["w_await"], "%util=" $col["%util"]}'
```

Column positions differ between sysstat versions (newer ones add discard and flush columns), so the script looks fields up by header name instead of hardcoding numbers.

---

## Quick checklist

1. `top`: high `wa` and load with idle CPU? Suspect disk.
2. `iostat -dxy 2`: which device has high `r_await`/`w_await`?
3. HDD at ~100% `%util`, or cloud volume flat at its IOPS cap? It's saturated.
4. `pidstat -d 2`: which process is doing the I/O?
5. Need the past? `sar -d -p` with the right `saDD` file.

*Related: [Linux Performance Troubleshooting Guide](/blog/linux-performance-troubleshooting-guide) for the full CPU, memory, disk and network triage. [Linux High CPU Usage](/blog/linux-high-cpu-usage-guide) to rule out CPU when load is high. [Disk Full on Linux](/blog/disk-full-linux-cleanup) if the disk is full rather than slow.*
