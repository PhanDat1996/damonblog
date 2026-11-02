---
title: "tar in Linux: Extract and Create tar.gz, tar.xz and tar.zst"
date: "2026-04-22"
updated: "2026-11-02"
excerpt: "Extract and create tar.gz, tar.xz and tar.zst archives in Linux: -C for clean paths, --strip-components, excludes, picking a compressor, and fixing errors."
tags: ["linux", "infrastructure", "troubleshooting", "debugging"]
featured: false
category: "linux"
---

You downloaded a release tarball or got a log bundle from a colleague, and you want the files out, in the right place, without spraying them over your current directory. Or the other way round: you need to ship a directory somewhere (a config backup before a risky change, a log bundle for a support case, a release to another server) as one file, smaller than the original, that unpacks to the same tree.

```bash
# Extract
tar -tf archive.tar.gz | head                 # look first: what folder will it create?
mkdir -p /opt/myapp && tar -xf archive.tar.gz -C /opt/myapp

# Create
tar -czf nginx-backup.tar.gz -C /etc nginx    # gzip: the safe default
tar -tzf nginx-backup.tar.gz | head           # check what went in
```

GNU tar detects gzip, bzip2, xz and zstd automatically when reading from a file, so `tar -xf` works for all of them. The rest of this page covers the parts that bite: path handling, where `--exclude` has to go, which compressor to pick, and what the common error messages mean.

---

## The flags

`tar` options read as a sentence: **action**, **compressor**, **file**.

| Flag | Meaning |
|---|---|
| `-c` | Create an archive |
| `-t` | List an archive's contents |
| `-x` | Extract |
| `-f FILE` | Archive file name; `-f -` means stdout/stdin |
| `-v` | List files as they're processed |
| `-C DIR` | Change to DIR before extracting, or before adding the paths that follow |
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

## Extract by format

| File | Command |
|---|---|
| `.tar.gz`, `.tgz` | `tar -xzf file.tar.gz` or `tar -xf file.tar.gz` |
| `.tar.xz`, `.txz` | `tar -xJf file.tar.xz` or `tar -xf file.tar.xz` |
| `.tar.bz2`, `.tbz2` | `tar -xjf file.tar.bz2` or `tar -xf file.tar.bz2` |
| `.tar.zst` | `tar --zstd -xf file.tar.zst` or `tar -xf file.tar.zst` (GNU tar 1.31+) |
| `.tar` | `tar -xf file.tar` |
| `.zip` | `unzip file.zip -d destdir` |
| `.gz` (one file, not a tar) | `gunzip file.gz` (add `-k` to keep the `.gz`) |
| `.xz` / `.zst` (one file) | `unxz file.xz` / `unzstd file.zst` |

Auto-detection needs to look at the file, so it **doesn't work on a pipe**. When reading from stdin, give the compression flag:

```bash
curl -fsSL https://example.com/app-2.1.0.tar.gz | tar -xzf - -C /opt
```

Without `-z` you'll get `tar: Archive is compressed. Use -z option`. `curl -f` makes curl fail on HTTP errors instead of piping an HTML error page into tar.

### Look before you extract

```bash
tar -tf archive.tar.gz | head -20         # names only
tar -tvf archive.tar.gz | head            # with permissions, owner, size, date
tar -tf archive.tar.gz | cut -d/ -f1 | sort -u   # top-level entries
```

What you're checking:

- **One top-level folder** (`myapp-2.1.0/...`): safe to extract anywhere.
- **Many top-level files** (`./bin`, `./README`, `./lib`): a "tarbomb". Extract into an empty folder with `-C`.
- **Paths starting with `etc/`, `usr/`, `var/`**: a system backup. Extracting it with `-C /` overwrites live files.

---

## Extract to a specific folder with -C

```bash
mkdir -p /tmp/extract
tar -xf archive.tar.gz -C /tmp/extract
```

`-C` changes into the folder before extracting. The folder must exist; tar won't create it (`tar: /tmp/extract: Cannot open: No such file or directory`).

### Dropping the top-level folder: --strip-components

