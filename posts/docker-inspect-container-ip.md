---
title: "Docker Inspect: Get a Container's IP Address on Any Network"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Get a Docker container's IP with docker inspect, including Compose and user-defined networks where the common one-liner returns empty or glued output."
tags: ["docker", "networking", "infrastructure", "troubleshooting"]
featured: false
category: "devops"
---

The quick answer:

```bash
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' mycontainer
# 172.18.0.3
```

That works for most containers. It breaks in a few common situations: the container is on two networks, the network name has a hyphen in it, it uses host networking, or you're using the older `.NetworkSettings.IPAddress` field. Those cases are covered below, along with why you often shouldn't need the IP at all.

---

## Why the IP lives under `Networks`

A container gets **one IP per network it's attached to**. `docker inspect` stores them in a map keyed by network name:

```json
"NetworkSettings": {
    "IPAddress": "",
    "Networks": {
        "myapp_default": {
            "IPAddress": "172.18.0.3",
            "IPPrefixLen": 16,
            "Gateway": "172.18.0.1",
            "MacAddress": "02:42:ac:12:00:03",
            "DNSNames": ["myapp-web-1", "web", "3f2a9c1b7d4e"]
        }
    }
}
```

The top-level `NetworkSettings.IPAddress` is a **legacy** field, deprecated since Docker 1.13. It's only filled in for the default `bridge` network. Containers on user-defined networks (which includes everything started by Docker Compose) show an empty string there. Old scripts that read it report "no IP" for perfectly healthy containers. Always read from `Networks`.

---

## Get the IP: by situation

### One network (most containers)

```bash
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' web
```

### Several networks: label them

Without a separator, a container on two networks prints `172.18.0.310.10.0.5`, which looks like one corrupted address. Print the network name with each IP:

```bash
docker inspect -f '{{range $name, $net := .NetworkSettings.Networks}}{{$name}} {{$net.IPAddress}}{{println}}{{end}}' web
# myapp_backend 10.10.0.5
# myapp_frontend 172.18.0.3
```

### A specific network: use `index`

You might expect dot syntax to work:

```bash
docker inspect -f '{{.NetworkSettings.Networks.bridge.IPAddress}}' web
```

It does for `bridge`, but Go templates only accept identifier-style names after a dot. A Compose project called `my-app` creates the network `my-app_default`, and the dot form fails with a template parse error (`bad character U+002D '-'`). `index` works for any name:

```bash
docker inspect -f '{{(index .NetworkSettings.Networks "my-app_default").IPAddress}}' web
```

Not sure of the exact network name? List them with `docker inspect -f '{{json .NetworkSettings.Networks}}' web | jq 'keys'`.

### Host or none networking: there is no container IP

```bash
docker inspect -f '{{.HostConfig.NetworkMode}}' web
# host
```

With `--network host` the container shares the host's network stack and has no IP of its own, so the template prints nothing. Use the host's address. With `--network none` there's nothing to reach.

### IPv6

```bash
docker inspect -f '{{range .NetworkSettings.Networks}}{{.GlobalIPv6Address}} {{end}}' web
```

Empty unless the network was created with IPv6 enabled.

---

## Every container on a network, at once

Usually faster than inspecting containers one by one:

```bash
docker network inspect -f '{{range .Containers}}{{.Name}} {{.IPv4Address}}{{println}}{{end}}' myapp_default
# myapp-db-1 172.18.0.2/16
# myapp-web-1 172.18.0.3/16
```

Note the `/16`: this view includes the prefix length.

All running containers with all their IPs:

```bash
docker ps -q | xargs docker inspect \
  -f '{{.Name}}{{range $n, $c := .NetworkSettings.Networks}} {{$n}}={{$c.IPAddress}}{{end}}' \
  | sed 's#^/##'
# myapp-web-1 myapp_default=172.18.0.3
# myapp-db-1 myapp_default=172.18.0.2
# legacy-cron bridge=172.17.0.2
```

`.Name` starts with a `/` for historical reasons, and the `sed` strips it.

Find which container owns an IP (e.g. one you saw in a firewall or app log):

```bash
docker ps -q | xargs docker inspect \
  -f '{{.Name}}{{range .NetworkSettings.Networks}} {{.IPAddress}}{{end}}' \
  | grep -w "172.18.0.3"
```

---

## Docker Compose services

Compose names containers `<project>-<service>-<n>`. Resolve the container from the service name instead of guessing:

```bash
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' "$(docker compose ps -q web)"
```

With more than one replica, `docker compose ps -q web` returns several IDs. Pass them all and add `{{.Name}}` to the format.

---

## With jq (for scripts)

```bash
docker inspect web | jq -r '.[0].NetworkSettings.Networks | to_entries[] | "\(.key) \(.value.IPAddress) gw=\(.value.Gateway)"'
# myapp_default 172.18.0.3 gw=172.18.0.1
```

`jq` handles any network name without the `index` workaround.

---

## From inside the container

Many slim images have no `ip`, `ifconfig`, or `hostname -I`. One method that works almost everywhere: Docker writes the container's own IP into its `/etc/hosts` (except with host networking):

```bash
docker exec web cat /etc/hosts
# ...
# 172.18.0.3      3f2a9c1b7d4e
```

If the image has iproute2: `docker exec web ip -4 -brief addr`.

---

## You probably shouldn't hard-code it

Container IPs are assigned from the network's pool at start time and can change every time the container is recreated. For container-to-container traffic, use names. On user-defined networks (including every Compose network), Docker's embedded DNS resolves service and container names:

```yaml
services:
  web:
    environment:
      DATABASE_URL: postgres://db:5432/app    # "db" = service name, not an IP
  db:
    image: postgres:16
```

The default `bridge` network has no name resolution, which is one reason to avoid it. See [Docker networking explained](/blog/docker-networking-guide).

If you really need a fixed address, assign one on a user-defined network with an explicit subnet:

```bash
docker network create --subnet 172.30.0.0/24 fixednet
docker run -d --network fixednet --ip 172.30.0.10 --name web nginx
```

**Can't reach the IP from your laptop?** On Docker Desktop (macOS, Windows), containers run inside a VM, and their IPs aren't routable from the host. Use published ports (`-p 8080:80`) and `localhost:8080`. On a Linux host, the container IP is reachable from the host itself, but not from other machines unless you route to it.

---

## FAQ

**Why does docker inspect return an empty IP address?**
Usually you're reading the legacy `.NetworkSettings.IPAddress` for a container on a user-defined network, or the container uses `--network host` or isn't running. Read `.NetworkSettings.Networks` instead, and check `.State.Status`.

**How do I get the IP of a stopped container?**
You can't. The IP is released when the container stops and may differ on the next start. Start it, or use names instead of IPs.

**How do I find the host's IP from inside a container?**
On a Linux bridge network, the host is reachable at the network's gateway (`.Gateway` in the output above). Portable alternative: run with `--add-host=host.docker.internal:host-gateway` and connect to `host.docker.internal`.

---

*Related: [Check open ports on Linux](/blog/check-open-ports-linux) to see which published ports the host is listening on. [Docker container not starting](/blog/docker-container-not-starting-fix) when the container never gets an IP because it exits.*
