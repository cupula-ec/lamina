# Lámina — Plan de producto y arquitectura

> **Estado:** brief vivo para análisis y planificación técnica.  
> **Responsable del producto:** Cúpula Systems.  
> **Público inicial:** docentes ecuatorianos, comenzando con un profesor de Cálculo.  
> **Licencia:** open source; evaluar y documentar una licencia permisiva adecuada antes de publicar el repositorio.  
> **Fecha objetivo inicial:** viernes 23 de octubre de 2026.  
> **Nombre provisional:** Lámina. No asumir que el nombre, dominio o marca estén disponibles.

## 1. Instrucción al agente de desarrollo

Este documento define la visión, restricciones, experiencia deseada y prioridades; **no pretende decidir por adelantado todos los detalles técnicos**. Antes de implementar, analiza el problema como arquitecto y líder técnico: identifica contradicciones, riesgos, decisiones costosas de revertir y requisitos que faltan. Propón la arquitectura más simple que permita cumplir el flujo completo y evolucionar después sin reescribirlo todo.

En particular:

1. Evalúa y recomienda el stack apropiado para un repositorio nuevo, considerando la fecha límite, calidad del resultado, mantenibilidad, despliegue económico y familiaridad del ecosistema. No selecciones una tecnología solo por moda.
2. Evalúa si Google ADK encaja realmente en este producto, comparándolo con una orquestación más sencilla. No introduzcas un framework de agentes si un workflow explícito y persistente satisface mejor el MVP.
3. Verifica la disponibilidad y las condiciones actuales de los proveedores de modelos, cuotas gratuitas, búsqueda web, límites, licencias y restricciones de uso. Los planes gratuitos cambian: no los describas como ilimitados ni bases el sistema en un solo proveedor. Prefiere documentación oficial actual y deja las decisiones verificables registradas.
4. Distingue las **decisiones firmes del producto** de las decisiones técnicas que tú debes investigar. Para cada decisión importante, presenta la opción recomendada, alternativas, coste, riesgo y motivo. Evita sobrediseñar.
5. Propón una ruta crítica realista para tener un flujo completo demostrable el viernes 23 de octubre de 2026. Mantén ese objetivo; si una parte no cabe con seguridad, explícita el recorte mínimo necesario, sin fingir que está terminada.
6. Prioriza un recorrido vertical funcional y comprobable de inicio a fin sobre muchos módulos a medio hacer. Define los criterios de aceptación y pruebas antes de desarrollar cada tramo.
7. No empieces generando componentes, servicios o abstracciones por anticipado. Primero valida la arquitectura mínima y los contratos entre etapas. Mantén el proyecto comprensible para un equipo pequeño y para futuros agentes de programación.
8. Cuando exista incertidumbre no bloqueante, elige una opción razonable, documenta la suposición y continúa. Pregunta solo cuando una decisión no pueda inferirse de este brief y pueda cambiar sustancialmente el producto.

Al iniciar el trabajo, entrega primero un diagnóstico técnico breve y el plan de ejecución por fases, con decisiones pendientes y riesgos. Después construye el proyecto siguiendo ese plan, actualizando este documento o añadiendo ADRs cuando una decisión cambie. No inventes resultados de pruebas, disponibilidad de APIs ni despliegues.

## 2. Visión del producto

Lámina es una plataforma web para que un docente cree presentaciones educativas de alta calidad mediante IA, con dos capacidades diferenciadoras:

- **Investigación y preparación del contenido:** investiga un tema, organiza la información, cita fuentes cuando corresponda y permite al profesor editar y aprobar lo que se enseñará antes de producir diapositivas.
- **Composición visual controlada por la plataforma:** un agente selecciona y combina componentes visuales reutilizables dentro de un motor de presentación común. La IA no necesita inventar desde cero la geometría, navegación y comportamiento de cada slide.

El docente debe sentir que dirige a un colaborador: puede revisar, corregir, pedir una nueva versión y aprobar cada etapa. El sistema conserva las versiones y el contexto de la presentación para que los cambios sean iterativos, no una secuencia de generaciones desconectadas.

Cúpula Systems alojará inicialmente el servicio sin coste para docentes ecuatorianos. Es open source y debe poder mantener límites de uso razonables aunque las APIs gratuitas no sean ilimitadas. En el futuro se podrá evaluar financiación, planes u opciones de pago, sin convertir esa posibilidad en un bloqueo para el MVP.

