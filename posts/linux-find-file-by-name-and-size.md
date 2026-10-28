---
title: "Linux find by Name and Size: Patterns That Match Right"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Find files by name and size with Linux find: quote your patterns, group -o with parentheses, skip folders with -prune and avoid the -size rounding trap."
tags: ["linux", "troubleshooting", "debugging", "infrastructure"]
featured: false
category: "linux"
---

You need "every `.log` file under `/var` bigger than 50 MB", or "where is that `config.yml` on this box". `find` does both in one command, but it has a few rules that quietly give you wrong results: unquoted patterns, `-o` without parentheses, and size rounding. Get those right and the rest is easy.

```bash
find /var -type f -name '*.log' -size +50M                    # name AND size
find / -xdev -type f -iname 'config.yml' 2>/dev/null          # by name, case-insensitive
find /var/log -type f \( -name '*.log' -o -name '*.gz' \) -size +10M   # either name, plus size
```

---

## Matching by name

| Test | Matches against | Example |
|---|---|---|
| `-name 'pat'` | The file name only (last path part), case-sensitive glob | `-name '*.conf'` |
| `-iname 'pat'` | Same, case-insensitive | `-iname 'readme*'` |
| `-path 'pat'` | The whole path as find prints it | `-path '*/nginx/*.conf'` |
| `-regex 'pat'` | The whole path, as a regular expression | `-regex '.*/app-[0-9]+\.log'` |

### Always quote the pattern

```bash
find /var/log -name *.log      # WRONG
find /var/log -name '*.log'    # right
```

Without quotes, the shell expands `*.log` **before** `find` runs, using files in your current directory. If your current directory has one `.log` file, `find` searches for that exact name. If it has two, you get `find: paths must precede expression`. If it has none, it happens to work, which is why this bug survives in scripts.

### -name doesn't see slashes

`-name` only looks at the last part of the path, so `-name 'nginx/*.conf'` never matches anything. Use `-path`:

```bash
find /etc -path '*/nginx/*' -name '*.conf'
```

### -regex matches the whole path

```bash
find /var/log -regextype posix-extended -regex '.*/app-[0-9]{4}-[0-9]{2}-[0-9]{2}\.log'
```

The expression must match the full path, so start with `.*/`. GNU find's default regex flavor is Emacs-style, where `{4}` intervals and `|` alternation need backslashes; `-regextype posix-extended` gives you the syntax you know from `grep -E`.

---

## Matching by size

| Suffix | Unit |
|---|---|
| `c` | bytes |
| `k` | KiB (1024 bytes) |
| `M` | MiB (1024 KiB) |
| `G` | GiB |
| none | 512-byte blocks |

`+N` means larger than, `-N` smaller than, plain `N` "exactly" (after rounding).

**The rounding trap:** find rounds each file's size **up** to the unit before comparing.

```bash
find /tmp -type f -size -1k      # matches only EMPTY files (1 byte rounds up to 1k)
find /tmp -type f -size -1024c   # files smaller than 1 KiB, what you meant
find /tmp -type f -empty         # if empty files are what you want, say so
```

`-size 512k` means "rounds up to 512 KiB", i.e. anything from just over 511 KiB to 512 KiB, not exactly 524288 bytes. For an exact byte size use `-size 524288c`.

A range:

```bash
find /var -xdev -type f -size +10M -size -100M
```

For a sorted "biggest files first" list, see [Find Large Files on Linux](/blog/find-large-files-linux).

---

## Combining tests: AND, OR, NOT

Tests next to each other are joined with AND. `-o` is OR, `!` (or `-not`) is NOT. AND binds tighter than OR, which is the source of a classic bug:

```bash
# WRONG: -type f and -size only apply to *.gz
find / -name core -o -name '*.gz' -type f -size +100M

# right: group the OR with escaped parentheses
find / -xdev -type f \( -name core -o -name '*.gz' \) -size +100M
```

The parentheses need a backslash (or quotes) so the shell passes them to `find`, and spaces around them.

NOT examples:

```bash
find /var/log -type f -name '*.log' ! -name '*debug*'      # .log files except debug ones
find /opt/app -type f ! -user app                          # files not owned by app
```

---

## Skipping folders: -xdev and -prune

Searching `/` walks `/proc`, `/sys`, network mounts and container layers unless you stop it.

```bash
find / -xdev -type f -name 'config.yml' 2>/dev/null
```

`-xdev` stays on the starting filesystem. To skip specific folders inside it, use `-prune`, which stops find from descending at all (unlike `! -path`, which still walks the whole tree and only hides the results):

```bash
find /srv \( -path /srv/backups -o -name node_modules -o -name .git \) -prune \
     -o -type f -name '*.yml' -print
```

Read it as: "if it's one of these folders, prune it; **otherwise** if it's a `.yml` file, print it". The explicit `-print` at the end matters; without it, find also prints the pruned folder names.

---

## Doing something with the results

```bash
find /var/log -type f -name '*.log' -size +100M -ls                  # details (size in bytes, 7th column)
find /var/log -type f -name '*.log' -size +100M -exec ls -lh {} +    # human-readable sizes
find /etc -type f -name '*.conf' -exec grep -l 'listen 443' {} +      # which configs contain a string
```

`-exec cmd {} +` runs the command once with many files; `-exec cmd {} \;` runs it once per file, much slower on big result sets. If you pipe to `xargs`, use `-print0 | xargs -0` so names with spaces don't break:

```bash
find /var/log -type f -name '*.log' -mtime +7 -print0 | xargs -0 gzip
```

For searching **inside** files, `grep -rl 'pattern' /etc` is usually simpler; see [Search Text in Files with grep](/blog/search-text-in-files-linux-grep).

Deleting what you found? Run the command without `-delete` first and put `-delete` at the very end; the reasons are in [Delete Large Files Safely](/blog/how-to-delete-large-files-linux-safely).

---

## Useful one-offs

```bash
find / -xdev -xtype l 2>/dev/null                  # broken symlinks (GNU find)
find / -xdev -type f -perm -4000 2>/dev/null       # setuid binaries (security audit)
find / -xdev -type f -perm -0002 2>/dev/null       # world-writable files
find /opt/app -type f -name '*.*' | sed 's/.*\.//' | sort | uniq -c | sort -rn | head   # count by extension
find /home -maxdepth 3 -type f -iname '*.pem'      # limit depth when you know it's shallow
```

Need to filter by age too? `-mtime`, `-mmin` and `-newermt` are in [Find Files Older Than X Days](/blog/linux-find-files-older-than-x-days).

---

## find vs locate

`locate` (from `mlocate` or `plocate`) searches a prebuilt database, so it answers in milliseconds:

```bash
locate -i config.yml
```

The database is usually updated once a day, so new files are missing and deleted ones still show up. It also can't filter by size. Use `locate` to find where something lives, `find` when results must be current or you need size, age or permission filters.

---

## FAQ

**How do I find a file by name in Linux?**
`find / -xdev -type f -name 'filename' 2>/dev/null`. Use `-iname` for case-insensitive matching and quote the name if it contains wildcards.

**How do I find files larger than 100MB with a certain extension?**
`find /path -type f -name '*.ext' -size +100M`. Add `-exec ls -lh {} +` to see sizes.

**Why does find -size -1M only return empty files?**
find rounds sizes up to the unit, so any non-empty file is at least "1M". Use a smaller unit: `-size -1024k` or `-size -1048576c`.

**Why does find say "paths must precede expression"?**
Usually an unquoted wildcard: the shell expanded `*.log` into several file names. Quote it: `-name '*.log'`.