A release unpacks to `myapp-2.1.0/bin/...`, but you want `/opt/myapp/bin/...`:

```bash
tar -tf myapp-2.1.0.tar.gz | head -3
# myapp-2.1.0/
# myapp-2.1.0/bin/
# myapp-2.1.0/bin/myapp

mkdir -p /opt/myapp
tar -xf myapp-2.1.0.tar.gz -C /opt/myapp --strip-components=1
```

`--strip-components=N` removes the first N path parts from every member. If the archive was made with `./` in front (`./myapp-2.1.0/bin`), you need one more.

### Extracting over an existing install

tar overwrites existing files with the same name and leaves other files alone, so files removed in the new version stay behind. For deployments, extracting into a fresh versioned folder and switching a symlink is cleaner:

```bash
mkdir -p /opt/myapp/releases/2.1.0
tar -xf myapp-2.1.0.tar.gz -C /opt/myapp/releases/2.1.0 --strip-components=1
ln -sfn /opt/myapp/releases/2.1.0 /opt/myapp/current
```

Rolling back is then just pointing the symlink at the old release. Use `--keep-old-files` (`-k`) to refuse to overwrite anything, or `--skip-old-files` to silently skip existing files.

---

## Extract only some files

```bash
tar -tf backup.tar.gz | grep nginx.conf
# etc/nginx/nginx.conf

tar -xf backup.tar.gz -C /tmp/restore etc/nginx/nginx.conf
tar -xf backup.tar.gz -C /tmp/restore etc/nginx                     # a whole folder
tar -xf backup.tar.gz -C /tmp/restore --wildcards '*/sites-enabled/*'
```

Give the path **exactly as `tar -t` shows it**, including any `./` prefix. Wildcards need `--wildcards` and quotes.

To read one file without extracting anything:

```bash
tar -xOf backup.tar.gz etc/nginx/nginx.conf | less
```

`-O` writes the file contents to stdout.

### Restoring a config backup safely

Extract to a scratch folder, compare, then copy what you need. Don't extract straight over `/`:

```bash
mkdir -p /tmp/restore
sudo tar -xf nginx-2026-10-28.tar.gz -C /tmp/restore
diff -ru /etc/nginx /tmp/restore/nginx        # or etc/nginx, depending on how it was created
sudo cp -a /tmp/restore/nginx/. /etc/nginx/
sudo nginx -t && sudo systemctl reload nginx
```

---

## Compress files with tar: create an archive

### Paths: what ends up inside the archive