### Objetivo de experiencia

El profesor indica el tema, aporta materiales si los tiene, revisa una propuesta de contenido, aprueba, revisa el diseño, solicita ajustes y publica o comparte una presentación web. Debe quedar claro en todo momento qué etapa está activa, qué necesita su aprobación, qué está procesando el sistema y cuáles son los límites de uso aplicables.

## 3. Público y alcance inicial

### Usuario inicial

Un docente ecuatoriano, inicialmente de Cálculo, que quiere obtener una presentación didáctica, visual y matemáticamente fiable sin redactar manualmente cada diapositiva.

### Áreas académicas del MVP

- Cálculo.
- Matemática general.
- Álgebra.
- Física.

El MVP debe tratar estas áreas como contenido matemático y científico, no como una plantilla de texto genérica. La presentación debe poder incluir, cuando ayude a explicar el concepto:

- Fórmulas y notación matemática legible.
- Derivaciones o pasos intermedios, con explicaciones comprensibles.
- Gráficas de funciones, ejes, puntos, leyendas y curvas.
- Diagramas, esquemas, tablas, vectores y figuras geométricas.
- Unidades, variables, ejemplos resueltos y comprobaciones.

No basta con que la IA afirme que un resultado matemático es correcto: el diseño del sistema debe permitir validaciones deterministas cuando sean viables y debe dejar visible la incertidumbre o los supuestos de las fuentes. No prometer exactitud absoluta.

## 4. Alcance del objetivo del 23 de octubre

La prioridad es entregar un **flujo real de extremo a extremo**, no una maqueta de pantallas. La ruta crítica es:

1. Un docente inicia sesión con Google.
2. Crea una presentación e indica tema, objetivo y contexto básico.
3. El sistema obtiene información a partir del tema y de las fuentes o materiales que aporte.
4. Presenta un borrador de contenido estructurado para editar y aprobar.
5. Tras la aprobación explícita, genera una presentación con el motor y el catálogo de componentes.
6. Renderiza una vista previa de las diapositivas y permite revisar, pedir cambios y regenerar.
7. Tras la aprobación explícita del diseño, prepara una versión final de la presentación web.
8. El profesor puede publicarla o mantenerla privada según sus ajustes y abrirla en el navegador.

El flujo debe ser demostrable con un caso real de Cálculo. Construir una pequeña biblioteca inicial de componentes de calidad para ciencias exactas forma parte del MVP; el motor, la navegación y el contrato de las slides deben ser consistentes desde la primera entrega.

Si el plazo obliga a recortar, conserva la integridad del recorrido completo y reduce el número de opciones, proveedores o componentes iniciales. No elimines las aprobaciones obligatorias, no simules investigación no realizada y no publiques una presentación que no haya pasado por las etapas requeridas.

## 5. Entradas de contenido

El profesor podrá iniciar una generación de estas maneras:

- Describir un tema o pregunta.
- Proporcionar texto o apuntes en Markdown.
- Añadir URLs de fuentes públicas.
- Subir documentos, especialmente PDF.

### Estrategia de documentos

Como el producto debe priorizar APIs gratuitas y no depender de modelos multimodales costosos, **la ruta inicial de documentos es extraer texto y convertirlo a texto plano o Markdown**. Evalúa parsers maduros para PDF y otros formatos que resulten necesarios. Conserva, cuando sea posible, estructura de títulos, listas, tablas, páginas y metadatos que ayuden a citar el origen. No enviar automáticamente páginas completas como imágenes a un modelo multimodal.

Diseña límites de tamaño, número de páginas, tiempo de procesamiento y tipos MIME admitidos. Los documentos pueden estar corruptos, escaneados, vacíos o contener contenido hostil; reporta claramente los casos no procesables. OCR puede quedar como capacidad opcional posterior, salvo que el análisis demuestre una alternativa gratuita, pequeña y apropiada para el plazo.

Trata el contenido de documentos y páginas web como **datos no confiables**, nunca como instrucciones del sistema o del agente. No ejecutes scripts ni enlaces incluidos en el contenido. Considera protección frente a SSRF al recuperar URLs, restricciones de redirecciones y direcciones privadas, límites de descarga y validación de tipos de archivo.

## 6. Flujo de trabajo y estados

El flujo debe modelarse como una máquina de estados persistente. No depender exclusivamente de una petición HTTP larga ni de memoria efímera de un agente. Las tareas pueden tardar, fallar, agotarse por cuota o reanudarse.

