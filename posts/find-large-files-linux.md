---
title: "How to Find Large Files in Linux: Practical Guide"
date: "2026-04-22"
excerpt: "Find large files in Linux using find, du, and ncdu — with real command examples for disk cleanup, log hunting, and storage audits on production servers."
tags: ["linux", "troubleshooting", "infrastructure", "debugging"]
featured: false
slug: "find-large-files-linux-guide"
category: "linux"
---

# How to Find Large Files in Linux: Practical Guide

Disk is full. Alert is firing. You have 30 seconds to find what's eating space. Here's how to do it fast.

---

## TL;DR

```bash
# Top 10 largest files from current directory, recursive
find / -type f -printf '%s %p\n' 2>/dev/null | sort -rn | head -20

# Top disk users by directory
du -sh /* 2>/dev/null | sort -rh | head -20

# Interactive TUI (best for exploration)
ncdu /
```

---

## find: Locate Files by Size

### Files larger than a threshold

```bash
# Files larger than 100MB
find / -type f -size +100M 2>/dev/null

# Larger than 1GB
find / -type f -size +1G 2>/dev/null

# In a specific directory
find /var/log -type f -size +50M
```

### With human-readable sizes in output

```bash
find / -type f -size +100M -exec ls -lh {} \; 2>/dev/null | awk '{print $5, $9}' | sort -rh
```

### Find and sort by size

```bash
find /var -type f -printf '%s %p\n' 2>/dev/null | sort -rn | head -20 | \
  awk '{printf "%.1fMB\t%s\n", $1/1048576, $2}'
```

---

## du: Find Which Directories Are Largest

`du` measures disk usage per directory — essential when you know disk is full but don't know which directory to dig into.

### Top-level breakdown

```bash
du -sh /* 2>/dev/null | sort -rh | head -15
```

### Drill into a specific directory

```bash
du -sh /var/* 2>/dev/null | sort -rh | head -10
# Then drill deeper:
du -sh /var/log/* 2>/dev/null | sort -rh | head -10
```

### One-liner: biggest directories recursively

```bash
du -ah /var/log 2>/dev/null | sort -rh | head -20
```

Flags:
- `-a` — include files, not just directories
- `-s` — summarize (don't recurse into subdirs)
- `-h` — human-readable
- `-rh` in `sort` — reverse human-readable sort (largest first)

---

## Real Examples

### Disk alert: find the culprit fast

```bash
# Step 1: which filesystem is full?
df -h

# Step 2: which top-level dir is the problem?
du -sh /* 2>/dev/null | sort -rh | head -10

# Step 3: drill down
du -sh /var/* 2>/dev/null | sort -rh | head -10

# Step 4: find the actual file
find /var/log -type f -size +100M -exec ls -lh {} \;
```

### Find bloated log files

```bash
find /var/log -name "*.log" -size +50M -exec ls -lh {} \;

# Also check rotated/compressed logs
find /var/log -name "*.gz" -size +10M -exec ls -lh {} \;
```

### Find recently created large files (last 24h)

```bash
find / -type f -size +50M -mtime -1 2>/dev/null
# -mtime -1 = modified within last 1 day
```

### Find core dump files (often GBs)

```bash
find / -name "core" -o -name "core.[0-9]*" 2>/dev/null | xargs ls -lh 2>/dev/null
```

### Docker: find large container layers

```bash
du -sh /var/lib/docker/* 2>/dev/null | sort -rh
du -sh /var/lib/docker/overlay2/* 2>/dev/null | sort -rh | head -10
```

---

## ncdu: Interactive Disk Usage Explorer

`ncdu` is the tool to use when you want to explore interactively instead of running multiple commands.

```bash
# Install
apt install ncdu       # Ubuntu
dnf install ncdu       # RHEL

# Run
ncdu /
ncdu /var

# Navigation:
# ↑↓ to move, Enter to drill in, d to delete, q to quit
```

It shows a live tree sorted by size, lets you delete files directly, and is significantly faster than running `du` manually through each level.

---

## Output Explanation

When you run `find / -type f -size +100M -exec ls -lh {} \;`:

```
-rw-r--r-- 1 root root 2.3G Apr 20 03:11 /var/log/app/debug.log
-rw-r--r-- 1 root root 450M Apr 19 22:45 /var/log/nginx/access.log
```

The size column (`2.3G`, `450M`) is the actual file size on disk. The date is last modification time — useful for identifying files that are actively growing vs old ones.

---

## Common Mistakes

**Mistake 1: Running `du /` without `2>/dev/null`**
Floods the terminal with permission errors. Always redirect stderr.

**Mistake 2: Deleting log files while a process has them open**
The file disappears from the directory but the space isn't freed until the process closes it.

```bash
# Check if a file is held open by a process
lsof /var/log/app/debug.log

# If yes: truncate instead of delete
truncate -s 0 /var/log/app/debug.log
# This frees space immediately without closing the file handle
```

**Mistake 3: Not checking `/proc` and `/sys`**
These are virtual filesystems — huge apparent sizes, but no actual disk use. Exclude them:

```bash
find / -type f -size +100M \
  ! -path "/proc/*" ! -path "/sys/*" ! -path "/dev/*" \
  2>/dev/null
```

**Mistake 4: Forgetting deleted-but-open files**

```bash
# Check for files deleted but still held open (consuming space)
lsof | grep deleted | awk '{print $7, $9}' | sort -rn | head -10
```

---

## Pro Tips

```bash
# Find files not accessed in 90+ days (cleanup candidates)
find /opt -type f -atime +90 -size +10M 2>/dev/null

# Find the top 5 largest files on each mounted filesystem
for fs in $(df --output=target | tail -n +2); do
  echo "=== $fs ===";
  find "$fs" -maxdepth 5 -type f -printf '%s %p\n' 2>/dev/null \
    | sort -rn | head -3 | awk '{printf "%.0fMB\t%s\n", $1/1048576, $2}';
done

# Watch a file grow in real time
watch -n 2 'ls -lh /var/log/app/debug.log'

# Estimate how fast a directory is growing
du -sh /var/log/app; sleep 60; du -sh /var/log/app
```

---

## Conclusion

When disk fills: `df -h` → `du -sh /* | sort -rh` → drill down. That sequence takes 60 seconds and gets you to the file.

For regular audits or interactive exploration, `ncdu` saves time. For scripting and alerts, `find -size` combined with `sort` gives clean output you can act on immediately.

---

*Also useful: [Linux Log Analysis: Debug Issues Like a Senior Engineer](/blog/linux-log-analysis-debugging-guide) — log files are the most common disk fillers. [Docker Log Rotation: Stop Disk Exhaustion](/blog/docker-log-rotation) — container logs can fill a disk in hours without rotation.*
