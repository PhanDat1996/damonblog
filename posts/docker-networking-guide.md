---
title: "Docker Networking Demystified: bridge, host, and overlay"
date: "2024-07-05"
excerpt: "The three Docker network modes that matter for production — what they actually do, when to use each, and the gotchas that'll bite you if you pick the wrong one."
tags: ["docker", "networking", "infrastructure"]
featured: false
---

## Why Docker Networking Trips People Up

Docker networking is one of those things that works magically until it doesn't, and then you have no idea why. Containers that can't talk to each other. Ports that aren't reachable. Services that work on one host but not another.

The confusion usually comes from not understanding what's happening under the hood. Let's fix that.

## The Three Modes That Matter

### 1. Bridge (Default)

When you run `docker run nginx`, Docker creates a virtual ethernet pair. One end goes into the container (`eth0`), the other end (`veth123abc`) plugs into a virtual switch called `docker0` on the host.

```bash
# See the bridge
ip link show docker0
brctl show docker0

# See container interfaces
docker inspect <container> | jq '.[].NetworkSettings.Networks'
```

**What this means:**
- Container gets its own IP on the `172.17.0.0/16` subnet (by default)
- Containers on the same bridge can reach each other by IP
- Host can reach containers by IP
- Outside world reaches containers only through published ports (`-p 8080:80`)

**When to use it:** Single-host development. Simple apps that don't need to talk to each other.

**The gotcha:** Default bridge doesn't support DNS between containers. If you need `container-a` to reach `container-b` by name, use a **custom bridge network** instead:

```bash
docker network create myapp
docker run --network myapp --name db postgres
docker run --network myapp --name app my-app  # can reach "db" by hostname
```

### 2. Host Network

```bash
docker run --network host nginx
```

No virtual network. Container shares the host's network stack directly. Port 80 in the container IS port 80 on the host — no NAT, no translation.

```bash
# See it: no veth, no docker0 involvement
docker run --network host nginx &
ss -tlnp | grep :80  # shows nginx process, not docker-proxy
```

**What this means:**
- Lowest possible network overhead (no NAT)
- No port mapping needed or supported
- Container can see and bind to any host interface
- Two containers can't both bind the same port

**When to use it:** High-performance applications where NAT overhead matters (monitoring agents, network tools, high-throughput proxies). Also useful when you need a container to see actual client IPs without `X-Forwarded-For` tricks.

**The gotcha:** Port conflicts. If your container tries to bind port 80 and something on the host already has it, the container fails.

### 3. Overlay (Swarm / Multi-Host)

Overlay networks stretch across multiple Docker hosts. Containers on different machines can communicate as if they're on the same LAN.

```bash
# Requires Swarm mode
docker swarm init
docker network create --driver overlay --attachable myoverlay
```

Under the hood, Docker uses VXLAN to encapsulate container traffic inside UDP packets sent between hosts. The overlay is the virtual network; the underlay is your real network.

**When to use it:** Multi-host Docker Swarm deployments. Anything where containers on different physical machines need to communicate directly.

**For Kubernetes users:** You almost certainly won't configure this manually — your CNI plugin (Calico, Flannel, Cilium) handles it.

## Practical Compose Networking

In `docker-compose.yml`, every service gets put on a default network named `<project>_default`. Services can reach each other by service name.

```yaml
services:
  nginx:
    image: nginx
    ports:
      - "80:80"
    networks:
      - frontend

  app:
    image: my-app
    networks:
      - frontend
      - backend

  db:
    image: postgres
    networks:
      - backend  # db is NOT reachable from nginx

networks:
  frontend:
  backend:
```

This is network segmentation in Docker. `nginx` can reach `app`, `app` can reach `db`, but `nginx` cannot directly reach `db`. Defense in depth, even in containers.

## Debugging Network Issues

```bash
# Can containers reach each other?
docker exec app ping db

# DNS resolution working?
docker exec app nslookup db

# Check network membership
docker network inspect <network-name>

# Trace the packet path
docker exec app traceroute db

# Check iptables rules Docker created
iptables -t nat -L DOCKER --line-numbers
```

**"Connection refused" vs "No route to host":**
- `Connection refused` — the network path works, nothing is listening on that port
- `No route to host` / `Network unreachable` — containers are on different networks or firewall is blocking

## A Note on Published Ports and `docker-proxy`

When you do `-p 8080:80`, Docker starts a `docker-proxy` process on the host that forwards traffic. You can see it:

```bash
ps aux | grep docker-proxy
```

This works fine for most cases. If you want to avoid it (for performance or to get real client IPs), use `--network host` or configure `iptables` rules directly — but that's advanced territory.

Understanding these three modes handles 95% of Docker networking situations you'll encounter in production.
