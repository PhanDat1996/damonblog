---
title: "Extract tar.gz in Linux: Commands, Options and Errors"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Extract tar.gz, tar.xz, tar.zst and zip files in Linux, choose the destination with -C, pull out a single file, and fix not in gzip format errors."
tags: ["linux", "infrastructure", "troubleshooting", "debugging"]
featured: false
category: "linux"
---

You downloaded a release tarball or got a log bundle from a colleague, and you want the files out, in the right place, without spraying them over your current directory.

```bash
tar -tf archive.tar.gz | head                 # look first: what folder will it create?
mkdir -p /opt/myapp && tar -xf archive.tar.gz -C /opt/myapp
```

GNU tar detects gzip, bzip2, xz and zstd automatically when reading from a file, so `tar -xf` works for all of them. The rest of this page covers the options you'll need next and what the common error messages mean.

---

## By format

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

---

## Look before you extract

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

## Choosing the destination with -C

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

Rolling back is then just pointing the symlink at the old release.

Use `--keep-old-files` (`-k`) to refuse to overwrite anything, or `--skip-old-files` to silently skip existing files.

---

## Extracting only some files

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

## Ownership and permissions

- **As root**, tar restores the owners and permissions stored in the archive. A tarball built on a developer laptop can leave files owned by UID 1000 on your server. Add `--no-same-owner` to make root the owner.
- **As a normal user**, files are owned by you, and tar applies your umask to permissions unless you add `-p`.

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
| `No space left on device` | Destination filesystem is full | `df -h` the target; see [Disk Full on Linux](/blog/disk-full-linux-cleanup) |

`file` is the fastest way to see what you actually have:

```bash
file archive.tar.gz
# archive.tar.gz: HTML document, ASCII text      <- not an archive at all
```

---

## A note on untrusted archives

GNU tar strips leading `/` from member names and refuses names containing `..` unless you pass `-P`, which blocks the most obvious path tricks. Archives can still contain symlinks, setuid files or simply enormous amounts of data. For anything you didn't create, list it first, extract as a normal user into an empty folder, and never use `-P`.

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

*Related: [Compress Files in Linux with tar](/blog/compress-files-linux-tar-examples) for creating archives with clean paths. [Move Files Between Directories](/blog/linux-move-files-between-directories) for putting extracted files where they belong.*
