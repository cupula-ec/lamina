/** Límites de lo que una IA externa puede enviar. Todo lo recibido es dato no confiable. */
export const LIMITS = {
  maxSlides: 60,
  /** Tamaño máximo del JSON de un borrador de contenido (bytes). */
  maxDraftBytes: 400_000,
  /** Tamaño máximo del JSON de un deck (bytes). */
  maxDeckBytes: 1_500_000,
  /** Tamaño máximo de las props de un solo componente (bytes). */
  maxPropsBytes: 32_000,
  /** Profundidad y nodos máximos de cualquier JSON recibido. */
  maxDepth: 14,
  maxNodes: 60_000,
  /** Versiones de diseño que una IA externa puede enviar por presentación. */
  maxDeckVersionsPerPresentation: 12,
  /** Llamadas por minuto y por token. */
  callsPerMinute: 60,
  /** Cuerpo HTTP máximo de una petición MCP (bytes). */
  maxRequestBytes: 2_000_000,
} as const;
