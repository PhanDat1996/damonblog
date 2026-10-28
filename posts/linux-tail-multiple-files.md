---
title: "tail Multiple Files in Linux: Label, Merge or Split View"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Follow several log files at once: tail with clean per-line labels, merging the journal with flat files, multitail split panes, and lnav for time order."
tags: ["linux", "logs", "troubleshooting", "monitoring", "debugging"]
featured: false
category: "linux"
---

The request fails somewhere between NGINX and the app, and you want to see both logs at the same time: the NGINX error log, the application log, maybe the service's journal too. `tail` takes several files at once, but the raw output is hard to read under pressure.

This post is about watching **several sources together**: quick multi-file tail, labeling every line with its source, mixing in the journal, and split-screen tools. For the basics of following one log reliably (rotation, buffering, `journalctl -f` filters), see [monitor real-time logs](/blog/monitor-real-time-logs-linux).

---

## TL;DR

```bash
# Quick: several files, tail prints a header when the source changes
tail -n 0 -F /var/log/nginx/error.log /var/log/myapp/app.log

# Readable: every line prefixed with its file name
tail -n 0 -F /var/log/nginx/error.log /var/log/myapp/app.log \
  | awk '/^==> .* <==$/ {n=split($2,p,"/"); f=p[n]; next} NF {print "[" f "] " $0; fflush()}'

# Several systemd units merged in time order
journalctl -f -u nginx -u myapp -u postgresql

# Split screen
multitail /var/log/nginx/error.log /var/log/myapp/app.log
```

---

## `tail` with several files

```bash
tail -n 0 -F /var/log/nginx/access.log /var/log/nginx/error.log
```

```
==> /var/log/nginx/access.log <==
198.51.100.7 - - [28/Oct/2026:09:15:01 +0000] "GET /api/v1/users HTTP/1.1" 200 1234 "-" "curl/8.5.0"

==> /var/log/nginx/error.log <==
2026/10/28 09:15:02 [error] 1187#1187: *18423 connect() failed (111: Connection refused) while connecting to upstream, client: 198.51.100.7, ...

==> /var/log/nginx/access.log <==
198.51.100.7 - - [28/Oct/2026:09:15:02 +0000] "GET /api/v1/orders HTTP/1.1" 502 157 "-" "curl/8.5.0"
```

Things to know:

- A `==> file <==` header is printed **whenever the source changes**, not on every line. When two files are busy, most of your screen is headers.
- Lines appear in the order `tail` **reads** them, not by the timestamps inside them. Close enough for live watching, not good enough for a precise timeline.
- `-q` drops the headers entirely, but then you can't tell which file a line came from.
- Use `-F`, not `-f`, so each file is reopened after rotation. The [real-time logs post](/blog/monitor-real-time-logs-linux) explains why.

---

## Label every line with its source

### One `tail`, relabeled with awk (recommended)

`tail`'s headers already say which file is speaking. awk can turn them into a prefix on every line:

```bash
tail -n 0 -F /var/log/nginx/error.log /var/log/myapp/app.log \
  | awk '/^==> .* <==$/ {n=split($2,p,"/"); f=p[n]; next}
         NF {print "[" f "] " $0; fflush()}'
```

```
[error.log] 2026/10/28 09:15:02 [error] 1187#1187: *18423 connect() failed (111: Connection refused) ...
[app.log] 2026-10-28 09:15:02.114 ERROR OrderService: shutting down, received SIGTERM
[error.log] 2026/10/28 09:15:03 [error] 1187#1187: *18431 connect() failed (111: Connection refused) ...
```

Why this is the best default: it's a single pipeline, so `Ctrl+C` stops everything cleanly. `fflush()` keeps it live if you pipe it further. (It also drops blank lines, since `tail` puts one before every header.)

### One `tail` per file, in a small script

Use this when sources differ, e.g., a file plus a journal plus a remote host:

