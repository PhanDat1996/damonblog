---
title: "Linux Check Disk Usage by Folder: du Command Guide"
date: "2026-04-22"
excerpt: "Check disk usage by folder in Linux with du — sort directories by size, drill down to find what's consuming space, and use ncdu for interactive exploration."
tags: ["linux", "troubleshooting", "infrastructure", "debugging"]
featured: false
slug: "linux-check-disk-usage-by-folder-du"
category: "linux"
---

`df` tells you a filesystem is full. `du` tells you which folder is responsible. Here's how to use it efficiently.

---

## TL;DR

```bash
du -sh /var/log          # total size of one folder
du -sh /var/log/*        # size of each item inside
du -sh /* 2>/dev/null | sort -rh | head -10   # largest top-level dirs
```

---

## Basic du Usage

```bash
# Size of a directory (recursive total)
du -sh /var/log
# 2.3G    /var/log

# Size of each item inside a directory
du -sh /var/log/*
# 512M    /var/log/nginx
# 1.2G    /var/log/app
# 89M     /var/log/syslog
```

Flags:
- `-s` — summarize (one line per argument, don't recurse into subdirectories)
- `-h` — human-readable (K, M, G)
- `-a` — all files, not just directories

---

## Sort by Size

```bash
# Largest directories first
du -sh /var/log/* 2>/dev/null | sort -rh | head -10

# Sort with human-readable numbers — sort -h handles K/M/G correctly
du -sh /var/log/* 2>/dev/null | sort -rh
```

`sort -rh`:
- `-r` — reverse (largest first)
- `-h` — human-numeric sort (understands G > M > K)

---

## The Full Investigation Workflow

```bash
# Step 1: which filesystem is full?
df -h

# Step 2: largest top-level directories
du -sh /* 2>/dev/null | sort -rh | head -10
# /var  38G

# Step 3: drill into /var
du -sh /var/* 2>/dev/null | sort -rh | head -10
# /var/log  31G

# Step 4: drill into /var/log
du -sh /var/log/* 2>/dev/null | sort -rh | head -10
# /var/log/app  28G

# Step 5: find the actual files
find /var/log/app -type f -size +1G -ls
```

---

## du Variations

```bash
# With depth limit (don't recurse more than 2 levels)
du -h --max-depth=2 /var 2>/dev/null | sort -rh | head -20

# Show all files (not just directories)
du -ah /var/log 2>/dev/null | sort -rh | head -20

# Total for multiple directories
du -sh /var/log /home /opt 2>/dev/null | sort -rh
```

---

## ncdu: Interactive Disk Explorer

When you want to navigate interactively instead of running multiple commands:

```bash
apt install ncdu     # Ubuntu
dnf install ncdu     # RHEL

ncdu /var
ncdu /               # whole filesystem
```

Navigation: `↑↓` to move, `Enter` to drill in, `d` to delete, `q` to quit. Sorts by size automatically. Much faster for exploration than running `du` commands repeatedly.

---

## Real Examples

### Find what's filling /var on a production server

```bash
du -sh /var/* 2>/dev/null | sort -rh | head -10
# 31G    /var/log
# 4.2G   /var/lib
# 1.1G   /var/cache

du -sh /var/log/* 2>/dev/null | sort -rh | head -5
# 28G    /var/log/app
# 2.1G   /var/log/nginx
# 512M   /var/log/journal

# Found it — app logs are the problem
find /var/log/app -type f -size +1G -ls
```

### Check disk usage for Docker

```bash
du -sh /var/lib/docker/
# 45G    /var/lib/docker

du -sh /var/lib/docker/* 2>/dev/null | sort -rh | head
# 38G    /var/lib/docker/overlay2   ← image layers
# 4.1G   /var/lib/docker/volumes
# 2.9G   /var/lib/docker/containers

# Use docker's own tool for better detail
docker system df
```

### Periodic disk usage report

```bash
#!/bin/bash
# /etc/cron.daily/disk-usage-report
echo "=== Disk Usage Report $(date) ===" >> /var/log/disk_usage.log
df -h | grep -v tmpfs >> /var/log/disk_usage.log
du -sh /var/log /home /opt /var/lib/docker 2>/dev/null | sort -rh >> /var/log/disk_usage.log
```

### Find directories that grew recently

```bash
# Modified in the last 24h AND larger than 100MB
find / -type d -mtime -1 -not -path "/proc/*" -not -path "/sys/*" 2>/dev/null \
  | while read dir; do
    size=$(du -sh "$dir" 2>/dev/null | cut -f1)
    echo "$size  $dir"
  done | sort -rh | head -10
```

---

## Common Mistakes

**Mistake 1: Running `du /` without `2>/dev/null`**
Floods output with permission errors. Always redirect stderr.

**Mistake 2: Using `du` without `-s` and getting recursive output**
`du /var/log` (without `-s`) shows every subdirectory recursively. Add `-s` to get just the total.

**Mistake 3: `sort -rn` instead of `sort -rh`**
`sort -rn` sorts numerically — it doesn't understand `K`, `M`, `G`. Use `sort -rh` for human-readable values.

```bash
du -sh /var/log/*
# 512M  access.log
# 1.2G  app/
# 89K   syslog

du -sh /var/log/* | sort -rn   # WRONG: 89K ranks above 512M
du -sh /var/log/* | sort -rh   # CORRECT: 1.2G > 512M > 89K
```

**Mistake 4: `du` vs `df` disagreement**
If `df` shows 38GB used but `du` totals to 25GB: deleted-but-open files are holding the difference. Check `lsof | grep deleted`.

---

## Quick Reference

```bash
du -sh /path                     # total size of path
du -sh /path/* | sort -rh        # items sorted by size
du -sh /* 2>/dev/null | sort -rh | head  # top-level largest dirs
du -h --max-depth=2 /var | sort -rh | head  # 2 levels deep
du -ah /var/log | sort -rh | head  # all files + dirs sorted
ncdu /var                        # interactive explorer
```

---

## Conclusion

The pattern is always the same: `du -sh /* | sort -rh` → find the large directory → drill one level deeper → repeat until you find the file. Add `2>/dev/null` to suppress permission errors. Use `sort -rh` not `sort -rn` for human-readable sizes. When `du` and `df` disagree, check for deleted-but-open files.

---

*Related: [Check Disk Usage in Linux: du vs df Explained](/blog/check-disk-usage-linux-du-df) — why du and df sometimes disagree. [How to Find Large Files in Linux](/blog/find-large-files-linux-guide) — find individual files by size.*