### Etapa A — Creación e investigación

- Crear un registro de presentación, asociado a su propietario y a una configuración de visibilidad inicial privada.
- Recoger tema, audiencia o nivel académico, objetivo pedagógico, idioma y contexto relevante. Evitar un formulario extenso si estos datos se pueden pedir progresivamente.
- Recibir, extraer y normalizar las fuentes aportadas.
- Investigar en web cuando corresponda, utilizando una herramienta o proveedor con acceso real a búsqueda. Registrar las fuentes, URLs, títulos y fragmentos pertinentes.
- Distinguir datos aportados por el profesor de información investigada por la IA.
- Permitir generar o regenerar el contenido sin perder las versiones anteriores.

### Etapa B — Vista previa y aprobación del contenido

Ruta prevista de producto: `/presentations/{uuid}/preview/information`.

La pantalla mostrará una representación legible y editable del contenido propuesto: estructura por secciones o diapositivas, explicaciones, ejemplos, fórmulas, gráficos requeridos y referencias. El formato visible podrá ser Markdown sencillo, pero analiza si internamente conviene normalizar el contenido a un esquema tipado y versionado, en vez de tratar el Markdown como contrato único.

Acciones mínimas:

- Editar información manualmente.
- Aprobar explícitamente el contenido para continuar.
- Solicitar una revisión sin feedback detallado.
- Enviar feedback específico y regenerar conservando lo aprobado cuando sea posible.
- Ver fuentes y entender qué afirmaciones se apoyan en ellas.

La transición al diseño se bloquea hasta que el docente apruebe esta etapa. Cada revisión crea una versión identificable; no se sobrescribe silenciosamente el contenido aprobado.

### Etapa C — Planificación y generación del diseño

Después de aprobar el contenido, el sistema convierte su estructura en un plan de diapositivas y utiliza el motor de presentaciones y el catálogo de componentes.

El agente de diseño debe decidir **qué comunicar en cada slide y qué componente usar**, no reimplementar de forma arbitraria los mecanismos base de layout, navegación y exposición. Debe poder razonar sobre la finalidad didáctica, legibilidad, densidad de contenido y continuidad narrativa.

Los componentes científicos —por ejemplo, gráficos de funciones, fórmulas destacadas, pasos de una demostración o diagramas físicos— deben ser ciudadanos de primera clase. El catálogo inicial debe priorizar robustez, legibilidad y consistencia sobre cantidad.

### Etapa D — Vista previa y aprobación del diseño

Ruta prevista de producto: `/presentations/{uuid}/preview/design`.

- Renderizar las slides con el mismo motor que se utilizará en la vista final.
- Permitir navegar y revisar cada diapositiva.
- Detectar problemas evidentes: desbordamientos, texto demasiado pequeño, regiones vacías inesperadas, fórmulas cortadas y componentes que fallan.
- Permitir feedback libre o instrucciones de modificación específicas.
- Regenerar selectivamente cuando sea viable, manteniendo las partes aprobadas o indicando con claridad qué cambiará.
- Exigir la aprobación explícita del docente antes de la etapa final.

Las vistas previas pueden generarse con Playwright en un worker o tarea aislada, con colas, concurrencia limitada, timeouts, limpieza de artefactos y caché por versión. Evita que trabajos de renderizado intensivos saturen el servidor web. Para el MVP, una vista previa funcional en navegador puede ser primaria; las capturas estáticas apoyan revisión y depuración.

### Etapa E — Pulido final y publicación

Después de aprobar el diseño se puede ejecutar una pasada de finalización: transiciones, animaciones discretas, progresión de elementos y detalles de exposición. Las animaciones deben ayudar a enseñar, no ser un efecto decorativo indiscriminado. No deben cambiar el significado del contenido ni introducir inestabilidad de layout.

Luego el docente podrá:

- Abrir la presentación en modo de exposición en el navegador.
- Publicarla mediante un enlace accesible según su configuración de visibilidad.
- Mantenerla privada si así lo decide.

Ruta prevista de visualización: `/presentations/{uuid}/view`.

El enlace privado no debe depender de que un UUID sea imposible de adivinar: aplica autorización real, tokens compartidos revocables u otro mecanismo apropiado, de acuerdo con el modelo de compartir que recomiende el agente. No publicar por defecto. No se requiere exportación a PDF ni PowerPoint como salida inicial; la experiencia nativa es web.

