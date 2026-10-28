---
title: "Copy Files Recursively in Linux: cp -a vs rsync, Slashes"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Copy a directory recursively in Linux with cp -a or rsync, keep owners and timestamps, avoid the nested-folder surprise, and dry-run before --delete."
tags: ["linux", "infrastructure", "troubleshooting", "debugging"]
featured: false
noindex: true
category: "linux"
---

You copy `/etc/nginx` to a backup folder, run it again the next day, and now there's a `nginx/nginx/` inside your backup. Or you copy an app to a new disk and it won't start because every file is now owned by root. Recursive copies are simple until the details of paths and attributes catch you.

```bash
cp -a /srv/app /backup/app-$(date +%F)       # local copy, keeps owners, modes, times, links
rsync -a /srv/app/ /backup/app/              # same, but re-runnable: only copies changes
```

Use `cp -a` for a one-off local copy. Use `rsync` for anything you'll repeat, anything large, and anything going to another machine.

---

## cp: -r vs -a

| Option | Copies folders | Owner, mode, timestamps | Symlinks | Hard links, ACLs, xattrs, SELinux labels |
|---|---|---|---|---|
| `cp -r` | yes | mode only (minus umask); owner becomes you; times become now | copied as links (GNU) | no |
| `cp -rp` | yes | yes | copied as links | no |
| `cp -a` | yes | yes | copied as links | yes (`--preserve=all`) |

`cp -a` is the right default for backups, migrations and anything you might restore. With plain `-r`, every file gets the current time as its modification time, which breaks anything that relies on timestamps (make, backups, `find -mtime` cleanup). Preserving owners requires running as root; as a normal user, copied files are owned by you no matter what.

### The nested-folder surprise

`cp`'s behavior depends on whether the **destination already exists**, not on slashes:

```bash
cp -a /etc/nginx /backup/nginx
# 1st run: /backup/nginx doesn't exist -> creates /backup/nginx/nginx.conf
# 2nd run: /backup/nginx exists       -> creates /backup/nginx/nginx/nginx.conf
```

To make it predictable:

```bash
cp -aT /etc/nginx /backup/nginx      # -T: treat destination as the target, never nest
cp -a /etc/nginx/. /backup/nginx/    # copy the contents of nginx into backup/nginx
```

A trailing slash on the source (`/etc/nginx/`) makes no difference to `cp`. It does to `rsync`.

### "cp -f" still asks to overwrite

On RHEL, CentOS and Fedora, root's shell has `alias cp='cp -i'`. The alias's `-i` wins over your `-f`, so `cp -rf` still prompts for every file. Bypass the alias for one command with `\cp -a ...` or `command cp -a ...`.

---

## rsync: the trailing slash rule

```bash
rsync -a /etc/nginx  /backup/    # creates /backup/nginx/...
rsync -a /etc/nginx/ /backup/    # puts the CONTENTS in /backup/ (nginx.conf lands in /backup/nginx.conf)
```

```
source      meaning                       result in /backup/
/etc/nginx  "the folder nginx"            /backup/nginx/nginx.conf
/etc/nginx/ "what's inside nginx"         /backup/nginx.conf
```

Only the **source** slash matters; the destination slash doesn't. A safe habit is to name the destination folder explicitly and use a slash on both: `rsync -a /etc/nginx/ /backup/nginx/`. The result is the same whether or not `/backup/nginx` exists, which `cp` can't promise.

### What -a does and doesn't keep

`-a` = recursive, plus symlinks, permissions, modification times, group, owner (when root) and device files. It does **not** include:

| Flag | Adds |
|---|---|
| `-H` | Hard links (otherwise each link becomes a separate full copy) |
| `-A` | ACLs |
| `-X` | Extended attributes, including SELinux labels |
| `--numeric-ids` | Keep UID/GID numbers instead of mapping by name (important for backups between hosts with different users) |

