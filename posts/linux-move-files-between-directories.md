---
title: "Linux Move Files Between Directories: mv and rsync Examples"
date: "2026-04-22"
excerpt: "Move files between directories in Linux using mv and rsync — handle cross-filesystem moves, rename files, move with wildcards, and avoid common mistakes."
tags: ["linux", "infrastructure", "troubleshooting", "debugging"]
featured: false
slug: "linux-move-files-between-directories"
---

`mv` moves files. It's instant on the same filesystem (just renames the inode). Across filesystems, it copies then deletes. Here's everything you need.

---

## TL;DR

```bash
mv file.txt /destination/           # move a file
mv dir/ /destination/               # move a directory
mv file.txt newname.txt             # rename a file
mv -i file.txt /dest/               # prompt before overwrite
```

---

## mv: Basic Usage

```bash
# Move file to directory
mv /var/log/app/debug.log /archive/

# Move file and rename it
mv /var/log/app/debug.log /archive/debug-2026-04-22.log

# Move directory (entire tree)
mv /opt/myapp-old/ /opt/myapp-backup/

# Move multiple files to a directory
mv file1.log file2.log file3.log /archive/

# Move all .log files
mv /var/log/app/*.log /archive/

# Move with verbose output
mv -v /source/* /dest/
```

---

## Rename Files

```bash
# Rename a file
mv oldname.txt newname.txt

# Rename a directory
mv old-dir/ new-dir/

# Rename with timestamp
mv app.log app-$(date +%Y%m%d).log
```

---

## Safe Move Options

```bash
# -i: interactive (prompt before overwriting)
mv -i file.txt /dest/

# -n: no-clobber (never overwrite)
mv -n file.txt /dest/

# -b: backup existing file before overwriting
mv -b file.txt /dest/
# Creates /dest/file.txt~ if /dest/file.txt existed
```

---

## Cross-Filesystem Move

When source and destination are on different filesystems (`mv` becomes copy + delete):

```bash
# Check if different filesystems
df /source/path /dest/path

# If different filesystem and files are large, use rsync for progress/resume
rsync -avP --remove-source-files /source/largefile.tar.gz /dest/
```

`--remove-source-files` in rsync deletes source files after successful transfer — effectively a move with progress.

---

## Real Examples

### Move old logs to archive

```bash
# Move last month's logs
mv /var/log/app/app-202603*.log /archive/logs/

# Verify
ls /archive/logs/ | head
ls /var/log/app/
```

### Move application to new path

```bash
# Stop service first
systemctl stop myapp

# Move
mv /opt/myapp-v1/ /opt/myapp-v1-old/
mv /opt/myapp-v2/ /opt/myapp/

# Update config if paths are hardcoded
grep -r "/opt/myapp-v2" /etc/myapp/
# Then fix any references

# Start
systemctl start myapp
```

### Move and rename in one step

```bash
# Rename while moving to different directory
mv /tmp/downloaded-app.tar.gz /opt/archives/myapp-v2.0.tar.gz
```

### Move files matching a pattern

```bash
# Move all files modified today
find /var/log/app -name "*.log" -mtime -1 -exec mv {} /archive/ \;

# Move files over 100MB
find /var/log -size +100M -exec mv {} /archive/large-logs/ \;
```

---

## Avoid Common Mistakes

**Mistake 1: `mv dir/ /existing-dir/` creates a subdirectory**
```bash
ls /dest/
# (empty)

mv /source/mydir/ /dest/
# Result: /dest/mydir/   ← directory moved inside dest

# To merge into existing directory, use rsync:
rsync -av --remove-source-files /source/mydir/ /dest/
rm -rf /source/mydir/
```

**Mistake 2: Moving to a path that doesn't exist**
```bash
mv /source/file.txt /nonexistent/path/
# Renames file to "path" in /nonexistent/ — which also doesn't exist → error

# Fix: create destination first
mkdir -p /nonexistent/path/
mv /source/file.txt /nonexistent/path/
```

**Mistake 3: `mv *` in wrong directory**
`mv *.log /archive/` from wrong directory moves unexpected files. Always check with `ls *.log` first.

**Mistake 4: Overwriting without backup**
```bash
# Risky: overwrites destination if it exists
mv config.yml /etc/app/config.yml

# Safer: backup first
cp /etc/app/config.yml /etc/app/config.yml.bak
mv config.yml /etc/app/config.yml
```

---

## Quick Reference

```bash
mv file /dest/              # move file
mv file newname             # rename file
mv dir/ /dest/              # move directory
mv *.log /archive/          # move with wildcard
mv -i file /dest/           # prompt before overwrite
mv -n file /dest/           # never overwrite
mv -v source dest           # verbose

# Cross-filesystem with progress
rsync -avP --remove-source-files /source/ /dest/
```

---

## Conclusion

`mv` is instant on the same filesystem (inode rename). Across filesystems it copies then deletes — for large files, use `rsync -P --remove-source-files` to get progress and resumability. Always back up before `mv` overwrites important files. Use `-n` to prevent accidental overwrites in scripts.

---

*Related: [How to Copy Files Recursively Linux](/blog/how-to-copy-files-recursively-linux) — copy instead of move. [Linux Find Files Older Than X Days](/blog/linux-find-files-older-than-x-days) — find files to move with find -mtime.*