tar stores paths exactly as you give them, except that GNU tar strips a leading `/` (you'll see `Removing leading '/' from member names`).

```bash
tar -czf a.tar.gz /etc/nginx          # members: etc/nginx/nginx.conf ...
tar -czf b.tar.gz -C /etc nginx       # members: nginx/nginx.conf ...
cd /etc/nginx && tar -czf c.tar.gz .  # members: ./nginx.conf ...
```

`-C` is the clean way: the archive contains just `nginx/...`, so whoever extracts it gets one tidy folder wherever they run it. Archiving with `.` gives a tarbomb that spills files into the current directory on extraction; avoid that for anything you send to other people.

### Excluding files: put --exclude first

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

`--exclude-vcs` skips `.git`, `.svn` and similar; `--exclude-caches` skips folders containing a `CACHEDIR.TAG` file. For a list of excludes, put one pattern per line in a file and use `-X excludes.txt`.

### Which compressor?

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

### Compress a single file (no tar needed)

```bash
gzip -k big.log           # big.log.gz, keep original
zstd big.log              # big.log.zst, keeps original by default
xz -k -T0 big.log         # big.log.xz
```

Without `-k`, `gzip` and `xz` delete the original after compressing.

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

---

## Verify before you rely on it

```bash
tar -tzf backup.tar.gz > /dev/null && echo OK     # reads the whole archive
gzip -t backup.tar.gz                              # checks gzip integrity only
tar -dzf backup.tar.gz -C /etc                     # compares the archive to the files on disk
```

A backup you haven't listed or test-extracted is a hope, not a backup. `tar -d` (`--diff`) reports files that changed since the archive was made.

---

## Ownership, permissions and symlinks

- **Extracting as root**, tar restores the owners and permissions stored in the archive. A tarball built on a developer laptop can leave files owned by UID 1000 on your server. Add `--no-same-owner` to make root the owner.
- **Extracting as a normal user**, files are owned by you, and tar applies your umask to permissions unless you add `-p`.
- **tar doesn't follow symlinks by default** when creating: they're stored as links. Add `-h` to store the files they point to instead.

---

## Errors and what they mean

| Error | Cause | Fix |
|---|---|---|
| `gzip: stdin: not in gzip format` | File isn't gzip: often an HTML error page or a plain `.tar` with a `.gz` name | `file archive.tar.gz`; re-download with `curl -fL` |
| `tar: Archive is compressed. Use -z option` | Reading from a pipe without a compression flag | Add `-z`, `-J`, `-j` or `--zstd` |
| `Unexpected EOF in archive` | Truncated download or copy | Re-download; compare size or checksum |
| `Cannot open: No such file or directory` (with `-C`) | Destination folder doesn't exist | `mkdir -p` it first |
| `Cannot open: Permission denied` | No write access to the destination | Extract somewhere you own, or use `sudo` |
| `Cannot change ownership to uid 1000` | Non-root user, or a filesystem that doesn't support owners (some NFS, CIFS) | Harmless for most uses; `--no-same-owner` silences it |
| `Not found in archive` | The path you asked for doesn't match the member name | Copy the exact name from `tar -tf`, including `./` |
| `Removing leading '/' from member names` | You archived an absolute path | Not an error; use `-C` to choose the base folder |
| `No space left on device` | Destination filesystem is full | `df -h` the target; see [Disk Full on Linux](/blog/check-disk-usage-linux-du-df) |

`file` is the fastest way to see what you actually have:

```bash
file archive.tar.gz
# archive.tar.gz: HTML document, ASCII text      <- not an archive at all
```

---

## Safety: untrusted archives, space and deletion

- **Untrusted archives.** GNU tar strips leading `/` from member names and refuses names containing `..` unless you pass `-P`, which blocks the most obvious path tricks. Archives can still contain symlinks, setuid files or simply enormous amounts of data. For anything you didn't create, list it first, extract as a normal user into an empty folder, and never use `-P`.
- **The archive needs room.** On a nearly full disk, write it to another filesystem (`-f /data/backup.tar.gz`) or stream it off the box as shown above. Check with `df -h` first.
- **`--remove-files` deletes the originals** after adding them. Only use it after you've verified a test archive, and never on the only copy. Deleting manually after verifying is safer; see [Delete Large Files Safely](/blog/check-disk-usage-linux-du-df).

---

## FAQ

**How do I extract a tar.gz file to a specific folder?**
`mkdir -p /path/to/dir && tar -xf archive.tar.gz -C /path/to/dir`.

**How do I extract tar.gz without the top-level folder?**
`tar -xf archive.tar.gz -C dest --strip-components=1`.

**How do I see what's in a tar.gz without extracting?**
`tar -tf archive.tar.gz`, or `tar -tvf` for sizes and permissions.

**Can I extract a single file from a tar.gz?**
Yes: `tar -xf archive.tar.gz path/inside/archive`, using the exact path shown by `tar -tf`.

**How do I compress a folder into tar.gz?**
`tar -czf folder.tar.gz -C /path/to/parent folder`. The `-C` keeps the archive paths short and clean.

**What's the difference between tar and gzip?**
`tar` bundles many files and folders into one file and keeps permissions and structure. `gzip` compresses a single stream. `tar -z` does both: bundles, then pipes the result through gzip.

**Is zstd better than gzip?**
For most data, zstd is faster and produces smaller files at its default level. gzip's advantage is that it's available everywhere, including old systems and Windows tools.

*Related: [Move Files Between Directories](/blog/how-to-copy-files-recursively-linux) for putting extracted files where they belong.*
