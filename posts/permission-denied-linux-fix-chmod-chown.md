---
title: "Permission Denied on Linux: Fix It Without chmod 777"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Fix Permission denied on Linux: check the right user, every directory in the path, chmod and chown, then ACLs, noexec, SELinux and systemd sandboxing."
tags: ["linux", "troubleshooting", "security", "infrastructure"]
featured: false
category: "linux"
---

The deploy fails with `Permission denied`. You run `ls -l`, the file is `644`, looks fine. You try `chmod 755`. Still denied. At this point most people reach for `chmod -R 777`, which may make the error go away and leaves a security hole behind.

There's always a specific reason the kernel said no, and it's usually one of a short list. Find which one, fix that, and keep the permissions tight.

---

## TL;DR

```bash
# 1. Who is actually trying? (a service usually isn't running as you)
systemctl show -p User -p Group myapp
ps -o user,group,pid,cmd -C myapp

# 2. Check EVERY directory in the path, not just the file
namei -l /var/www/app/storage/logs/app.log

# 3. Test as that user
sudo -u www-data test -r /var/www/app/config.php && echo readable
sudo -u www-data test -w /var/www/app/storage/logs && echo writable

# 4. Fix ownership or mode for that user only
sudo chown -R appuser:appuser /var/lib/myapp
sudo chmod 640 /etc/myapp/config.yml
```

If permissions look right and it's still denied, skip to the "When chmod doesn't fix it" section below.

---

## Read the error first

| Message | errno | Usually means |
|---|---|---|
| `Permission denied` | `EACCES` (13) | Mode bits, ownership, a directory in the path, ACL, SELinux/AppArmor, or a `noexec` mount |
| `Operation not permitted` | `EPERM` (1) | Not a mode problem: immutable file (`chattr +i`), changing ownership as non-root, or a capability the process lacks |
| `Read-only file system` | `EROFS` (30) | The filesystem is mounted read-only (or remounted after disk errors), or a systemd `ProtectSystem=` setting |
| `bash: ./script.sh: Permission denied` | `EACCES` | No execute bit, or the filesystem is mounted `noexec` |
| NGINX: `(13: Permission denied) while reading ...` | `EACCES` | The worker user (`www-data` or `nginx`) can't traverse a directory or read the file, or SELinux labels |

---

## How Linux decides

For each access, the kernel picks **one** set of bits: owner if you're the owner, else group if you're in the file's group, else others. It does not fall through: if you're the owner and the owner bits say no, group and others bits don't matter.

```
-rw-r----- 1 appuser appgroup 512 Oct 28 09:15 config.yml
 │└┬┘└┬┘└┬┘
 │ │  │  └─ others: ---  nothing
 │ │  └──── group (appgroup): r--  read
 │ └─────── owner (appuser): rw-  read, write
 └───────── type: - file, d directory, l symlink
```

What the bits mean on a **directory** is the part people miss:

| Bit | On a file | On a directory |
|---|---|---|
| `r` (4) | Read contents | List the names inside (`ls`) |
| `w` (2) | Modify contents | Create, delete and rename entries inside (with `x`) |
| `x` (1) | Run it | **Enter it / pass through it** to reach anything below |

So to read `/var/www/app/config.php`, the user needs `x` on `/`, `/var`, `/var/www` and `/var/www/app`, plus `r` on the file. One directory with `drwx------` anywhere in the path blocks everything under it. Also, **deleting** a file needs `w` on its directory, not on the file.

`namei -l` shows the whole chain at once:

```bash
namei -l /home/deploy/app/public/index.html
```

```
f: /home/deploy/app/public/index.html
drwxr-xr-x root   root   /
drwxr-xr-x root   root   home
drwx------ deploy deploy deploy        <- www-data can't pass through here
drwxr-xr-x deploy deploy app
drwxr-xr-x deploy deploy public
-rw-r--r-- deploy deploy index.html
```

Ubuntu 21.04 and later create home directories as `750`, which is why serving a site from `/home/user/...` often fails with NGINX. Move the site to `/var/www` or `/srv` rather than opening up the home directory.

---

## Fixing it: give access to the right user only

### Wrong owner

A service running as `appuser` that must write to its data or log folder:

```bash
systemctl show -p User myapp          # User=appuser
sudo chown -R appuser:appuser /var/lib/myapp /var/log/myapp
```

Only `chown` folders the service is supposed to **write**. Code and config should usually stay owned by root (or a deploy user) and be readable by the service, so a compromised app can't rewrite its own code.

### Wrong mode

```bash
chmod 640 /etc/myapp/config.yml     # owner rw, group r, others nothing
chmod 600 ~/.ssh/id_ed25519         # private keys: owner only
chmod 755 /usr/local/bin/tool       # executable by everyone
chmod u+x deploy.sh                 # add execute for the owner
chmod o-rwx /srv/secrets            # remove all access for others
```

Octal is `r=4, w=2, x=1` added per class: `640` = `rw-` `r--` `---`.

### Shared access via a group

When several users or services need the same folder, use a group instead of opening it to everyone:

```bash
sudo groupadd webdata
sudo usermod -aG webdata deploy
sudo usermod -aG webdata www-data
sudo chgrp -R webdata /srv/site
sudo chmod -R g+rwX /srv/site
sudo find /srv/site -type d -exec chmod g+s {} +     # new files inherit the webdata group
```