```bash
#!/usr/bin/env bash
# follow-logs.sh: prefix each source and stop everything on Ctrl+C
trap 'trap - INT TERM EXIT; kill 0' INT TERM EXIT

tail -n 0 -F /var/log/nginx/error.log | sed -u 's/^/[nginx]   /' &
tail -n 0 -F /var/log/myapp/app.log   | sed -u 's/^/[app]     /' &
journalctl -f -n 0 -u myapp -o cat    | sed -u 's/^/[journal] /' &
ssh db01 'tail -n 0 -F /var/log/postgresql/postgresql-16-main.log' | sed -u 's/^/[db01]    /' &

wait
```

The `trap` line matters. If you paste background jobs (`cmd &`) into an interactive shell, `Ctrl+C` doesn't reach them, and you're left with orphan `tail` processes that keep running. In a script, `kill 0` on exit signals the whole process group.

`sed -u` makes sed flush each line. Without it, prefixed lines arrive in bursts.

---

## Mixing the journal and flat files

Many services log both ways: startup and crash messages to the journal, request logs to their own file.

For several **units**, let journald merge them. It interleaves by the entries' real timestamps, which `tail` can't do:

```bash
journalctl -f -u nginx -u myapp -u postgresql
journalctl -f -u myapp -u nginx -o short-precise    # microsecond timestamps
```

For journal **plus** files, use the script above, or multitail's `-l` (run a command) option below.

---

## multitail: split-screen panes

```bash
sudo apt install multitail        # Debian/Ubuntu
sudo dnf install multitail        # RHEL family: needs the EPEL repository
```

```bash
# Two panes, stacked top and bottom
multitail /var/log/nginx/error.log /var/log/myapp/app.log

# Side by side (2 columns)
multitail -s 2 /var/log/nginx/error.log /var/log/myapp/app.log

# A color per pane (-ci applies to the next file)
multitail -ci red /var/log/nginx/error.log -ci yellow /var/log/myapp/app.log

# A pane fed by a command instead of a file
multitail /var/log/myapp/app.log -l "journalctl -f -n 0 -u myapp"

# Merge a second file into the same pane as the first
multitail /var/log/nginx/access.log -I /var/log/nginx/error.log
```

`q` quits, `b` scrolls back through a pane's history. Panes keep each source visually separate, which is easier to read than any interleaved stream when the sources have very different volumes (say, a chatty access log next to a quiet error log).

---

## lnav: merge by timestamp

If you need the lines in true time order, for example to see whether the app error came before or after the NGINX error, use `lnav`. It parses the timestamps of common formats (syslog, NGINX/Apache, journald exports, many app formats) and merges files into one chronological view:

```bash
sudo apt install lnav             # Debian/Ubuntu; EPEL on RHEL
lnav /var/log/nginx/error.log /var/log/myapp/app.log
lnav /var/log/nginx/                # a whole directory, including rotated .gz files
```

It follows files live like `tail -F`, and lets you filter, search and jump to errors interactively. For correlating two sources second by second, it's the right tool.

---

## Wildcards and new files

```bash
tail -n 0 -F /var/log/nginx/*.log
```

The shell expands the glob **once**, when you press Enter. A file created later (a new vhost log, a new daily log `app-2026-10-29.log`) isn't followed. Re-run the command, or point lnav at the directory.

Be careful with `tail -F /var/log/nginx/error.log*`: that also matches `error.log.2.gz`, and `tail` will print compressed bytes into your terminal. Rotated files are for searching (`zgrep`), not following.

---

## Common mistakes

- **Pasting background `tail` jobs into an interactive shell.** `Ctrl+C` doesn't stop them; they keep running after you leave. Use one pipeline, or a script with a `trap`.
- **Reading interleaved output as a timeline.** `tail` order is arrival order. Use `journalctl` with multiple `-u` or `lnav` when the order matters.
- **Using `grep -v "^==>"` to remove headers.** `-q` does it properly, and the awk relabel is better than either.
- **Forgetting `sed -u` / `--line-buffered`** in prefix pipelines. Lines arrive in bursts.

---

*Related: [Monitor real-time logs in Linux](/blog/monitor-real-time-logs-linux) for single-stream filtering and buffering, [incident triage with logs](/blog/log-analysis-incident-triage) for which files to watch during an outage, and [grep for log searching](/blog/search-text-in-files-linux-grep) once you need to search history instead of the live stream.*
