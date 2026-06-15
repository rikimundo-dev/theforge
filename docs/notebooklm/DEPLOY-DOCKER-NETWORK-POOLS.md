# Error: "all predefined address pools have been fully subnetted"

Si en producción ves:

```
failed to create network apps-imjmedia-theforge-xxx_default: Error response from daemon: all predefined address pools have been fully subnetted
```

es porque el daemon de Docker ha agotado los rangos por defecto para crear redes.

## Solución 1: En el servidor (donde corre Dokploy/Docker)

### A) Limpiar redes no usadas

En el host (SSH al servidor):

```bash
docker network prune -f
```

Si sigue fallando, revisar redes y borrar las que no uséis:

```bash
docker network ls
docker network rm <id_o_nombre>
```

### B) Ampliar los pools de direcciones

Editar (o crear) `/etc/docker/daemon.json` en el servidor:

```json
{
  "default-address-pools": [
    { "base": "172.17.0.0/12", "size": 20 },
    { "base": "192.168.0.0/16", "size": 24 }
  ]
}
```

Reiniciar Docker:

```bash
sudo systemctl restart docker
```

Solo las **nuevas** redes usarán estos pools; las ya creadas no cambian.

## Solución 2: Menos redes por despliegue (docker-compose)

En el compose se puede usar una sola red bridge con nombre fijo y redefinir `default` para que Compose no cree una red `_default` extra. Eso ya está aplicado en `docker-compose.yml` (red `default` con nombre `theforge-app-network`), reduciendo una red por despliegue.

Si el error persiste, la causa está en el servidor: hace falta **Solución 1** (prune y/o ampliar pools).

---

*Corpus «The Forge - by Kreo» — NotebookLM sync 2026-06-10 (pnpm). Rutas relativas al monorepo `theforge`.*
