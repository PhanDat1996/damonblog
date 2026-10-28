---
title: "Docker Networking Explained: Bridge vs Host vs Overlay"
date: "2024-07-05"
updated: "2026-10-28"
excerpt: "Containers that can't reach each other, ports that won't open, or ports open that shouldn't be: how Docker bridge, host and overlay networks really work."
tags: ["docker", "networking", "infrastructure"]
featured: false
category: "devops"
---

Your app container can't reach the database container: `connection refused` on `localhost:5432`, or `could not translate host name "db"`. Or the opposite problem: a port you published "for testing" turns out to be reachable from the internet, even though UFW says it's blocked.

Both come from the same gap: not knowing what Docker actually builds on the host when you pick a network. Once you've seen the moving parts (bridges, veth pairs, iptables NAT, an embedded DNS server), most Docker networking problems become easy to diagnose.

---

## The short version

| Network | Container IP | Name resolution between containers | Use it for |
|---|---|---|---|
| Default `bridge` | Yes (172.17.0.0/16) | **No** | Quick one-off containers |
| User-defined bridge (`docker network create`, every Compose project) | Yes | **Yes**, via embedded DNS | Almost everything on a single host |
| `host` | None, shares the host's stack | n/a | Network tools, agents, max throughput (Linux) |
| `overlay` | Yes, spans hosts | Yes | Swarm services across several hosts |
| `macvlan` / `ipvlan` | Yes, on the physical LAN | Yes (user-defined) | Containers that must look like physical machines |
| `none` | None | n/a | Fully isolated jobs |

Verdict: use a **user-defined bridge** unless you have a specific reason not to. The default `bridge` exists for backward compatibility.

---

## Bridge: what Docker builds on the host

For each container on a bridge network, Docker creates a **veth pair**, a virtual cable with two ends. One end becomes `eth0` inside the container. The other end is plugged into a Linux bridge on the host (`docker0` for the default network, `br-<id>` for user-defined ones).

```
   container A          container B
   eth0 172.18.0.2      eth0 172.18.0.3
        |                    |
     vethA                vethB
        \                    /
         +--- br-3f2a9c ----+        172.18.0.1 (gateway)
                  |
          host routing + iptables NAT (MASQUERADE out, DNAT in)
                  |
                eth0 (host) ─── network
```

```bash
ip -brief addr show type bridge          # docker0, br-xxxx with their gateway IPs
ip link show master docker0              # veth interfaces attached to docker0
docker network ls
docker network inspect myapp_default     # subnet, gateway, attached containers
```

(`brctl` from bridge-utils is deprecated. `ip` and `bridge` from iproute2 show the same information.)

Outbound traffic from containers is masqueraded (source NAT) to the host's IP. Inbound traffic only reaches a container through a **published port**.

### Why the default bridge can't resolve names

On user-defined networks, Docker runs an embedded DNS server at `127.0.0.11` inside each container. It answers for container names, Compose service names, and aliases. The default `bridge` network doesn't get it, so containers there can only use IPs (or the deprecated `--link`):

```bash
docker network create myapp
docker run -d --network myapp --name db  -e POSTGRES_PASSWORD=example postgres:16
docker run -d --network myapp --name app my-app      # can connect to "db:5432"
```

User-defined networks are also isolated from each other. Containers on `myapp` can't reach containers on another bridge network unless a container is attached to both.

### `localhost` inside a container is the container

The most common mistake: the app config says `DATABASE_HOST=localhost`. Inside a container, `localhost` is that container's own loopback, not the host and not other containers.

- To reach another container: use its name or service name (`db`).
- To reach a service on the host: on Linux, add `--add-host=host.docker.internal:host-gateway` and connect to `host.docker.internal`. The host service must listen on an address the bridge can reach, not only `127.0.0.1`.

The reverse trap: an app inside a container listening on `127.0.0.1:8080` can't be reached through `-p 8080:8080`, because published traffic arrives on the container's `eth0`. `curl` from the host fails with `Connection reset by peer` or `Empty reply from server`. Make the app listen on `0.0.0.0`.

---

## Published ports: NAT, docker-proxy, and your firewall

`-p 8080:80` makes Docker add iptables NAT rules that DNAT traffic arriving at host port 8080 to `container_ip:80`:

```bash
sudo iptables -t nat -L DOCKER -n --line-numbers
# Chain DOCKER (2 references)
# num  target  prot opt source     destination
# 1    RETURN  all  --  0.0.0.0/0  0.0.0.0/0
# 2    DNAT    tcp  --  0.0.0.0/0  0.0.0.0/0   tcp dpt:8080 to:172.18.0.3:80
```

Docker also starts a `docker-proxy` process per published port. It handles cases the NAT rules don't cover, mainly connections to the published port from the host itself via `localhost`. External traffic goes through the DNAT rule, so **the container sees the real client IP**. You don't need host networking just to get client addresses. (Setting `"userland-proxy": false` in `daemon.json` replaces docker-proxy with more iptables rules.)

### Published ports bypass UFW and firewalld rules

