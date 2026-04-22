---
title: "How to Copy Files Recursively in Linux: cp, rsync Examples"
date: "2026-04-22"
excerpt: "Copy files recursively in Linux with cp and rsync — preserve permissions, sync directories, copy over SSH, and handle large transfers efficiently."
tags: ["linux", "infrastructure", "troubleshooting", "debugging"]
featured: false
slug: "how-to-copy-files-recursively-linux"
---

Two tools: `cp` for local copies, `rsync` for everything that needs more control — preserving permissions, syncing, or copying over the network.

---

## TL;DR

```bash
# Copy directory recursively (local)
cp -r /source/dir /destination/

# Copy preserving all attributes
cp -a /source/dir /destination/

# Sync with rsync (local or remote)
rsync -av /source/dir/ /destination/
rsync -av /source/dir/ user@remote:/destination/
```

---

## cp: Local Recursive Copy

```bash
# -r: recursive (required for directories)
cp -r /var/log/app/ /backup/app-logs/

# -a: archive mode (recursive + preserves permissions, timestamps, symlinks)
cp -a /etc/nginx/ /backup/nginx-config/

# With verbose output
cp -av /source/ /destination/

# Copy and overwrite without prompting
cp -rf /source/ /destination/

# Preserve timestamps and permissions without full archive
cp -rp /source/ /destination/
```

**`-a` vs `-r`:**
- `-r` — recursive only, may not preserve all attributes
- `-a` = `-dpR` — recursive + preserve everything. Use `-a` for backups.

---

## rsync: More Powerful and Flexible

```bash
# Basic sync (local)
rsync -av /source/dir/ /destination/

# The trailing slash on source matters:
rsync -av /source/dir/   /dest/   # copies CONTENTS of dir into dest
rsync -av /source/dir    /dest/   # copies dir ITSELF into dest (creates dest/dir)
```

Key flags:
- `-a` — archive (recursive, preserve permissions, timestamps, symlinks)
- `-v` — verbose
- `-z` — compress during transfer (useful over network)
- `-P` — show progress + resume partial transfers
- `--delete` — delete files in destination that don't exist in source
- `-n` — dry run (preview without copying)

---

## rsync Over SSH

```bash
# Copy to remote server
rsync -avz /local/path/ user@server:/remote/path/

# Copy from remote server
rsync -avz user@server:/remote/path/ /local/path/

# With SSH options
rsync -avz -e "ssh -p 2222" /local/ user@server:/remote/

# Show progress for large transfers
rsync -avzP /local/ user@server:/remote/
```

---

## Sync Directories (Mirror)

```bash
# Make destination exactly match source (deletes extra files in dest)
rsync -av --delete /source/dir/ /destination/dir/

# Dry run first to see what would be deleted
rsync -avn --delete /source/dir/ /destination/dir/
```

---

## Real Examples

### Backup application directory before upgrade

```bash
cp -a /opt/myapp/ /opt/myapp-backup-$(date +%Y%m%d)/
```

### Sync config files to multiple servers

```bash
for server in web01 web02 web03; do
  rsync -avz /etc/nginx/ $server:/etc/nginx/
  ssh $server "nginx -t && systemctl reload nginx"
done
```

### Copy large files with progress

```bash
rsync -avP /var/backup/large-dump.sql user@remote:/backup/
# Shows:
# large-dump.sql
#     2,345,678,901 100%   45.23MB/s    0:00:49 (xfer#1, to-check=0/1)
```

### Exclude files during copy

```bash
rsync -av --exclude="*.log" --exclude="*.tmp" /source/ /dest/

# Exclude multiple patterns from a file
rsync -av --exclude-from=/tmp/exclude.txt /source/ /dest/
# exclude.txt:
# *.log
# *.tmp
# .git/
```

### Copy preserving hard links

```bash
rsync -aH /source/ /destination/   # -H preserves hard links
```

---

## Common Mistakes

**Mistake 1: Forgetting `-r` with `cp`**
```bash
cp /var/log/app/ /backup/    # ERROR: omitting directory
cp -r /var/log/app/ /backup/ # CORRECT
```

**Mistake 2: rsync trailing slash confusion**
```bash
rsync -av /etc/nginx/  /backup/    # copies nginx/ CONTENTS into /backup/
rsync -av /etc/nginx   /backup/    # creates /backup/nginx/
```

This is the single most common rsync mistake. The trailing slash on the **source** controls whether the directory itself is included.

**Mistake 3: `--delete` without dry run**
`--delete` removes files from destination that aren't in source. Always `--dry-run` first:
```bash
rsync -avn --delete /source/ /dest/   # dry run
rsync -av  --delete /source/ /dest/   # actual sync
```

**Mistake 4: cp not preserving permissions**
```bash
cp -r /etc/nginx/ /backup/    # may not preserve permissions
cp -a /etc/nginx/ /backup/    # preserves everything
```

---

## Quick Reference

```bash
# cp
cp -r  source/ dest/      # recursive
cp -a  source/ dest/      # recursive + preserve all attributes
cp -av source/ dest/      # with verbose

# rsync local
rsync -av  source/  dest/            # sync
rsync -avP source/  dest/            # with progress
rsync -av --delete source/ dest/     # mirror (delete extras)
rsync -avn source/  dest/            # dry run

# rsync remote
rsync -avz source/ user@host:/dest/  # to remote
rsync -avz user@host:/source/ dest/  # from remote
rsync -avzP source/ user@host:/dest/ # with progress
```

---

## Conclusion

Use `cp -a` for local copies where you want to preserve all file attributes. Use `rsync -av` when you need progress reporting, network transfers, or syncing (keeping destination updated without full copy). Always dry-run rsync with `--delete` before running for real.

---

*Related: [Linux Move Files Between Directories](/blog/linux-move-files-between-directories) — moving instead of copying. [How to Extract tar.gz Linux](/blog/how-to-extract-tar-gz-linux) — another common file operation.*