## 7. Motor unificado de presentaciones

Diseña un motor reutilizable e independiente del modelo generativo. Es una de las piezas centrales del producto y debe acordarse antes de permitir que el agente genere muchas diapositivas.

El motor debe tener un contrato claro y versionado para representar, al menos:

- Documento de presentación y sus metadatos.
- Orden y contenido de las diapositivas.
- Referencias a componentes y sus propiedades validadas.
- Tema visual, tipografía, colores, espaciado y reglas de layout.
- Fórmulas, gráficos, diagramas y referencias cuando corresponda.
- Navegación, modo de exposición y transiciones.
- Versión del motor y de los componentes para poder reproducir una generación anterior.

Analiza cómo representar slides sin obligar a la IA a tomar decisiones geométricas de bajo nivel. Prefiere una estructura declarativa, validable y renderizable de forma determinista. Los modelos no deben poder insertar scripts arbitrarios en el documento ni desactivar las protecciones del motor.

La presentación publicada y la vista previa deben usar el mismo renderer o renderers equivalentes con un contrato compartido. Evita que lo revisado por el docente sea visualmente distinto de lo publicado.

## 8. Sistema de componentes y ciclo de vida

El catálogo de componentes no es solo una galería visual: es una capacidad central que diferencia al producto. Debe versionarse, documentarse y acompañarse de ejemplos para que un agente pueda escoger componentes existentes de forma fiable.

### Catálogo y selección

Cada componente estable debería declarar, como mínimo:

- Identificador y versión.
- Propósito didáctico y casos de uso.
- Esquema de propiedades y valores válidos.
- Restricciones, dependencias y requisitos de datos.
- Ejemplos y criterios visuales.
- Pruebas automáticas y estado de aprobación.

El agente debe consultar el catálogo y explicar/registrar qué componentes seleccionó y por qué. Debe ser capaz de detectar que la biblioteca no tiene una representación adecuada para el concepto solicitado.

### Crear componentes durante una presentación en curso

**No relegar la creación de componentes nuevos a una fase futura.** Si durante la generación la IA detecta que falta un componente, debe poder solicitar su creación a un agente especializado, incorporarlo al trabajo actual y volver a renderizar la presentación para que el profesor se beneficie de la mejora sin esperar a una actualización general de la plataforma.

Flujo propuesto, que el agente técnico debe validar y mejorar:

1. El agente de diseño registra la necesidad y el propósito didáctico del componente.
2. El agente especializado consulta el catálogo para evitar duplicados y propone una implementación con propiedades tipadas.
3. Se ejecutan validaciones automáticas suficientes para permitir el uso limitado en la presentación en curso.
4. Si supera los controles, el componente queda disponible en una **zona de trabajo aislada y versionada** de esa presentación, con estado provisional. La generación actual puede utilizarlo inmediatamente y producir nuevas vistas previas.
5. El docente evalúa la presentación con el componente dentro del flujo normal de revisión. Los fallos permiten corregirlo o descartarlo.
6. El componente se conserva como propuesta no publicada. Para entrar al catálogo compartido/estable que puedan utilizar todos los docentes, requiere revisión humana, pruebas adecuadas y aprobación explícita.
7. Los cambios posteriores en el repositorio principal pueden refinar el componente sin modificar retroactivamente presentaciones ya publicadas.

La diferencia fundamental es **disponibilidad inmediata y local para la presentación actual, publicación compartida solo después de revisión**. El tiempo de incorporación no debe depender de un despliegue global ni de que el mantenedor fusione manualmente cada idea; el control de calidad sí debe preceder a la exposición pública del componente.

### Seguridad de componentes generados

Trata el código producido por IA como código no confiable. No lo ejecutes dentro del proceso principal ni permitas que tenga acceso directo a secretos, red, sistema de archivos del host o datos de otros docentes. Diseña un mecanismo de aislamiento acorde al stack y al hosting elegidos: validaciones de esquema y tipos, build/test aislado, límites de recursos, políticas de capacidades permitidas y snapshots cuando proceda.

Las pruebas automatizadas no sustituyen la aprobación humana del catálogo compartido. El componente provisional debe quedar claramente identificado y sujeto a las restricciones que se acuerden durante el análisis técnico. Define cómo revertirlo si falla y cómo impedir que una generación defectuosa bloquee todo el trabajo.

## 9. Agentes y proveedores de IA