Two details: group membership only applies to **new** logins and processes, so log out and back in (or restart the service). And `g+s` on a directory (setgid) makes new files inherit the directory's group; it does nothing about their mode, which comes from the creating process's umask. For a service, set `UMask=0002` in its unit if group members need to write its files.

### Recursive changes: use X, or files and dirs separately

```bash
chmod -R u=rwX,g=rX,o= /srv/app     # capital X: execute only on dirs (and files already executable)
```

Or explicitly:

```bash
find /srv/app -type d -exec chmod 750 {} +
find /srv/app -type f -exec chmod 640 {} +
```

**Avoid `chmod -R 755` or `chmod -R 777`.** The first makes every file executable. The second lets every local user and every compromised service on the box modify your code, and some programs refuse to work with it on purpose: `sshd` ignores keys and `authorized_keys` that are group- or world-writable, and `sudo` refuses a world-writable `sudoers` file. Before any recursive `chmod`/`chown`, run it on one file first, and double-check the path; `chown -R user /` or `/ etc` (note the space) is a classic way to break a server.

---

## Common cases

**Script won't run.** `ls -l deploy.sh` shows no `x`. Fix with `chmod u+x deploy.sh`. If it has `x` and still fails, check the mount (next section) or run it explicitly with `bash deploy.sh`.

**SSH: "UNPROTECTED PRIVATE KEY FILE".** The private key is readable by others:

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_ed25519 ~/.ssh/authorized_keys
```

On the server side, sshd's `StrictModes` also rejects logins if your home directory or `~/.ssh` is group- or world-writable.

**NGINX `13: Permission denied`.** Run `namei -l` on the path from the error, as above. Static files only need to be readable by the worker user: keep them root-owned with `755` directories and `644` files. Don't `chown -R www-data` the web root unless the app genuinely writes there.

**`sudo echo ... > /etc/file` denied.** The redirection is done by your own shell before `sudo` runs. Use `echo ... | sudo tee /etc/file` (or `tee -a` to append).

**Can't delete a file you own.** Deleting needs `w` on the **directory**. In a sticky directory like `/tmp` (`drwxrwxrwt`), only the file's owner can delete it.

---

## When chmod doesn't fix it

The mode bits are only the first check. If `ls -l` and `namei -l` both look right:

**ACLs.** A `+` at the end of the mode (`-rw-r-----+`) means an access control list is set, and it can deny access that the bits seem to allow.

```bash
getfacl /srv/app/config.yml
setfacl -m u:www-data:r /srv/app/config.yml     # grant one user read without changing the owner
```

**noexec mounts.** `/tmp`, `/dev/shm` and some data volumes are often mounted `noexec`. Executables there fail with `Permission denied` whatever their mode.

```bash
findmnt -T /tmp -o TARGET,OPTIONS
# /tmp  rw,nosuid,nodev,noexec,relatime
```

**SELinux (RHEL, Fedora, Rocky, Alma).** Files have a security label, and a service can only touch files with the right label. Files moved (`mv`) from a home directory keep their old label.

```bash
getenforce                              # Enforcing?
ls -Z /srv/www/index.html               # check the label
sudo ausearch -m avc -ts recent         # recent denials
sudo semanage fcontext -a -t httpd_sys_content_t '/srv/www(/.*)?'
sudo restorecon -Rv /srv/www
```

Don't fix this by disabling SELinux. `restorecon` or the right `semanage` rule is usually a one-liner.

**AppArmor (Ubuntu, Debian, SUSE).** Profiles restrict paths for specific programs. Look for `apparmor="DENIED"` in `journalctl -k` or `/var/log/syslog`.

**systemd sandboxing.** Units with `ProtectSystem=strict`, `ProtectHome=yes` or `ReadOnlyPaths=` see parts of the filesystem as read-only or missing, regardless of file permissions. Check with `systemctl cat myapp` and add the folder to `ReadWritePaths=` if the service legitimately needs it.

**Immutable files.** `Operation not permitted` even as root:

```bash
lsattr /etc/resolv.conf
# ----i---------e------- /etc/resolv.conf
sudo chattr -i /etc/resolv.conf
```

**NFS root squash.** On an NFS mount, root is usually mapped to `nobody`, so `sudo` doesn't help. Fix permissions on the NFS server, or access the files as the owning user.

---

## Quick checklist

1. Which user is the process running as? (`systemctl show -p User`, `ps -o user`)
2. `namei -l` the full path: `x` on every directory, `r`/`w` on the file, `w` on the parent to create or delete.
3. Test with `sudo -u <user> test -r/-w <path>`.
4. Fix ownership or mode for that user or a shared group, not for "others".
5. Still denied? ACLs (`getfacl`), mount options (`findmnt`), SELinux (`ausearch`), AppArmor, systemd `Protect*` settings, `lsattr`.

*Related: [Find Files by Name and Size](/blog/linux-find-file-by-name-and-size) for `find -perm` audits of setuid and world-writable files. [CIS Level 1 Ubuntu Hardening](/blog/cis-level1-ubuntu-hardening) for permission baselines. [systemctl Service Not Starting](/blog/systemctl-service-not-starting-fix) when the denial stops a unit from starting.*
