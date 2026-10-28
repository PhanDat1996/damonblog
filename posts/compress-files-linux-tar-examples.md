---
title: "Compress Files in Linux with tar: gzip, xz and zstd Examples"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Create tar.gz, tar.xz and tar.zst archives in Linux, keep clean paths with -C, exclude folders correctly, and pick compression by speed versus size."
tags: ["linux", "infrastructure", "troubleshooting", "debugging"]
featured: false
category: "linux"
---

You need to ship a directory somewhere: a config backup before a risky change, a log bundle for a support case, a release to another server. One file, smaller than the original, that unpacks to the same tree.

```bash
tar -czf nginx-backup.tar.gz -C /etc nginx      # gzip: the safe default
tar -tzf nginx-backup.tar.gz | head             # check what went in
```

That's most of it. The rest of this page covers the parts that bite: path handling, where `--exclude` has to go, and which compressor to pick.

---

## The flags

`tar` options read as a sentence: **action**, **compressor**, **file**.

| Flag | Meaning |
|---|---|
| `-c` | Create an archive |
| `-t` | List an archive's contents |
| `-x` | Extract (see [Extract tar.gz in Linux](/blog/how-to-extract-tar-gz-linux)) |
| `-f FILE` | Archive file name; `-f -` means stdout/stdin |
| `-v` | List files as they're processed |
| `-C DIR` | Change to DIR before adding the paths that follow |
| `-z` | gzip (`.tar.gz`, `.tgz`) |
| `-j` | bzip2 (`.tar.bz2`) |
| `-J` | xz (`.tar.xz`) |
| `--zstd` | zstd (`.tar.zst`), GNU tar 1.31+ |
| `-a` | Pick the compressor from the file extension |

**`-f` takes the next word as the file name**, so it must be last in a group of short options:

```bash
tar -czvf backup.tar.gz dir/   # right
tar -czfv backup.tar.gz dir/   # WRONG: creates an archive named "v" containing backup.tar.gz and dir/
```

---

## Paths: what ends up inside the archive