Los modelos deben ser intercambiables según su función, con contratos internos estables y sin acoplar el flujo de negocio a una API concreta.

Roles lógicos iniciales:

1. **Research:** investigación del tema, búsqueda web, recopilación de fuentes y material contextual. Si el proveedor del modelo no ofrece acceso real a Internet, la búsqueda debe realizarse mediante una herramienta o servicio separado; no simular navegación.
2. **Contenido/pedagogía:** estructura y explica la materia, prepara el borrador editable, conserva referencias y adapta el material al nivel del alumnado.
3. **Diseño y autoría de slides:** planifica la narrativa visual, selecciona componentes y entrega la representación declarativa consumida por el motor.
4. **Especialista en componentes:** propone componentes nuevos cuando el catálogo sea insuficiente, implementa el prototipo aislado y devuelve pruebas/resultados.
5. **Validación/revisión:** verifica estructura, referencias, propiedades de componentes, contenido matemático cuando existan métodos deterministas y problemas de renderizado. Puede ser un conjunto de validadores normales, no necesariamente otro modelo.

No se exige que cada rol utilice un modelo distinto. Determina mediante evaluación práctica si separar modelos aporta suficiente calidad frente al coste y la latencia.

### Capa de proveedores

Diseña adaptadores por función o una interfaz común apropiada, con configuración independiente por entorno. La selección de modelos debe poder cambiar sin rehacer el workflow. Registra proveedor, modelo, latencia, resultado, fallos y uso estimado cuando esa información esté disponible; evita registrar datos sensibles innecesarios.

Prioriza cuotas gratuitas y opciones open source, pero considera que sus límites pueden ser bajos, variar o desaparecer. El sistema debe responder correctamente cuando una cuota se agota: reintentos limitados, espera o alternativa configurada, guardado del estado y mensajes claros al usuario. No permitas bucles de agentes que consuman cuota de forma infinita.

Define límites configurables por docente, presentación y etapa: número de regeneraciones, concurrencia, tokens o gasto estimado si el proveedor informa esos datos. Cuando no sea posible conocer el coste real con exactitud, utiliza límites conservadores de llamadas y tamaño del contexto.

Las claves privadas pertenecen al servidor y nunca deben exponerse al navegador ni incluirse en logs. No exigir que el profesor proporcione su propia API key para que el MVP funcione. Las claves aportadas por usuarios podrían evaluarse como opción futura, con un diseño específico de cifrado, permisos y eliminación, pero no son requisito inicial.

## 10. Arquitectura de aplicación y persistencia

Propón una arquitectura proporcional al MVP: preferir un despliegue sencillo con límites claros entre interfaz, API/workflow, persistencia y tareas en segundo plano antes que introducir numerosos microservicios.

El sistema necesita persistir:

- Usuarios y datos mínimos de su perfil.
- Presentaciones y su propietario.
- Estado actual del workflow y registro de las aprobaciones.
- Versiones de contenido y diseño, feedback del profesor y marcas de tiempo.
- Fuentes consultadas y materiales extraídos, de forma que se puedan revisar y gestionar.
- Metadatos de tareas, errores recuperables, reintentos y artefactos de preview.
- Catálogo compartido, propuestas de componentes y sus versiones/estados.
- Preferencias de privacidad y datos básicos de uso para limitar cuotas.

Analiza la persistencia y el almacenamiento de archivos más adecuados para el hosting gratuito disponible. Evita dar por hecho que un plan gratuito ofrece almacenamiento persistente, cron jobs, workers o tiempos de ejecución ilimitados. Las tareas deben tener identificadores y estados para que una caída o una recarga de página no pierda el trabajo.

Asegura separación por propietario y autorización en el servidor. No confíes en IDs ocultos en el frontend. Añade límites de solicitud, validaciones, protección contra CSRF donde corresponda y un manejo cuidadoso de sesiones OAuth.

## 11. Endpoints y superficies previstas

Los siguientes paths describen rutas deseadas de producto. El agente deberá decidir si conviene usarlos como rutas de interfaz, endpoints de API o una combinación coherente con el stack; no duplicar rutas innecesariamente.

- `/presentations/{uuid}/preview/information`: editar, revisar y aprobar el contenido.
- `/presentations/{uuid}/preview/design`: revisar el diseño, solicitar cambios y aprobarlo.
- `/presentations/{uuid}/view`: reproducir la presentación web publicada según sus permisos.

