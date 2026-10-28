---
title: "Move Files Between Directories in Linux: mv Done Safely"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Move files and folders in Linux with mv: avoid silent overwrites, merge into an existing folder, move huge trees across disks, and move logs safely."
tags: ["linux", "infrastructure", "troubleshooting", "debugging"]
featured: false
noindex: true
category: "linux"
---

`mv` looks like the simplest command on the system, and on most days it is. The surprises come when the destination already has a file with the same name (overwritten, no warning), when the destination folder already exists (you get a folder inside a folder, or `Directory not empty`), or when the move crosses to another disk and takes an hour instead of a millisecond.

```bash
mv -iv report.csv /srv/archive/           # move, ask before overwriting, show what happened
mv -nv /srv/inbox/*.csv /srv/archive/     # move many, never overwrite
mv -T /srv/app-new /srv/app               # rename a folder, fail instead of nesting
```

---

## What mv actually does

**Same filesystem:** `mv` is a rename. Only the directory entry changes; no data is copied. Moving a 200 GB folder takes a fraction of a second, ownership and timestamps stay as they are, and a process that has a file open keeps writing to it at its new path.

**Different filesystem** (for example `/` to `/data`, or local disk to NFS): `mv` copies everything, then deletes the source. It takes as long as a copy, needs free space for the whole thing on the destination, and if it's interrupted you can end up with a partial copy at the destination and the source still in place.

Check which case you're in:

```bash
df --output=target /srv/inbox /data/archive
# Mounted on
# /
# /data          <- different mount points: mv will copy + delete
```

---

## Overwrites: mv doesn't ask

By default, `mv` replaces an existing file at the destination without asking (unless your shell has an `alias mv='mv -i'`, as root does on RHEL-family systems).

| Option | Effect |
|---|---|
| `-i` | Ask before overwriting |
| `-n` | Never overwrite; skip silently |
| `-b` | Back up the existing file as `name~` first |
| `-u` | Only move if the source is newer than the destination, or the destination is missing |
| `-v` | Print each move |

In scripts, use `-n` (or `--backup=numbered`) and check the result; `-i` would hang waiting for input.

**Preview a wildcard move** before running it: `ls -d /srv/inbox/*.csv` shows exactly what the shell will pass to `mv`.

---

## Moving folders: nesting and "Directory not empty"

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

---

## Moving to a folder that doesn't exist

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

---

## Moving files found with find

```bash
# dry run
find /var/log/app -maxdepth 1 -type f -name '*.log.*' -mtime +7 -print

# move, never overwriting
find /var/log/app -maxdepth 1 -type f -name '*.log.*' -mtime +7 -exec mv -n -t /archive/app/ {} +
```

Watch out for **name collisions**: when `find` searches subfolders, two files called `error.log.1` from different folders both land in `/archive/app/`, and without `-n` the second silently replaces the first. Keep `-maxdepth 1`, use `-n`, or preserve the folder structure with `rsync -a --remove-source-files --files-from=` instead.

How `-mtime +7` counts days is covered in [Find Files Older Than X Days](/blog/linux-find-files-older-than-x-days).

---

## Moving log files that are still being written

```bash
sudo lsof /var/log/app/app.log
```

If a process has the file open:

- **Same filesystem:** after `mv`, the process keeps writing to the **moved** file. Your "archived" log keeps growing, and the original path stays empty until the app reopens its log. This is exactly how logrotate works, followed by a signal or restart so the app reopens the original name.
- **Different filesystem:** `mv` copies the file and deletes the original, but the process still holds the deleted original open. It keeps writing there, the space isn't freed, and those writes never reach your copy. See [Delete Large Files Safely](/blog/how-to-delete-large-files-linux-safely) for how to spot and fix deleted-but-open files.

For live logs, let logrotate handle it, or copy then truncate.

---

## Large moves across disks

`mv` across filesystems gives no progress and can't resume. For big trees use rsync, which can be rerun if interrupted:

```bash
df -h /data                                                     # enough room?
rsync -aHAX --info=progress2 /srv/media/ /data/media/           # copy, rerunnable
rsync -aHAX --dry-run --itemize-changes /srv/media/ /data/media/ | head    # should be empty now
rm -rf -- /srv/media                                            # only after the check above
```

Deleting the source is the irreversible step; do it only after a second rsync pass shows nothing left to transfer. Details on rsync flags and trailing slashes are in [Copy Files Recursively in Linux](/blog/how-to-copy-files-recursively-linux).

---

## Renaming

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

## FAQ

**How do I move a folder in Linux?**
`mv /path/to/folder /new/location/`. If a folder with the same name already exists there, `mv` won't merge them; use rsync as shown above.

**How do I move all files from one directory to another?**
`mv -n /src/* /dest/`. The `*` skips hidden files; to include them in bash, run `shopt -s dotglob` first, or use `rsync -a --remove-source-files /src/ /dest/`.

**Does mv preserve permissions and timestamps?**
On the same filesystem, everything is kept because nothing is copied. Across filesystems, GNU `mv` also tries to preserve owner, permissions and timestamps, but ownership can only be kept when running as root.

**Why does mv take so long?**
The destination is on a different filesystem, so `mv` is copying all the data. Use rsync with progress for large moves.
