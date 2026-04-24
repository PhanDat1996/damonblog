---
title: "Permission Denied Linux: Fix with chmod and chown"
date: "2026-04-22"
excerpt: "Fix 'permission denied' errors in Linux — read permission bits correctly, use chmod and chown safely, debug with ls -la and stat, and avoid common mistakes that break applications."
tags: ["linux", "troubleshooting", "security", "infrastructure"]
featured: false
slug: "permission-denied-linux-fix-chmod-chown"
category: "linux"
---

`Permission denied`. Deployment failed. Service won't start. Script can't read a file. The fix is usually one of two things: wrong ownership (`chown`) or wrong permission bits (`chmod`). Here's how to diagnose and fix both.

---

## TL;DR

```bash
# See who owns the file and what permissions it has
ls -la /path/to/file
stat /path/to/file

# Change owner
chown appuser:appgroup /path/to/file
chown -R appuser:appgroup /path/to/directory

# Change permissions
chmod 644 /path/to/file       # rw-r--r--  (file: owner rw, others r)
chmod 755 /path/to/directory  # rwxr-xr-x  (dir: owner rwx, others rx)
chmod +x /path/to/script      # add execute for everyone
```

---

## Read ls -la Output

```bash
ls -la /var/log/app/
```

```
drwxr-xr-x  2 appuser appgroup 4096 Apr 22 09:15 .
drwxr-xr-x 12 root    root     4096 Apr 22 09:00 ..
-rw-r--r--  1 appuser appgroup  512 Apr 22 09:15 app.log
-rwxr-xr-x  1 root    root     1024 Apr 20 14:00 startup.sh
```

Breaking down `-rw-r--r--`:

```
- rw- r-- r--
│ │   │   └── others: read only
│ │   └────── group:  read only
│ └────────── owner:  read + write
└──────────── type: - = file, d = directory, l = symlink
```

The columns after permissions: `links owner group size date name`

---

## chmod: Fix Permission Bits

### Numeric (octal) mode

```bash
# Common permission sets
chmod 644 file.conf    # rw-r--r--  config files
chmod 640 secrets.env  # rw-r-----  sensitive configs (group readable)
chmod 600 private.key  # rw-------  SSH keys, secrets
chmod 755 script.sh    # rwxr-xr-x  executables, directories
chmod 750 /opt/app     # rwxr-x---  app dir (group access, others none)
chmod 700 /root/.ssh   # rwx------  highly sensitive dirs
```

Octet math: `r=4, w=2, x=1`. Add them: `rw- = 4+2+0 = 6`, `r-x = 4+0+1 = 5`.

### Symbolic mode (easier to read)

```bash
chmod +x script.sh          # add execute for all
chmod u+x,g-w file          # add execute for owner, remove write for group
chmod o-rwx sensitive.conf  # remove all permissions for others
chmod a=r public.txt        # set read-only for everyone
```

### Recursive (be careful)

```bash
# Fix directory tree
chmod -R 755 /opt/app

# BETTER: different permissions for files vs directories
find /opt/app -type d -exec chmod 755 {} \;
find /opt/app -type f -exec chmod 644 {} \;
find /opt/app/bin -type f -exec chmod 755 {} \;  # executables only
```

Never `chmod -R 777` in production. It gives every user write access to every file.

---

## chown: Fix Ownership

```bash
# Change owner
chown appuser /var/log/app/app.log

# Change owner AND group
chown appuser:appgroup /var/log/app/

# Recursive
chown -R appuser:appgroup /var/log/app/

# Change group only
chown :appgroup /var/log/app/
# or
chgrp appgroup /var/log/app/
```

---

## Real Examples

### Service can't write to log directory

```bash
journalctl -u myapp | grep "permission denied"
# open /var/log/myapp/app.log: permission denied

ls -la /var/log/myapp/
# drwxr-xr-x 2 root root 4096 Apr 22 09:00 myapp

# Check which user the service runs as
systemctl cat myapp | grep User
# User=appuser

# Fix: give appuser ownership
chown -R appuser:appuser /var/log/myapp
systemctl restart myapp
```

### Script won't execute

```bash
./deploy.sh
# bash: ./deploy.sh: Permission denied

ls -la deploy.sh
# -rw-r--r-- 1 damon damon 1024 Apr 22 ...
# No execute bit!

chmod +x deploy.sh
./deploy.sh
```

### SSH key too permissive

```bash
ssh -i ~/.ssh/mykey user@server
# WARNING: UNPROTECTED PRIVATE KEY FILE!
# Permissions 0644 for '/home/damon/.ssh/mykey' are too open.

chmod 600 ~/.ssh/mykey
chmod 700 ~/.ssh/
ssh -i ~/.ssh/mykey user@server   # now works
```

### Nginx can't read static files

```bash
# nginx error log:
# (13: Permission denied) while reading file "/var/www/html/index.html"

ls -la /var/www/html/
# -rw------- 1 root root 1024 Apr 22 ...
# nginx user (www-data) can't read root-owned files

chown -R www-data:www-data /var/www/html/
# or keep root ownership but allow others to read:
chmod -R o+r /var/www/html/
```

---

## Diagnose with stat

`stat` gives more detail than `ls`:

```bash
stat /etc/app/config.yml
```

```
  File: /etc/app/config.yml
  Size: 1024
Access: (0640/-rw-r-----)  Uid: (1001/appuser)  Gid: (1002/appgroup)
```

The `(0640/-rw-r-----)` shows octal and symbolic mode together. Immediately clear what the permissions are.

---

## Common Mistakes

**`chmod -R 777` to "fix" permissions** — gives write access to everyone on the system. Never do this on files a service reads. Use the minimum permissions needed.

**Fixing permissions but not ownership** — `chmod 755` on a file owned by root doesn't help an app running as `appuser`. Fix `chown` first, then `chmod`.

**Not checking directory execute bits** — to access a file, you need execute (`x`) on every directory in the path, not just the file itself.

```bash
# Check full path permissions
namei -l /var/log/app/app.log
# Shows permissions of each component in the path
```

**Fixing the file but forgetting new files** — if the app creates new log files, those inherit the directory's umask, not your manual fix. Set the directory's sticky group bit:

```bash
chmod g+s /var/log/myapp   # new files inherit group from directory
```

---

## Special Bits

```bash
# Setuid (s) — run as file owner, not caller
chmod u+s /usr/bin/passwd

# Setgid (s) on directory — new files inherit directory group
chmod g+s /shared/project/

# Sticky bit (t) — only owner can delete files (used on /tmp)
chmod +t /shared/uploads/
```

---

## Conclusion

`ls -la` first — confirm who owns the file and what the permissions are. `stat` for more detail. `chown` to fix ownership, `chmod` to fix permissions. Always set the minimum permissions needed. `chmod -R 777` is never the right answer.

---

*Related: [CIS Level 1 Ubuntu Hardening](/blog/cis-level1-ubuntu-hardening) — file permission hardening in production. [Linux Find File by Name and Size](/blog/linux-find-file-by-name-size-guide) — `find -perm` to audit permissions across a directory tree.*