Definir contratos para crear una presentación, obtener estado de trabajos, enviar feedback, aprobar/rechazar etapas, consultar versiones, cancelar/reintentar trabajos y publicar/despublicar. El workflow debe rechazar transiciones inválidas —por ejemplo, pasar a diseño sin aprobación del contenido— incluso si se invoca directamente la API.

Usa operaciones idempotentes donde tenga sentido y evita crear generaciones duplicadas por doble clic, reintentos de red o recargas de página. El frontend debe mostrar estados reales del trabajo, errores recuperables y acciones disponibles.

## 12. Interfaz, dashboard y changelog

La experiencia debe sentirse como una herramienta docente refinada, no como una consola de agentes. Diseña una interfaz coherente, rápida, accesible y adaptable a móvil y escritorio, con foco en la pantalla grande para edición y exposición.

Superficies mínimas:

- Landing pública que explique el beneficio, el carácter open source y el servicio gratuito inicial.
- Inicio de sesión con Google.
- Dashboard del docente con sus presentaciones, estados y acciones principales.
- Flujo de creación y aportación de materiales.
- Revisión del contenido y del diseño, con aprobación obligatoria en cada etapa.
- Modo de presentación final.
- Historial básico de cambios/versiones y errores recuperables.
- Módulo visible de **Novedades / Changelog** dentro del dashboard, que comunique las mejoras de Lámina de manera clara y útil. Debe poder alimentarse desde un archivo o fuente mantenible en el repositorio y mostrar cuándo se incorporaron cambios, sin convertir cada release en publicidad molesta.
- Estados de cuota o capacidad cuando afecten a una acción, con explicación del motivo y de cuándo puede reanudarse.

No es necesario construir en el MVP un sistema comercial completo, facturación, administración empresarial, analítica avanzada, exportación de PowerPoint ni un editor libre comparable en alcance con Canva. Sí conviene evitar decisiones que hagan imposible incorporar esos productos más adelante.

## 13. Privacidad, seguridad y responsabilidad

- Los materiales y presentaciones son privados por defecto.
- Un profesor solo puede leer o modificar recursos que le pertenezcan o que se hayan compartido explícitamente.
- La publicación es una acción explícita y revocable.
- No usar documentos privados para entrenar modelos ni enviarlos a proveedores adicionales sin que el propósito y el tratamiento de datos estén claros.
- Definir retención y eliminación de documentos extraídos, fuentes, tareas y versiones.
- No exponer claves de proveedores, tokens OAuth ni credenciales en el cliente, logs, artefactos de Playwright o componentes generados.
- Sanitizar contenido y referencias, bloquear ejecución de código arbitrario y aislar componentes y renderizadores.
- Aplicar límites de tamaño, tiempo, concurrencia y consumo para reducir abusos y costes inesperados.
- Mostrar las fuentes cuando se haya investigado en la web y permitir que el docente compruebe su pertinencia.
- Diferenciar material citado, generado y editado por el profesor cuando ayude a la trazabilidad.
- Prever que el proveedor o el parser pueden devolver contenido incompleto o incorrecto; no ocultar fallos ni convertir silenciosamente una fuente inaccesible en una afirmación verificada.

## 14. Calidad y criterios de aceptación

La definición exacta de pruebas queda a criterio del análisis técnico, pero antes de dar el flujo por terminado debe comprobarse al menos lo siguiente:

### Flujo funcional

- Una cuenta autorizada puede iniciar sesión, crear una presentación y volver a ella después de recargar.
- Se puede generar contenido a partir de un tema sin documentos adjuntos.
- Se puede incorporar al menos un documento de texto/PDF mediante extracción a texto y mostrar un error entendible cuando no se pueda procesar.
- Se pueden incorporar URLs, y las referencias realmente utilizadas se conservan cuando la investigación web está disponible.
- El profesor puede editar el contenido, enviar feedback y generar una nueva versión.
- El sistema no puede pasar a diseño sin aprobación explícita del contenido.
- La presentación de Cálculo resultante utiliza varios componentes reales del catálogo, incluyendo cuando corresponda fórmulas y un gráfico legible.
- El profesor puede revisar el diseño, pedir una iteración y aprobarlo.
- La etapa final lleva a una presentación navegable en el navegador.
- Los controles de publicación/privacidad se aplican en el servidor.
- Se conservan el estado y las versiones cuando una tarea falla o la página se recarga.

