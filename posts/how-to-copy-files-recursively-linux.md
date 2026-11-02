---
title: "Copy and Move Files in Linux: cp -a, rsync and mv Safely"
date: "2026-04-22"
updated: "2026-11-02"
excerpt: "Copy folders recursively with cp -a or rsync and move files with mv: avoid nested folders and silent overwrites, merge trees, move across disks safely."
tags: ["linux", "infrastructure", "troubleshooting", "debugging"]
featured: false
category: "linux"
---

You copy `/etc/nginx` to a backup folder, run it again the next day, and now there's a `nginx/nginx/` inside your backup. Or you copy an app to a new disk and it won't start because every file is now owned by root. Or `mv` silently overwrites a file with the same name, or a "quick" move to another disk takes an hour. Copies and moves are simple until the details of paths, attributes and filesystems catch you.

```bash
cp -a /srv/app /backup/app-$(date +%F)       # local copy, keeps owners, modes, times, links
rsync -a /srv/app/ /backup/app/              # same, but re-runnable: only copies changes
mv -iv report.csv /srv/archive/              # move, ask before overwriting, show what happened
mv -nv /srv/inbox/*.csv /srv/archive/        # move many, never overwrite
mv -T /srv/app-new /srv/app                  # rename a folder, fail instead of nesting
```

Use `cp -a` for a one-off local copy. Use `rsync` for anything you'll repeat, anything large, and anything going to another machine. Use `mv` when you want the source gone, and know whether the move stays on one filesystem.

---

## Copy files recursively: cp -r vs -a

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

A trailing slash on the source (`/etc/nginx/`) makes no difference to `cp`. It does to `rsync`. `mv` has the same nesting behavior; see *Moving folders* below.

### "cp -f" still asks to overwrite

On RHEL, CentOS and Fedora, root's shell has `alias cp='cp -i'` (and `alias mv='mv -i'`). The alias's `-i` wins over your `-f`, so `cp -rf` still prompts for every file. Bypass the alias for one command with `\cp -a ...` or `command cp -a ...`.

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

### Copying to and from another server

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

### Mirroring with --delete: dry run first

`--delete` makes the destination match the source exactly, removing files that only exist on the destination. Point it at the wrong folder and it deletes everything that isn't in the source.

```bash
rsync -a --delete --dry-run --itemize-changes /srv/app/ /backup/app/ | grep '^\*deleting' | head
rsync -a --delete /srv/app/ /backup/app/
```

`--dry-run` (`-n`) lists what would happen without changing anything. Check two things in the output: the deletions are what you expect, and the paths show the source was read correctly (a missing trailing slash on the source means rsync would create `/backup/app/app/` and delete everything else in `/backup/app/`).

### Excluding files

```bash
rsync -a --exclude='*.log' --exclude='node_modules/' --exclude='.git/' /srv/app/ /backup/app/
rsync -a --exclude-from=/etc/backup-excludes.txt /srv/app/ /backup/app/
```

Patterns are relative to the source folder. A trailing `/` in a pattern matches only folders. A leading `/` anchors it to the top of the transfer: `--exclude='/cache/'` skips `app/cache` but not `app/lib/cache`.

`cp` has no exclude option. If you need one locally, use rsync.

---

## Move files between directories with mv

### What mv actually does

**Same filesystem:** `mv` is a rename. Only the directory entry changes; no data is copied. Moving a 200 GB folder takes a fraction of a second, ownership and timestamps stay as they are, and a process that has a file open keeps writing to it at its new path.

**Different filesystem** (for example `/` to `/data`, or local disk to NFS): `mv` copies everything, then deletes the source. It takes as long as a copy, needs free space for the whole thing on the destination, and if it's interrupted you can end up with a partial copy at the destination and the source still in place.

Check which case you're in:

```bash
df --output=target /srv/inbox /data/archive
# Mounted on
# /
# /data          <- different mount points: mv will copy + delete
```

### Overwrites: mv doesn't ask

By default, `mv` replaces an existing file at the destination without asking (unless your shell has the `mv -i` alias mentioned above).

| Option | Effect |
|---|---|
| `-i` | Ask before overwriting |
| `-n` | Never overwrite; skip silently |
| `-b` | Back up the existing file as `name~` first |
| `-u` | Only move if the source is newer than the destination, or the destination is missing |
| `-v` | Print each move |

In scripts, use `-n` (or `--backup=numbered`) and check the result; `-i` would hang waiting for input.

**Preview a wildcard move** before running it: `ls -d /srv/inbox/*.csv` shows exactly what the shell will pass to `mv`.

### Moving folders: nesting and "Directory not empty"

```bash
mv /srv/app-new /srv/app
```

- `/srv/app` doesn't exist: `app-new` is renamed to `app`. What you wanted.
- `/srv/app` exists: `app-new` is moved **inside** it as `/srv/app/app-new`. Probably not what you wanted.
- `/srv/app/app-new` already exists and isn't empty: `mv: cannot move ... Directory not empty`.

`-T` (`--no-target-directory`) removes the ambiguity: it always means "rename to exactly this path" and errors if that's not possible.

