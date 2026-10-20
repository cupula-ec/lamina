# ADR-008 — Licencia y catálogo compartido

- **AGPL-3.0 + CLA** (CLA Assistant en PRs): el servicio hospedado debe publicar sus cambios; el CLA permite a Cúpula ofrecer versiones institucionales sin cerrar el código comunitario. Alternativa permisiva (MIT/Apache) descartada para que las mejoras al servicio hospedado vuelvan a la comunidad.
- **Promoción provisional → estable**: en el panel admin (instantánea, versionada en BD, el componente pasa a `scope = global`) **y** PR automático a `community/components/<Id>/` con código, manifest y fixtures (token `GITHUB_TOKEN`; si falla, la promoción queda hecha y se informa). Fusionar el PR es decisión humana.
