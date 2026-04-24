---
title: "Check Disk Usage in Linux: du vs df Explained"
date: "2026-04-22"
excerpt: "Check disk usage in Linux using df and du — understand the difference, read the output correctly, and find what's filling your disk with real command examples."
tags: ["linux", "troubleshooting", "infrastructure", "debugging"]
featured: false
slug: "check-disk-usage-linux-du-df"
category: "linux"
---

Disk is filling up. Two tools give you different answers to different questions: `df` tells you how much space is left on each filesystem, `du` tells you how much each directory or file is consuming.

---

## TL;DR

```bash
df -h           # filesystem-level: how full is each mount?
du -sh /*       # directory-level: what's consuming space?
du -sh /var/* | sort -rh | head -10   # find the biggest directories
```

---

## df: Filesystem-Level Usage

`df` reports disk space for each mounted filesystem.

```bash
df -h
```

Output:

```
Filesystem      Size  Used Avail Use%  Mounted on
/dev/sda1        50G   43G  4.2G  92%  /
tmpfs           7.8G     0  7.8G   0%  /dev/shm
/dev/sdb1       200G   12G  178G   7%  /data
```

**What to look at:**
- `Use%` — if this is above 85%, time to investigate
- `Avail` — actual free space
- `Mounted on` — which directory is on which device

### Useful df variations

```bash
# Show inode usage (a different kind of "full")
df -i

# Show specific filesystem
df -h /var

# Show filesystem type
df -Th

# List only real filesystems (skip tmpfs, devtmpfs)
df -hT --exclude-type=tmpfs --exclude-type=devtmpfs
```

---

## du: Directory-Level Usage

`df` tells you a filesystem is 92% full. `du` tells you which directory is responsible.

```bash
# Size of a specific directory
du -sh /var/log

# Top-level breakdown
du -sh /* 2>/dev/null | sort -rh | head -10

# Drill into /var
du -sh /var/* 2>/dev/null | sort -rh | head -10
```

### Flags explained

```bash
-s   # summarize — show total for directory, not per-file
-h   # human-readable (K, M, G)
-a   # all files, not just directories
--max-depth=1   # only one level deep
```

---

## Real Examples

### Full investigation workflow

```bash
# Step 1: which filesystem is full?
df -h
# /dev/sda1 is 92% full, mounted on /

# Step 2: which top-level dir is the culprit?
du -sh /* 2>/dev/null | sort -rh | head -10
# /var: 38G

# Step 3: drill into /var
du -sh /var/* 2>/dev/null | sort -rh | head -10
# /var/log: 31G

# Step 4: what's inside /var/log?
du -sh /var/log/* 2>/dev/null | sort -rh | head -10
# /var/log/app/debug.log: 28G
```

### Find directories larger than 1GB

```bash
du -h --max-depth=3 / 2>/dev/null | grep '^[0-9.]*G' | sort -rh | head -20
```

### Check disk usage by file type

```bash
# How much do log files take?
find /var/log -name "*.log" -exec du -ch {} + 2>/dev/null | tail -1

# How much do compressed logs take?
find /var/log -name "*.gz" -exec du -ch {} + 2>/dev/null | tail -1
```

### Monitor disk usage over time

```bash
# Simple: run every minute, log to file
while true; do
  echo "$(date): $(df -h / | tail -1 | awk '{print $5, $4}')"
  sleep 60
done | tee /tmp/disk_monitor.log
```

---

## Output Explanation

### df output decoded

```
Filesystem      Size  Used Avail Use%  Mounted on
/dev/sda1        50G   43G  4.2G  92%  /
```

- `Size` — total filesystem size
- `Used` — space consumed by files
- `Avail` — space available to non-root users (slightly less than `Size - Used`)
- `Use%` — `Used / Size` as percentage

**Why `Size - Used ≠ Avail`:** Linux reserves 5% of most filesystems for root by default. `df -h` shows the non-root available space. `df -h --block-size=1` shows raw bytes.

### du output decoded

```
38G    /var
31G    /var/log
3.2G   /var/lib
```

`du` shows the disk space used by the directory contents, **including all subdirectories**. The numbers are cumulative — `/var` includes `/var/log`.

---

## df vs du: Why They Sometimes Disagree

You'll see this: `df` says 40GB used, but all your `du` measurements add up to 25GB.

The difference is **deleted-but-open files**. When a process deletes a log file while still writing to it, `du` doesn't count it (it's unlinked from the directory), but `df` still counts the space (the inode is still allocated).

```bash
# Find deleted files still held open
lsof | grep deleted | awk '{print $7, $9}' | sort -rn | head -10
# 28747832  /var/log/app/debug.log (deleted)
```

Fix: either restart the process, or truncate the file (if the process handles it):

```bash
truncate -s 0 /proc/<pid>/fd/<fd_number>
```

---

## Common Mistakes

**Mistake 1: Using `du` without `2>/dev/null`**
Floods output with permission errors. Always redirect stderr.

**Mistake 2: Confusing `df` full with inode full**
Disk can appear full even with free space if inodes are exhausted.

```bash
df -i   # check inode usage
# Filesystem      Inodes  IUsed  IFree IUse% Mounted on
# /dev/sda1       3276800  3276799    1  100% /
# 100% inode usage = can't create new files, even with free space
```

**Mistake 3: Not accounting for reserved space**
`/dev/sda1 100G, used 95G, avail 0` — doesn't mean used = 100G. The 5% reserved for root (`tune2fs -m`) is included in `used` but excluded from `avail`.

```bash
# Check reserved blocks
tune2fs -l /dev/sda1 | grep "Reserved block"
# Reserved block count: 262144 (5% of total)
```

---

## Pro Tips

```bash
# Watch disk usage in real time
watch -n 5 'df -h && echo "---" && du -sh /var/log/* 2>/dev/null | sort -rh | head -5'

# Alert when disk crosses 90%
df -h | awk 'NR>1 {gsub(/%/,"",$5); if ($5 > 90) print "ALERT: "$1" is "$5"% full"}'

# Clean up Docker storage (often a major space consumer)
docker system prune -af --volumes

# Check journal size (often overlooked)
journalctl --disk-usage

# Check package manager cache
apt clean && df -h   # Ubuntu
dnf clean all && df -h   # RHEL
```

---

## Conclusion

`df -h` first — find which filesystem is full. Then `du -sh /* | sort -rh` to narrow down which directory. Drill in level by level until you find the file. If `df` and `du` disagree by a large margin, check for deleted-but-open files with `lsof | grep deleted`.

---

*Also useful: [How to Find Large Files in Linux](/blog/find-large-files-linux-guide) — going deeper with `find` to locate specific files. [Docker Log Rotation: Stop Disk Exhaustion](/blog/docker-log-rotation) — containers are a common cause of unexpected disk usage.*