### Componentes

- El catálogo declara propiedades válidas y el renderer valida sus entradas.
- Se prueba el camino de solicitar un componente que aún no existe, producir una versión provisional, validarla y usarla en la presentación en curso.
- El nuevo componente provisional no aparece como componente público estable hasta recibir aprobación humana.
- Un componente que no supera los controles no se ejecuta en el proceso principal ni interrumpe todo el trabajo.

### Robustez y presentación

- Probar dimensiones de escritorio y móvil y el modo de exposición elegido.
- Detectar desbordamientos y errores de renderizado en una selección representativa de slides.
- Renderizar previews con concurrencia y tiempo limitados.
- Confirmar que la versión revisada y la versión publicada se corresponden.
- Verificar que los límites de cuota, fallos de proveedor, tiempos de espera y reintentos no generan loops costosos.

### Seguridad

- Verificar aislamiento entre dos cuentas de prueba.
- Comprobar que los recursos privados no son accesibles sin autorización.
- Comprobar que los materiales importados no pueden convertirse en instrucciones privilegiadas.
- Comprobar que componentes generados no tienen acceso libre a red, secretos o archivos del host.

No declarar un criterio como cumplido hasta contar con una prueba, una verificación manual documentada o evidencia equivalente.

## 15. Roadmap

### Fase 0 — Análisis y decisiones críticas

- Examinar opciones actuales de stack, alojamiento gratuito, OAuth, persistencia, proveedores de modelos, búsqueda web, parsers y renderizado.
- Definir contratos de presentación, componentes y workflow.
- Identificar secretos y configuración necesarios para desarrollo y despliegue.
- Fijar un caso de demostración concreto de Cálculo y criterios de aceptación.

### Fase 1 — Flujo completo para el 23 de octubre

- Autenticación Google y separación de datos por docente.
- Crear y persistir una presentación.
- Investigar/generar el borrador de contenido con fuentes cuando estén disponibles.
- Importar texto/Markdown, URLs y al menos el camino práctico de PDF a texto.
- Revisión, edición, feedback, versionado y aprobación obligatoria de información.
- Motor de slides y catálogo inicial priorizado para Cálculo/Matemática/Álgebra/Física.
- Selección de componentes y generación de presentación a partir del contenido aprobado.
- Solicitud al especialista de un componente ausente, validación y uso provisional en la presentación activa.
- Revisión visual, previews, iteración y aprobación obligatoria del diseño.
- Pulido final mínimo y presentación web publicable o privada.
- Dashboard y changelog básico; mensajes claros al fallar una cuota o un trabajo.
- Despliegue demostrable y ejecución del camino de aceptación de inicio a fin.

Esta fase debe demostrar un caso completo y no pretende incluir un catálogo enorme ni múltiples proveedores plenamente optimizados. Cualquier simulación en una demostración debe marcarse como tal y no reemplazar una funcionalidad comprometida.

### Fase 2 — Estabilización y ampliación

- Mejorar cobertura de pruebas, accesibilidad, diseño responsivo y manejo de trabajos largos.
- Añadir componentes tras validar necesidades reales de docentes.
- Mejorar selectividad de regeneración, comparación de versiones y recuperación de trabajos fallidos.
- Afinar investigación y citación, importación de documentos y límites de seguridad.
- Evaluar varios proveedores con pruebas comparables de calidad, latencia, límites y resiliencia.
- Publicar documentación para contribuir al catálogo y ejecutar el sistema localmente.

### Fase 3 — Servicio abierto para docentes

- Endurecimiento de permisos, privacidad, observabilidad, copias de seguridad y restauración según las capacidades reales de hosting.
- Flujo sostenible de mantenimiento y aprobación de componentes compartidos.
- Documentación, guía de contribución, releases y proceso de changelog.
- Evaluar cómo verificar elegibilidad de docentes ecuatorianos sin recopilar más datos personales de los necesarios.
- Definir límites transparentes y mecanismos contra abuso compatibles con el alojamiento gratuito.

### Fase 4 — Evolución del producto

Considerar según uso real: exportaciones adicionales, biblioteca de plantillas, colaboración, duplicación de presentaciones, bibliotecas por institución, analítica de aprendizaje de uso, editor manual más avanzado, opciones de despliegue institucional y modelos de sostenibilidad económica. Estas mejoras no deben desviar al equipo de validar primero la calidad pedagógica, visual y técnica del núcleo.

