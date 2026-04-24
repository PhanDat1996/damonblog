---
title: "Linux Check File Size: ls, du, stat Command Examples"
date: "2026-04-22"
excerpt: "Check file size in Linux using ls -lh, du, and stat — understand apparent size vs disk usage, find files by size, and script size checks with real examples."
tags: ["linux", "troubleshooting", "infrastructure", "debugging"]
featured: false
slug: "linux-check-file-size-command"
category: "linux"
---

Three tools. Each gives you slightly different information. Here's when to use which.

---

## TL;DR

```bash
ls -lh file.log              # human-readable size in listing
du -sh file.log              # disk usage (may differ from file size)
stat file.log                # detailed: size, blocks, timestamps
wc -c file.log               # size in bytes only
```

---

## ls -lh: Size in a File Listing

```bash
ls -lh /var/log/nginx/
```

```
-rw-r--r-- 1 www-data www-data  450M Apr 22 09:15 access.log
-rw-r--r-- 1 www-data www-data  2.3G Apr 22 08:22 error.log
-rw-r--r-- 1 www-data www-data   89K Apr 21 14:00 error.log.1
```

The fifth column is the file size. `-h` makes it human-readable (K/M/G).

```bash
# Just size and name (no other columns)
ls -lh /var/log/ | awk '{print $5, $9}'

# Sort by size
ls -lhS /var/log/          # smallest to largest
ls -lhSr /var/log/         # largest to smallest (-r reverses)
```

---

## du -sh: Disk Usage

```bash
du -sh /var/log/nginx/error.log
# 2.3G    /var/log/nginx/error.log
```

`du` shows actual disk space consumed (rounded up to block size). It can differ from `ls -lh` for sparse files.

```bash
# Multiple files
du -sh /var/log/*

# Sort by size
du -sh /var/log/* | sort -rh | head
```

---

## stat: Complete File Information

```bash
stat /var/log/nginx/error.log
```

```
  File: /var/log/nginx/error.log
  Size: 2466250752     Blocks: 4817088    IO Block: 4096   regular file
Device: 801h/2049d     Inode: 123456      Links: 1
Access: (0644/-rw-r--r--)  Uid: (33/www-data)   Gid: (33/www-data)
Access: 2026-04-22 09:15:01.234567890 +0000
Modify: 2026-04-22 09:15:42.123456789 +0000
Change: 2026-04-22 09:15:42.123456789 +0000
```

Key fields:
- `Size` — file size in bytes
- `Blocks` — 512-byte blocks allocated on disk
- `Access/Modify/Change` — atime, mtime, ctime

---

## Get Size in Bytes (for scripts)

```bash
# wc -c: byte count
wc -c /var/log/nginx/error.log
# 2466250752 /var/log/nginx/error.log

# stat: just the number
stat -c %s /var/log/nginx/error.log
# 2466250752

# du: in kilobytes (no -h)
du -k /var/log/nginx/error.log
# 2407552  /var/log/nginx/error.log
```

---

## Real Examples

### Check if a file is growing (log rotation working?)

```bash
# Size at two points in time
SIZE1=$(stat -c %s /var/log/app/app.log)
sleep 60
SIZE2=$(stat -c %s /var/log/app/app.log)
echo "Growth: $((SIZE2 - SIZE1)) bytes/minute"
```

### Alert when a log file exceeds a threshold

```bash
#!/bin/bash
LOGFILE="/var/log/app/debug.log"
MAX_SIZE=$((500 * 1024 * 1024))  # 500MB in bytes

SIZE=$(stat -c %s "$LOGFILE" 2>/dev/null || echo 0)
if [ "$SIZE" -gt "$MAX_SIZE" ]; then
  echo "ALERT: $LOGFILE is $(du -sh $LOGFILE | cut -f1) — exceeds 500MB"
fi
```

### Find all files over 1GB

```bash
find / -type f -size +1G -exec ls -lh {} \; 2>/dev/null
```

### Compare apparent size vs disk usage

```bash
# Apparent size (what ls shows)
ls -lh sparsefile
# -rw-r--r-- 1 root root 10G

# Actual disk blocks used (sparse file = much less)
du -sh sparsefile
# 48K    sparsefile   ← only 48KB of actual blocks allocated
```

---

## ls vs du: Why They Sometimes Differ

`ls -lh` shows the **file's logical size** (bytes of content).
`du -sh` shows **disk blocks allocated** (rounded to block size, can include holes in sparse files).

For most regular files: same result. For sparse files, compressed filesystems, or files with holes: they differ. For monitoring disk usage, `du` is more accurate.

---

## Common Mistakes

**Mistake 1: Confusing file size with disk usage**
A 2GB log file uses ~2GB disk space. A 10GB sparse virtual disk image might only use 100MB of actual blocks. `ls` shows 10GB, `du` shows 100MB. Both are correct.

**Mistake 2: `ls -l` without `-h` for large files**
```bash
ls -l /var/log/error.log
# -rw-r--r-- 1 www 2466250752 Apr 22 error.log  ← bytes, hard to read

ls -lh /var/log/error.log
# -rw-r--r-- 1 www 2.3G Apr 22 error.log  ← human-readable
```

**Mistake 3: Using `wc -c` on binary files**
`wc -c` is fine for any file — it counts bytes, not lines. But it reads the whole file, which is slow for multi-GB files. Use `stat -c %s` instead:

```bash
stat -c %s largefile.bin   # instant, no file read
wc -c largefile.bin        # reads entire file — slow for big files
```

---

## Quick Reference

```bash
ls -lh file              # human-readable size in listing
ls -lhS dir/             # sort by size
du -sh file              # disk space used
du -sh dir/* | sort -rh  # directory sizes sorted
stat file                # full info including timestamps
stat -c %s file          # size in bytes only (for scripts)
wc -c file               # size in bytes
find / -size +1G         # find files over 1GB
```

---

## Conclusion

`ls -lh` for quick visual check. `du -sh` for accurate disk usage. `stat -c %s` for scripting (returns bytes, no file reading needed). For finding files by size, `find -size` with `+100M` syntax is the right tool.

---

*Related: [How to Find Large Files in Linux](/blog/find-large-files-linux-guide) — finding files by size across directories. [Check Disk Usage in Linux: du vs df](/blog/check-disk-usage-linux-du-df) — filesystem-level vs directory-level disk usage.*