DNAT happens before the host's `INPUT` chain, and the forwarded traffic is accepted by Docker's own rules in `FORWARD`. So a UFW rule like `ufw deny 8080` **doesn't block** a port published with `-p 8080:80`. This catches a lot of people with databases published "temporarily".

Safer options:

```bash
# Publish only on loopback (reachable from the host, not the network)
docker run -d -p 127.0.0.1:5432:5432 postgres:16

# Or don't publish at all: other containers on the same network reach it by name
```

To filter traffic to published ports, add rules to the `DOCKER-USER` chain, which Docker evaluates before its own rules. See [checking firewall status on Linux](/blog/check-firewall-status-linux) for confirming what's actually allowed.

---

## Host network

```bash
docker run -d --network host nginx
ss -ltnp 'sport = :80'           # nginx itself is listening on the host, no docker-proxy
```

There's no network namespace, no NAT, and no container IP. The container binds directly to the host's interfaces.

- `-p` is ignored. Port 80 in the container **is** port 80 on the host.
- Two containers (or a container and a host service) can't use the same port. The second fails with `address already in use`.
- No isolation: the container can bind to any host interface and talk to services listening on the host's `127.0.0.1`.

Use it for things that need the host's network view (monitoring agents, network tools) or the lowest overhead for very high packet rates. Host networking is a Linux feature. On Docker Desktop, the "host" is the Desktop VM, not your laptop, unless you enable the newer host-networking support.

---

## Overlay: containers across hosts

Overlay networks connect containers on different Docker hosts as if they were on one LAN. Docker encapsulates container traffic in **VXLAN** (UDP) packets between hosts.

```bash
docker swarm init
docker network create --driver overlay --attachable myoverlay
```

- They require Swarm mode, even if you only attach standalone containers (`--attachable`).
- Hosts must allow **TCP 2377** (cluster management), **TCP/UDP 7946** (node discovery), and **UDP 4789** (VXLAN data) between each other. Blocked 4789 is the classic "services see each other in DNS but connections time out" problem.
- Add `--opt encrypted` to encrypt the data traffic between hosts.

On Kubernetes you don't use Docker overlays at all: the CNI plugin (Calico, Cilium, Flannel) provides pod networking.

---

## Compose networking and segmentation

Compose creates `<project>_default` and attaches every service, so services reach each other by service name. You can split them up:

```yaml
services:
  nginx:
    image: nginx
    ports:
      - "80:80"
    networks: [frontend]

  app:
    image: my-app
    networks: [frontend, backend]

  db:
    image: postgres:16
    networks: [backend]          # not reachable from nginx

networks:
  frontend:
  backend:
    internal: true               # no outbound internet from this network
```

`nginx` reaches `app`, `app` reaches `db`, and `nginx` can't reach `db`. `internal: true` also removes the outbound NAT route, so a compromised `db` container can't call out. If NGINX in this setup returns 502s to `app`, see [NGINX 502 Bad Gateway](/blog/nginx-502-bad-gateway-fix-linux). `proxy_pass http://127.0.0.1:...` inside the NGINX container is a common cause.

---

## Debugging connectivity

Slim images often lack `ping`, `nslookup` and `curl`. Two ways around it:

```bash
# Use what's usually there
docker exec app getent hosts db             # does the name resolve?
docker exec app cat /etc/resolv.conf        # 127.0.0.11 on user-defined networks

# Or borrow a toolbox that shares the app container's network namespace
docker run --rm -it --network container:app nicolaka/netshoot
#   then: dig db, nc -zv db 5432, curl -v http://web:8080/
```

Check membership and addresses:

```bash
docker network inspect -f '{{range .Containers}}{{.Name}} {{.IPv4Address}}{{println}}{{end}}' myapp_default
```

(For per-container IP lookups and template gotchas, see [docker inspect container IP](/blog/docker-inspect-container-ip).)

What the errors mean:

| Error | Meaning |
|---|---|
| `could not translate host name` / `Name or service not known` | Not on the same user-defined network, typo in the name, or on the default bridge |
| `Connection refused` | Network path works, but nothing listens on that port in the target (wrong port, app down, listening on `127.0.0.1`) |
| Timeout | Packets dropped: firewall, `internal` network, or blocked VXLAN between hosts |
| `No route to host` / `Network unreachable` | No route between the networks, or a host firewall rejecting |

To test a TCP path without application tools, see [test a TCP connection on Linux](/blog/test-tcp-connection-linux).

---

## FAQ

**Why can't my containers reach each other by name?**
They're on the default `bridge` network, which has no DNS, or they're on different networks. Create a network with `docker network create` (or use Compose) and attach both containers to it.

**Does Docker bypass UFW?**
For published ports, yes. Docker's NAT and forward rules handle the traffic before UFW's input rules see it. Publish on `127.0.0.1` or filter in the `DOCKER-USER` chain.

**Is host networking faster than bridge?**
It skips NAT and the veth hop, so it has slightly lower overhead. For most web workloads the difference is negligible compared to the loss of isolation and port flexibility.

---

*Related: [Check open ports on Linux](/blog/check-open-ports-linux) to see what the host is really exposing. [Docker container not starting](/blog/docker-container-not-starting-fix) for port-allocation and startup errors.*
