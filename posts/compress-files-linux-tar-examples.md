---
title: "How to Compress Files in Linux: tar Examples"
date: "2026-04-22"
excerpt: "Compress files in Linux with tar — create .tar.gz and .tar.bz2 archives, choose the right compression level, and handle common tar use cases with real examples."
tags: ["linux", "infrastructure", "troubleshooting", "debugging"]
featured: false
slug: "compress-files-linux-tar-examples"
---

`tar` is the standard tool for archiving and compressing files on Linux. The syntax is dense but the core patterns are simple once you know them.

---

## TL;DR

```bash
# Create .tar.gz archive
tar -czf archive.tar.gz /path/to/directory

# Create .tar.bz2 (better compression, slower)
tar -cjf archive.tar.bz2 /path/to/directory

# Create .tar.xz (best compression, slowest)
tar -cJf archive.tar.xz /path/to/directory

# View contents without extracting
tar -tzf archive.tar.gz
```

---

## The Flag System

Every tar command has three parts: **action**, **compression**, **filename**.

| Flag | Action |
|---|---|
| `-c` | Create archive |
| `-x` | Extract archive |
| `-t` | List contents |

| Flag | Compression |
|---|---|
| `-z` | gzip (.gz) — fast, widely compatible |
| `-j` | bzip2 (.bz2) — better compression, slower |
| `-J` | xz (.xz) — best compression, slowest |
| (none) | No compression (.tar only) |

Always add:
- `-f archive.tar.gz` — filename (must follow `-f` immediately)
- `-v` — verbose (show files being processed)

---

## Create Archives

```bash
# Directory to .tar.gz
tar -czf backup.tar.gz /var/log/app/

# Multiple files/dirs
tar -czf backup.tar.gz /var/log/app/ /etc/nginx/

# With verbose output (see each file being added)
tar -czvf backup.tar.gz /var/log/app/

# Current directory
tar -czf archive.tar.gz .

# Exclude a pattern
tar -czf backup.tar.gz /var/log/ --exclude="*.gz" --exclude="*.bz2"

# Exclude a directory
tar -czf backup.tar.gz /var/www/ --exclude=/var/www/html/uploads
```

---

## Compression Comparison

```bash
# Same 500MB log directory:
tar -czf  logs.tar.gz  logs/   # gzip:  ~120MB, 8 seconds
tar -cjf  logs.tar.bz2 logs/   # bzip2: ~95MB,  45 seconds
tar -cJf  logs.tar.xz  logs/   # xz:    ~80MB,  90 seconds
```

**Choose gzip** for most tasks — fast and compatible everywhere.
**Choose xz** when transferring over slow links and compression ratio matters.

---

## Real Examples

### Backup a config directory before changes

```bash
tar -czf /tmp/nginx-config-backup-$(date +%Y%m%d).tar.gz /etc/nginx/
# /tmp/nginx-config-backup-20260422.tar.gz
```

### Archive logs for offsite storage

```bash
# Archive last month's logs
tar -czf /backup/logs-$(date +%Y%m).tar.gz \
  --newer-mtime="$(date -d '1 month ago' '+%Y-%m-01')" \
  /var/log/app/

# Verify the archive
tar -tzf /backup/logs-202603.tar.gz | head -10
```

### Compress in place without creating a separate archive (gzip single file)

```bash
# Compress a single large file
gzip /var/log/app/debug.log
# Creates debug.log.gz, removes original

# Keep original
gzip -k /var/log/app/debug.log

# Compress all .log files in a directory
gzip /var/log/app/*.log
```

### Split archive into parts for transfer

```bash
# Create and split into 1GB chunks
tar -czf - /var/data/ | split -b 1G - backup.tar.gz.

# Files: backup.tar.gz.aa, backup.tar.gz.ab, etc.

# Reassemble and extract
cat backup.tar.gz.* | tar -xzf -
```

---

## View Archive Contents

```bash
# List files without extracting
tar -tzf archive.tar.gz

# With detailed info (permissions, size, date)
tar -tvzf archive.tar.gz

# Check if a specific file is in the archive
tar -tzf archive.tar.gz | grep "config.yml"
```

---

## Common Mistakes

**Mistake 1: Getting `-f` flag position wrong**
`-f` must immediately precede the filename. This is the most common tar mistake:

```bash
tar -czf backup.tar.gz /path    # CORRECT
tar -czfv backup.tar.gz /path   # CORRECT (v after f before filename)
tar -czvf backup.tar.gz /path   # CORRECT (reordered flags fine, f last before filename)
tar -cfz backup.tar.gz /path    # WRONG: -f followed by z, then filename
```

**Mistake 2: Forgetting absolute vs relative paths**
Archives preserve the path structure from how you specified it:

```bash
tar -czf backup.tar.gz /var/log/app/   # extracts to /var/log/app/
tar -czf backup.tar.gz var/log/app/    # extracts to var/log/app/ (relative)

# To strip leading slashes (extract anywhere):
tar -xzf backup.tar.gz --strip-components=1
```

**Mistake 3: No disk space to create archive**
Compressing 10GB of logs needs space for the archive. Check first:

```bash
df -h /tmp   # where you're writing the archive
du -sh /var/log/app/  # size of source
```

---

## Quick Reference

```bash
# Create
tar -czf  archive.tar.gz  path/    # gzip
tar -cjf  archive.tar.bz2 path/    # bzip2
tar -cJf  archive.tar.xz  path/    # xz
tar -czf  archive.tar.gz  file1 file2 dir/   # multiple sources

# View
tar -tzf  archive.tar.gz            # list
tar -tvzf archive.tar.gz            # detailed list

# Extract (see next article)
tar -xzf  archive.tar.gz            # extract here
tar -xzf  archive.tar.gz -C /dest/  # extract to directory
```

---

## Conclusion

The pattern to memorise: `tar -czf output.tar.gz /source/path`. Flags in any order, but `-f` immediately before the filename. Use gzip (`.gz`) for speed and compatibility. Always verify with `tar -tzf` before sending an archive anywhere.

---

*Related: [How to Extract tar.gz Linux](/blog/how-to-extract-tar-gz-linux) — the other half of the tar workflow. [How to Delete Large Files Linux Safely](/blog/how-to-delete-large-files-linux-safely) — what to do with source files after archiving.*