tar stores paths exactly as you give them, except that GNU tar strips a leading `/` (you'll see `Removing leading '/' from member names`).

```bash
tar -czf a.tar.gz /etc/nginx          # members: etc/nginx/nginx.conf ...
tar -czf b.tar.gz -C /etc nginx       # members: nginx/nginx.conf ...
cd /etc/nginx && tar -czf c.tar.gz .  # members: ./nginx.conf ...
```

`-C` is the clean way: the archive contains just `nginx/...`, so whoever extracts it gets one tidy folder wherever they run it. Archiving with `.` gives a "tarbomb" that spills files into the current directory on extraction; avoid that for anything you send to other people.

---

## Excluding files: put `--exclude` first

```bash
tar -czf www.tar.gz --exclude='html/uploads' --exclude='*.log' -C /var/www html
```

Two rules:

- **Exclude options go before the paths.** Since GNU tar 1.29 they only apply to paths that come after them; put them at the end and tar warns that they had no effect.
- **Patterns match the member names**, so with `-C /var/www html`, write `html/uploads`, not `/var/www/html/uploads`.

Handy built-ins:

```bash
tar -czf src.tar.gz --exclude-vcs --exclude-caches -C ~/projects myapp
```

`--exclude-vcs` skips `.git`, `.svn` and similar; `--exclude-caches` skips folders containing a `CACHEDIR.TAG` file.

For a list of excludes, put one pattern per line in a file and use `-X excludes.txt`.

---

## Which compressor?

| Format | Flag | Speed | Size | Use it when |
|---|---|---|---|---|
| gzip | `-z` | Fast | Good | Default. Every system can open it. |
| zstd | `--zstd` | Very fast | Better than gzip | Both ends are recent Linux; big backups where time matters |
| xz | `-J` | Slow | Smallest | Distributing a release once, downloading many times |
| bzip2 | `-j` | Slow | Between gzip and xz | Only for compatibility with something that expects it |
| none | (none) | Fastest | Same as input | Content is already compressed (JPEG, video, `.gz` files) |

Text and logs compress very well with any of them; already-compressed data barely shrinks, so don't spend CPU on it. Results vary a lot with the data, so if size or time really matters, test on a sample of your own files.

Using all CPU cores:

```bash
tar -cf - -C /var/lib mysql-dump | pigz > dump.tar.gz            # parallel gzip (install pigz)
tar -I 'zstd -T0 -10' -cf backup.tar.zst -C /srv data            # zstd, all cores, level 10
tar -I 'xz -T0' -cf release.tar.xz -C build myapp                # xz, all cores
```

`-I` (`--use-compress-program`) lets you pass options to the compressor. The output is a normal `.tar.gz` / `.tar.zst` / `.tar.xz` that the usual flags can extract.

---

## Everyday recipes

### Back up a config folder before changing it

```bash
sudo tar -czf ~/nginx-$(date +%F-%H%M).tar.gz -C /etc nginx
```

Run tar as root for system files, otherwise unreadable files are skipped with `Permission denied` and the backup is silently incomplete. Root also stores numeric owners and permissions so a restore puts them back.

### Bundle logs for a support case

```bash
sudo tar -czf /tmp/app-logs-$(hostname)-$(date +%F).tar.gz \
  -C /var/log --newer-mtime='3 days ago' app nginx
```

`--newer-mtime` only includes files modified after that date, which keeps the bundle small. tar may warn `file changed as we read it` for logs being written; the archive is still usable, but the last lines of that file may be cut off.

### Archive and send without a temp file

```bash
tar -czf - -C /srv data | ssh backup@host 'cat > /backups/data-$(date +%F).tar.gz'
```

Useful when the local disk has no room for the archive. For repeated syncs, `rsync` is the better tool; see [Copy Files Recursively in Linux](/blog/how-to-copy-files-recursively-linux).

### Split a large archive

```bash
tar -czf - -C /srv data | split -b 2G -d - data.tar.gz.part-
cat data.tar.gz.part-* | tar -xzf -        # reassemble and extract
```

### Compress a single file (no tar needed)

```bash
gzip -k big.log           # big.log.gz, keep original
zstd big.log              # big.log.zst, keeps original by default
xz -k -T0 big.log         # big.log.xz
```

Without `-k`, `gzip` and `xz` delete the original after compressing.

---

## Verify before you rely on it

```bash
tar -tzf backup.tar.gz > /dev/null && echo OK     # reads the whole archive
gzip -t backup.tar.gz                              # checks gzip integrity only
tar -dzf backup.tar.gz -C /etc                     # compares the archive to the files on disk
```

A backup you haven't listed or test-extracted is a hope, not a backup. `tar -d` (`--diff`) reports files that changed since the archive was made.

---

## Space and deletion gotchas

- **The archive needs room.** On a nearly full disk, write it to another filesystem (`-f /data/backup.tar.gz`) or stream it off the box as shown above. Check with `df -h` first.
- **`--remove-files` deletes the originals** after adding them. Only use it after you've verified a test archive, and never on the only copy. Deleting manually after verifying is safer; see [Delete Large Files Safely](/blog/how-to-delete-large-files-linux-safely).
- **tar doesn't follow symlinks by default**: they're stored as links. Add `-h` to store the files they point to instead.

---

## FAQ

**How do I compress a folder into tar.gz?**
`tar -czf folder.tar.gz -C /path/to/parent folder`. The `-C` keeps the archive paths short and clean.

**What's the difference between tar and gzip?**
`tar` bundles many files and folders into one file and keeps permissions and structure. `gzip` compresses a single stream. `tar -z` does both: bundles, then pipes the result through gzip.

**Is zstd better than gzip?**
For most data, zstd is faster and produces smaller files at its default level. gzip's advantage is that it's available everywhere, including old systems and Windows tools.

**Why does tar say "Removing leading '/' from member names"?**
It's protecting you: archives with absolute paths would overwrite system files wherever they're extracted. Use `-C` to choose the base folder and the message goes away.