### Merging into an existing folder

`mv` can't merge two trees. Use rsync, then remove the source only after checking:

```bash
rsync -a --dry-run --itemize-changes /srv/incoming/ /srv/shared/ | head     # preview
rsync -a --remove-source-files /srv/incoming/ /srv/shared/
find /srv/incoming -mindepth 1 -type d -empty -delete                      # remove the now-empty folders
```

`--remove-source-files` deletes each source file after it's transferred, but leaves the folders behind. Removing only **empty** folders afterward, instead of `rm -rf /srv/incoming`, means anything that failed to transfer is still there. Note that rsync overwrites files that already exist in the destination; add `--ignore-existing` if it shouldn't.

### Moving to a folder that doesn't exist

```bash
mv report.csv /srv/archive/2026/
# mv: cannot move 'report.csv' to '/srv/archive/2026/': Not a directory  (or: No such file or directory)

mv report.csv /srv/archive/2026
# if /srv/archive exists but 2026 doesn't: the file is renamed to a FILE called "2026"
```

A trailing slash on the destination makes `mv` insist it's a folder. Create it first:

```bash
mkdir -p /srv/archive/2026 && mv report.csv /srv/archive/2026/
```

`mv -t /srv/archive/2026 file1 file2` (target first) is another way to make the destination unambiguous, and it's what you want with `find` and `xargs`.

### Moving files found with find

```bash
# dry run
find /var/log/app -maxdepth 1 -type f -name '*.log.*' -mtime +7 -print

# move, never overwriting
find /var/log/app -maxdepth 1 -type f -name '*.log.*' -mtime +7 -exec mv -n -t /archive/app/ {} +
```

Watch out for **name collisions**: when `find` searches subfolders, two files called `error.log.1` from different folders both land in `/archive/app/`, and without `-n` the second silently replaces the first. Keep `-maxdepth 1`, use `-n`, or preserve the folder structure with `rsync -a --remove-source-files --files-from=` instead.

How `-mtime +7` counts days is covered in [Find Files Older Than X Days](/blog/linux-find-file-by-name-and-size).

### Moving log files that are still being written

```bash
sudo lsof /var/log/app/app.log
```

If a process has the file open:

- **Same filesystem:** after `mv`, the process keeps writing to the **moved** file. Your "archived" log keeps growing, and the original path stays empty until the app reopens its log. This is exactly how logrotate works, followed by a signal or restart so the app reopens the original name.
- **Different filesystem:** `mv` copies the file and deletes the original, but the process still holds the deleted original open. It keeps writing there, the space isn't freed, and those writes never reach your copy. See [Delete Large Files Safely](/blog/check-disk-usage-linux-du-df) for how to spot and fix deleted-but-open files.

For live logs, let logrotate handle it, or copy then truncate.

### Renaming

`mv` renames one file at a time:

```bash
mv app.log app-$(date +%F).log
```

For renaming many files by pattern, a loop is portable:

```bash
for f in *.jpeg; do mv -n -- "$f" "${f%.jpeg}.jpg"; done
```

Quote `"$f"` so names with spaces work, and use `--` so a file named `-r` isn't read as an option. The `rename` command can do this in one line, but there are two incompatible versions (Perl `rename` on Debian/Ubuntu, util-linux `rename` on RHEL) with different syntax.

---

## Large copies and moves across disks

`mv` across filesystems gives no progress and can't resume. For big trees use rsync, which can be rerun if interrupted:

```bash
df -h /data                                                     # enough room?
rsync -aHAX --info=progress2 /srv/media/ /data/media/           # copy, rerunnable
rsync -aHAX --dry-run --itemize-changes /srv/media/ /data/media/ | head    # should be empty now
rm -rf -- /srv/media                                            # only after the check above
```

Deleting the source is the irreversible step; do it only after a second rsync pass shows nothing left to transfer.

Before you start any big copy or move:

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

**Why did cp (or mv) create a folder inside my destination folder?**
The destination already existed, so the source went into it. Use `cp -aT src dest` or `cp -a src/. dest/`; for `mv`, use `mv -T`.

**Is rsync faster than cp?**
For a first copy to an empty local folder, about the same. For repeat copies, much faster, because rsync skips files that haven't changed.

**How do I move a folder in Linux?**
`mv /path/to/folder /new/location/`. If a folder with the same name already exists there, `mv` won't merge them; use rsync as shown above.

**How do I move all files from one directory to another?**
`mv -n /src/* /dest/`. The `*` skips hidden files; to include them in bash, run `shopt -s dotglob` first, or use `rsync -a --remove-source-files /src/ /dest/`.

**Does mv preserve permissions and timestamps?**
On the same filesystem, everything is kept because nothing is copied. Across filesystems, GNU `mv` also tries to preserve owner, permissions and timestamps, but ownership can only be kept when running as root.

**Why does mv take so long?**
The destination is on a different filesystem, so `mv` is copying all the data. Use rsync with progress for large moves.

*Related: [Compress Files with tar](/blog/how-to-extract-tar-gz-linux) to ship a folder as one file.*
