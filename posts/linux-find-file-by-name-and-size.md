---
title: "Linux Find File by Name and Size: Real Examples"
date: "2026-04-22"
excerpt: "Use Linux find command to locate files by name pattern, size, date, and permissions — with real production examples and combined search techniques."
tags: ["linux", "troubleshooting", "debugging", "infrastructure"]
featured: false
slug: "linux-find-file-by-name-size-guide"
---

# Linux Find File by Name and Size: Real Examples

The `find` command is one of the most powerful tools on Linux. Most engineers know the basics — here's how to actually use it in production for real search tasks.

---

## TL;DR

```bash
# Find by name
find /var/log -name "*.log"

# Find by size (files > 100MB)
find / -type f -size +100M 2>/dev/null

# Find by name AND size
find /var/log -name "*.log" -size +50M

# Find by name, case-insensitive
find / -iname "debug*" -type f 2>/dev/null
```

---

## Find by Name

```bash
# Exact match
find /etc -name "nginx.conf"

# Wildcard pattern
find /var/log -name "*.log"
find /opt -name "app-*"

# Case-insensitive
find / -iname "*.Log" 2>/dev/null

# Multiple patterns (OR)
find /var/log \( -name "*.log" -o -name "*.gz" \)
```

---

## Find by Size

Size suffixes: `c` (bytes), `k` (kilobytes), `M` (megabytes), `G` (gigabytes).

```bash
# Larger than
find / -type f -size +100M 2>/dev/null

# Smaller than
find /tmp -type f -size -1k

# Exactly
find / -type f -size 512k

# Range: between 10MB and 100MB
find /var -type f -size +10M -size -100M 2>/dev/null
```

---

## Combine Name + Size

This is where `find` becomes a real tool:

```bash
# Log files larger than 50MB
find /var/log -name "*.log" -size +50M

# Python files smaller than 100KB
find /opt/app -name "*.py" -size -100k

# Config files matching a pattern, any size
find /etc -name "*.conf" -type f

# Core dump files (usually large, specific naming)
find / -name "core" -o -name "core.[0-9]*" -type f 2>/dev/null
```

---

## Real Examples

### Find recently modified large files (incident investigation)

```bash
# Files over 100MB modified in the last 2 hours
find / -type f -size +100M -mmin -120 2>/dev/null

# Files modified today
find /var/log -type f -mtime 0

# Files modified in the last 30 minutes
find /var/log -type f -mmin -30
```

### Find and delete old log files (cleanup)

```bash
# Preview what would be deleted
find /var/log -name "*.log.gz" -mtime +30 -type f

# Delete (add -delete or use xargs)
find /var/log -name "*.log.gz" -mtime +30 -type f -delete

# Or with size filter — only delete large old logs
find /var/log -name "*.log.gz" -mtime +30 -size +10M -type f -delete
```

### Find files with specific permissions

```bash
# World-writable files (security audit)
find / -type f -perm -0002 ! -path "/proc/*" ! -path "/sys/*" 2>/dev/null

# SUID files
find / -type f -perm -4000 2>/dev/null

# Files owned by a specific user
find /home -user appuser -name "*.conf"
```

### Find duplicate-named files in different locations

```bash
# Find all files named "config.yml" anywhere
find / -name "config.yml" -type f 2>/dev/null

# Find all nginx config files
find / -name "nginx.conf" -o -name "*.conf" -path "*/nginx/*" 2>/dev/null
```

### Find files containing a string (find + grep)

```bash
# Files containing "password" in /etc
find /etc -type f -exec grep -l "password" {} \; 2>/dev/null

# More efficient with xargs
find /etc -type f | xargs grep -l "password" 2>/dev/null

# Find and show matching lines
find /var/log -name "*.log" -exec grep -Hn "ERROR" {} \; 2>/dev/null | head -20
```

---

## Output Explanation

Basic `find` output is just file paths, one per line:

```
/var/log/nginx/access.log
/var/log/nginx/error.log
/var/log/app/debug.log
```

With `-ls` for detailed output:

```bash
find /var/log -name "*.log" -size +10M -ls 2>/dev/null
```

```
12345678  45320 -rw-r--r--   1 www-data  www-data  46407680 Apr 20 14:22 /var/log/nginx/access.log
12345679  2880  -rw-r--r--   1 root      root       2949120 Apr 20 14:22 /var/log/nginx/error.log
```

Columns: inode, blocks, permissions, links, owner, group, size(bytes), date, path.

---

## Common Mistakes

**Mistake 1: Running `find /` without `2>/dev/null`**
Every directory you can't read generates a "Permission denied" error. Redirect stderr.

**Mistake 2: Size units — `find` uses binary, not decimal**
`-size +1G` means > 1 GiB (1073741824 bytes), not 1 GB. For most purposes this doesn't matter but is worth knowing.

**Mistake 3: Using `-exec rm` without previewing first**
Always test your search before deleting:

```bash
# Step 1: preview
find /tmp -name "*.tmp" -mtime +7 -type f

# Step 2: delete only after confirming output
find /tmp -name "*.tmp" -mtime +7 -type f -delete
```

**Mistake 4: Forgetting to exclude `/proc` and `/sys`**
These virtual filesystems cause weird results and errors:

```bash
find / -type f -size +100M \
  ! -path "/proc/*" \
  ! -path "/sys/*" \
  ! -path "/dev/*" \
  2>/dev/null
```

**Mistake 5: Slow performance searching `/`**
Use `-maxdepth` when you know the file is near the top:

```bash
find / -maxdepth 4 -name "config.yml" 2>/dev/null
```

---

## Pro Tips

```bash
# Find and sort by size (largest first)
find /var -type f -printf '%s %p\n' 2>/dev/null | sort -rn | head -20 | \
  awk '{printf "%.1fMB\t%s\n", $1/1048576, $2}'

# Find files not accessed in 90 days (cleanup candidates)
find /opt -type f -atime +90 -size +10M 2>/dev/null

# Count files by extension
find /opt/app -type f | sed 's/.*\.//' | sort | uniq -c | sort -rn

# Find and compress large old logs
find /var/log -name "*.log" -mtime +7 -size +50M \
  -exec gzip -9 {} \; 2>/dev/null

# Find broken symlinks
find / -type l ! -exec test -e {} \; -print 2>/dev/null
```

---

## Conclusion

`find` with `-name` and `-size` together covers 80% of real search tasks. Add `-mtime` for time-based filtering, `-exec` or `xargs` to act on results. Always redirect `2>/dev/null` and preview before deleting.

---

*Related: [How to Check Disk Usage in Linux: du vs df](/blog/check-disk-usage-linux-du-df) — once you know where space is going, du and df help you quantify it. [Linux Log Analysis](/blog/linux-log-analysis-debugging-guide) — for finding content inside those log files.*