For a faithful copy of a system folder: `rsync -aHAX --numeric-ids`.

Re-running rsync only transfers files whose size or modification time changed, which is why it's the right tool for anything you repeat or that might get interrupted.

---

## Copying to and from another server

```bash
rsync -az /srv/app/ deploy@web01:/srv/app/              # push
rsync -az deploy@web01:/var/log/app/ ./web01-logs/       # pull
rsync -az -e 'ssh -p 2222 -i ~/.ssh/deploy' /srv/app/ deploy@web01:/srv/app/
```

`-z` compresses in transit. It helps on slow links with compressible data, and wastes CPU on a fast LAN or for already-compressed files.

Progress and resume for big files:

```bash
rsync -aP /backups/db-2026-10-28.sql.gz backup@vault:/backups/
```

```
db-2026-10-28.sql.gz
  1,342,177,280  57%   48.31MB/s    0:00:20
```

`-P` = `--progress --partial`: if the connection drops, rerunning picks up from the partial file instead of starting over. For many files, `--info=progress2` shows one overall progress line instead of one per file.

`scp -r` works for quick copies but can't resume, doesn't skip unchanged files, and expands sparse files to full size.

---

## Mirroring with --delete: dry run first

`--delete` makes the destination match the source exactly, removing files that only exist on the destination. Point it at the wrong folder and it deletes everything that isn't in the source.

```bash
rsync -a --delete --dry-run --itemize-changes /srv/app/ /backup/app/ | grep '^\*deleting' | head
rsync -a --delete /srv/app/ /backup/app/
```

`--dry-run` (`-n`) lists what would happen without changing anything. Check two things in the output: the deletions are what you expect, and the paths show the source was read correctly (a missing trailing slash on the source means rsync would create `/backup/app/app/` and delete everything else in `/backup/app/`).

---

## Excluding files

```bash
rsync -a --exclude='*.log' --exclude='node_modules/' --exclude='.git/' /srv/app/ /backup/app/
rsync -a --exclude-from=/etc/backup-excludes.txt /srv/app/ /backup/app/
```

Patterns are relative to the source folder. A trailing `/` in a pattern matches only folders. A leading `/` anchors it to the top of the transfer: `--exclude='/cache/'` skips `app/cache` but not `app/lib/cache`.

`cp` has no exclude option. If you need one locally, use rsync.

---

## Before you start a big copy

- **Space:** `du -sh /srv/app` against `df -h /backup`. See [Check Disk Usage in Linux](/blog/check-disk-usage-linux-du-df).
- **Live data:** copying a running database's data folder gives an inconsistent copy. Use the database's own dump or snapshot tool, or stop it first.
- **Permissions:** run as root (or with `sudo`) if you need owners preserved and all files readable; otherwise unreadable files are skipped with `Permission denied`. See [Permission Denied on Linux](/blog/permission-denied-linux-fix-chmod-chown).
- **I/O impact:** a large copy can saturate the disk on a busy server. `ionice -c3 rsync ...` or `rsync --bwlimit=50M` keeps it polite.

---

## FAQ

**How do I copy a directory and all its contents in Linux?**
`cp -a source_dir dest_dir`. Use `-a` rather than `-r` so owners, permissions and timestamps are kept.

**What's the difference between cp -r and cp -a?**
`-r` copies the tree but resets ownership and timestamps. `-a` also preserves owners, modes, timestamps, symlinks, hard links and extended attributes.

**Why did cp create a folder inside my destination folder?**
The destination already existed, so `cp` copied the source into it. Use `cp -aT src dest` or `cp -a src/. dest/`.

**Is rsync faster than cp?**
For a first copy to an empty local folder, about the same. For repeat copies, much faster, because rsync skips files that haven't changed.

*Related: [Move Files Between Directories](/blog/linux-move-files-between-directories) when you want the source gone afterward. [Compress Files with tar](/blog/compress-files-linux-tar-examples) to ship a folder as one file.*