## 16. Métricas iniciales

Evita métricas complejas sin utilidad inmediata. Durante el MVP registra lo mínimo para responder:

- ¿Cuántas presentaciones llegan desde creación hasta aprobación final?
- ¿En qué etapa se producen errores o abandonos?
- ¿Cuántas iteraciones suelen necesitar contenido y diseño?
- ¿Qué componentes fallan, se repiten o requieren una alternativa?
- ¿Cuánto tardan los trabajos y con qué frecuencia se agotan cuotas?
- ¿El docente puede volver a abrir y compartir una presentación aprobada?

La instrumentación debe respetar la privacidad y no registrar innecesariamente el contenido íntegro de las presentaciones.

## 17. Entregables de ingeniería esperados

El agente de código decidirá la estructura final del repo, pero debe dejar como mínimo:

- Aplicación funcional, no solo diseño estático.
- Instrucciones reproducibles para desarrollo local y despliegue.
- Ejemplo de variables de entorno sin secretos reales y validación de configuración.
- Migraciones o esquema persistente y estrategia explícita de archivos/tareas.
- Contratos tipados y versionados para presentación y componentes.
- Adaptadores configurables para proveedores de IA y herramienta de investigación.
- Tests automatizados para flujo crítico, autorización, validación de componentes y renderizado.
- Documentación de decisiones técnicas importantes y limitaciones conocidas.
- Changelog visible y mantenible.
- Un ejemplo de presentación de Cálculo que demuestre el flujo completo.

## 18. Lo que no se debe asumir

- Que una API gratuita seguirá siendo gratuita, ilimitada o disponible en el entorno de producción.
- Que un nombre provisional o dominio está libre.
- Que el modelo de IA puede navegar por Internet sin una herramienta real de búsqueda.
- Que una ejecución de agente es persistente o recuperable por defecto.
- Que un componente generado por IA es seguro porque compila o porque pasa una prueba visual.
- Que el contenido matemático es correcto solo porque lo generó un modelo.
- Que una URL difícil de adivinar sustituye a la autorización.
- Que todos los documentos PDF contienen texto extraíble.
- Que el motor de presentaciones, el catálogo de componentes y el flujo de agentes deban implementarse como microservicios separados.
- Que las funciones futuras deban construirse antes de validar el recorrido inicial.

## 19. Preguntas que el agente debe resolver en su análisis

No respondas estas preguntas por intuición si se pueden comprobar o comparar rápidamente. Deja las decisiones y sus razones documentadas:

1. ¿Qué stack y modalidad de despliegue permiten tener el flujo completo el viernes sin crear una deuda técnica desproporcionada?
2. ¿Qué parte requiere de verdad un agente y qué parte debe ser un workflow explícito con pasos deterministas?
3. ¿Conviene usar Google ADK para orquestar el flujo o introduce complejidad innecesaria para la primera versión?
4. ¿Cuál es el contrato mínimo de una presentación declarativa que permita fórmulas, gráficos, transiciones y una revisión fiel en navegador?
5. ¿Cómo aislar de forma práctica los componentes generados, permitirles uso provisional en una sola presentación y promocionarlos después al catálogo estable?
6. ¿Cuál es el mecanismo más simple para trabajos largos, estados persistentes, colas, reintentos y renderizado Playwright con los límites del hosting elegido?
7. ¿Qué combinaciones reales y verificables de modelos, APIs gratuitas y herramientas de búsqueda funcionan hoy para cada rol?
8. ¿Qué límites deben implementarse desde el MVP para evitar bucles, abuso de APIs y costes imprevistos?
9. ¿Qué bibliotecas sirven mejor para renderizar expresiones matemáticas y gráficas científicas con salida estable?
10. ¿Cómo garantizar que el diseño aprobado es el mismo que se publica y que la aprobación no puede eludirse mediante llamadas directas a endpoints?
11. ¿Qué controles mínimos de seguridad, accesibilidad y privacidad son imprescindibles desde la primera entrega?
12. ¿Qué funciones se deben aplazar si el calendario amenaza la integridad del flujo de extremo a extremo?

---

**Principio rector:** Lámina no debe ser solo un prompt que devuelve diapositivas. Debe ser un flujo de trabajo reproducible y revisable en el que la IA investiga y compone, el motor garantiza consistencia, los componentes pueden mejorar de inmediato una presentación en curso y el docente conserva la última palabra antes de publicar.
