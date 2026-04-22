---
title: "Docker Inspect Container IP Address: Step-by-Step"
date: "2026-04-22"
excerpt: "Get a Docker container's IP address using docker inspect, docker exec, and network commands — with real examples for bridge, host, and custom networks."
tags: ["docker", "networking", "infrastructure", "troubleshooting"]
featured: false
slug: "docker-inspect-container-ip-address"
---

# Docker Inspect Container IP Address: Step-by-Step

Need the IP of a running container? There are several ways depending on whether you want just the IP, the full network config, or IPs across multiple networks.

---

## TL;DR

```bash
# Quickest — just the IP
docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' <container>

# Full network info
docker inspect <container> | grep IPAddress

# From inside the container
docker exec <container> hostname -I
```

---

## Method 1: docker inspect with Format Template

The cleanest approach — no `grep`, no `jq` needed:

```bash
docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' mycontainer
# Output: 172.17.0.3
```

For named networks, also show the network name:

```bash
docker inspect -f '{{range $net, $cfg := .NetworkSettings.Networks}}{{$net}}: {{$cfg.IPAddress}}{{"\n"}}{{end}}' mycontainer
# Output:
# bridge: 172.17.0.3
# myapp_network: 10.10.0.5
```

---

## Method 2: docker inspect + grep

Fast but less precise — useful for a quick look:

```bash
docker inspect mycontainer | grep IPAddress
```

Output:
```json
"SecondaryIPAddresses": null,
"IPAddress": "172.17.0.3",
        "IPAddress": "172.17.0.3",
```

The duplicate is from nested network config. Use method 1 for a clean single value.

---

## Method 3: docker inspect + jq

Best for scripting:

```bash
# Install jq if needed
apt install jq

# Get IP
docker inspect mycontainer | jq -r '.[0].NetworkSettings.IPAddress'

# Get IP for a specific named network
docker inspect mycontainer | jq -r '.[0].NetworkSettings.Networks.bridge.IPAddress'

# Get all network IPs as key-value
docker inspect mycontainer | jq -r '.[0].NetworkSettings.Networks | to_entries[] | "\(.key): \(.value.IPAddress)"'
```

---

## Method 4: From Inside the Container

```bash
# hostname -I (all IPs assigned to container)
docker exec mycontainer hostname -I
# Output: 172.17.0.3

# Or with ip command
docker exec mycontainer ip addr show eth0
docker exec mycontainer ip route

# On Alpine containers (no ip command)
docker exec mycontainer ifconfig eth0 2>/dev/null || docker exec mycontainer cat /proc/net/fib_trie
```

---

## Real Examples

### Get IPs of all running containers

```bash
docker ps -q | while read id; do
  name=$(docker inspect -f '{{.Name}}' $id | tr -d '/')
  ip=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $id)
  echo "$name: $ip"
done
```

Output:
```
nginx: 172.17.0.2
postgres: 172.17.0.3
redis: 172.17.0.4
```

### Container on multiple networks

```bash
docker inspect mycontainer | jq -r '
  .[0].NetworkSettings.Networks
  | to_entries[]
  | "\(.key): \(.value.IPAddress) (gateway: \(.value.Gateway))"
'
```

Output:
```
bridge: 172.17.0.3 (gateway: 172.17.0.1)
myapp_backend: 10.10.0.5 (gateway: 10.10.0.1)
```

### Find which container has a specific IP

```bash
docker ps -q | xargs docker inspect -f '{{.Name}} {{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \
  | grep "172.17.0.3"
```

### Get IP from docker-compose service

```bash
# Using service name (not container name)
docker compose exec web hostname -I

# Or
docker inspect $(docker compose ps -q web) \
  | jq -r '.[0].NetworkSettings.Networks | to_entries[0].value.IPAddress'
```

---

## Output Explanation

Full `docker inspect` network section:

```json
"NetworkSettings": {
    "IPAddress": "172.17.0.3",          ← legacy field, default bridge only
    "Networks": {
        "bridge": {
            "IPAddress": "172.17.0.3",  ← use this for bridge network
            "Gateway": "172.17.0.1",
            "MacAddress": "02:42:ac:11:00:03",
            "NetworkID": "abc123..."
        }
    }
}
```

**`IPAddress` at the top level** is only populated for the default bridge network and is considered legacy. Use `Networks.<name>.IPAddress` instead — it works for all network types.

---

## Common Mistakes

**Mistake 1: Container on a custom network returns empty IP from legacy field**

```bash
# Wrong — returns empty for custom network containers
docker inspect mycontainer | jq '.[0].NetworkSettings.IPAddress'
# ""

# Correct
docker inspect mycontainer | jq '.[0].NetworkSettings.Networks.myapp_network.IPAddress'
# "10.10.0.5"
```

**Mistake 2: Using container name that doesn't match**
Docker container names start with `/`. When grepping:

```bash
docker inspect /mycontainer   # works
docker inspect mycontainer    # also works
# But programmatically, .Name returns "/mycontainer" with the slash
docker inspect -f '{{.Name}}' mycontainer
# Output: /mycontainer
```

**Mistake 3: Expecting a stable IP**
Container IPs change on restart unless you assign static IPs or use DNS service discovery. Never hardcode container IPs.

```yaml
# docker-compose: use service names instead of IPs
services:
  web:
    environment:
      - DATABASE_URL=postgres://db:5432/mydb  # "db" is the service name
```

---

## Pro Tips

```bash
# One-liner: name + IP for all containers
docker ps --format '{{.Names}}' | \
  xargs -I{} sh -c 'echo -n "{}: "; docker inspect -f "{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}" {}'

# Get gateway (useful when debugging container-to-host connectivity)
docker inspect -f '{{range.NetworkSettings.Networks}}{{.Gateway}}{{end}}' mycontainer

# Get full network config in readable format
docker inspect mycontainer | jq '.[0].NetworkSettings.Networks'

# Check if container is on a specific network
docker inspect mycontainer | jq '.[0].NetworkSettings.Networks | has("myapp_network")'
```

---

## Conclusion

For a quick IP: `docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' <name>`. For scripting with multiple networks: `jq`. For inside-container inspection: `docker exec <name> hostname -I`.

Don't rely on container IPs for service-to-service communication in docker-compose — use service names. IPs change on restart; DNS-based service discovery doesn't.

---

*Related: [Docker Networking Demystified: bridge, host, and overlay](/blog/docker-networking-guide) — understand why containers get the IPs they do. [Check Open Ports in Linux](/blog/check-open-ports-linux-ss-netstat-guide) — verify which ports are accessible from the host.*
