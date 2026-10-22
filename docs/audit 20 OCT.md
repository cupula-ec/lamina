# Auditoría de UX y funcionamiento — Lámina

## Contexto

Se realizó una prueba de la aplicación **Lámina**, de Cúpula Systems, utilizando una presentación de Álgebra Lineal titulada **“Propiedades de las operaciones con matrices”**.

La prueba cubrió principalmente:

- Generación de la presentación
- Verificación de contenido
- Revisión del diseño
- Pulido final
- Publicación
- Apertura del enlace compartido
- Edición posterior a la aprobación
- Historial de versiones
- Control de uso diario

---

# Hallazgos

## 1. Verificación de contenido demasiado genérica

### Tipo
Mejora de UX

### Problema
Cuando la aplicación no puede verificar automáticamente varios elementos, muestra repetidamente mensajes como:

> “No se pudo verificar automáticamente este resultado; revísalo.”

El mensaje no indica con claridad qué contenido necesita revisión ni qué debe hacer el usuario.

### Mejora propuesta
Mostrar una tarjeta por cada elemento dudoso.

Ejemplo:

**Verificación 3 de 14**

La presentación usará esta fórmula:

`m = 2a * b`

¿La fórmula es correcta?

- Sí, aprobar
- No, corregir

Si el usuario selecciona **No, corregir**, mostrar un campo para ingresar el valor correcto.

También sería útil mostrar un resumen como:

> 9 verificados automáticamente · 5 necesitan revisión

y priorizar solo los elementos que realmente requieren intervención.

---

## 2. Mensajes de error visual demasiado técnicos

### Tipo
Problema de UX

### Problema
En la revisión del diseño aparecen mensajes como:

- `988x878 > 988x758`
- `Un elemento sobresale del área del slot`
- `Texto menor de 26px`
- `Ver captura del renderer`

Aunque estos mensajes pueden ser útiles para desarrollo, no son claros para un usuario final.

### Ejemplo observado
En la diapositiva 3 se detectó un desborde y visualmente las matrices aparecían cortadas.

### Mejora propuesta
Cambiar los mensajes técnicos por explicaciones más directas, por ejemplo:

> La matriz superior está saliendo de la diapositiva

y ofrecer acciones como:

- Corregir automáticamente
- Ignorar
- Ver dónde está el problema

Si es posible, resaltar visualmente el elemento afectado.

---

## 3. El sistema detecta errores, pero no los corrige durante el pulido

### Tipo
Bug funcional

### Problema
La aplicación detecta correctamente errores visuales durante la fase de diseño, pero después de aprobar el diseño y ejecutar el pulido final, esos errores pueden seguir presentes.

### Caso observado
En la diapositiva 3 se detectó un problema de desborde. Después de aprobar el diseño y generar la versión:

> `v3 · pulido · IA`

la matriz B seguía cortada por el lado derecho.

### Resultado esperado
Después del pulido, los errores visuales previamente detectados deberían quedar corregidos o, si no pueden corregirse, deberían seguir marcados claramente como pendientes.

### Resultado actual
El sistema identifica el error, ejecuta el pulido y entrega una versión final que todavía contiene el mismo problema.

### Recomendación
Usar los errores detectados como entrada del proceso de pulido y volver a ejecutar una verificación automática antes de marcar la presentación como lista.

---

## 4. Orden del flujo de aprobación y pulido

### Tipo
Problema de flujo / UX

### Problema
Actualmente el flujo parece ser:

1. Generar diseño
2. Detectar errores
3. El usuario aprueba el diseño
4. El sistema realiza el pulido

Esto obliga al usuario a aprobar una presentación que todavía contiene errores conocidos.

### Mejora propuesta
Cambiar el flujo a:

1. Generar diseño
2. Detectar errores
3. Corregir o pulir automáticamente
4. Volver a verificar
5. Mostrar la versión corregida
6. Aprobar o pedir cambios
7. Publicar

De esta manera, **Aprobar diseño** significaría realmente aprobar una versión ya corregida.

---

## 5. Inconsistencia entre el contador global de avisos y las miniaturas

### Tipo
Posible bug / problema de consistencia visual

### Problema
En la vista general aparece:

> `20 errores · 13 avisos`

Sin embargo, en las miniaturas solo se aprecia claramente un badge amarillo de:

> `1 aviso`

en la diapositiva 14.

Los errores rojos sí aparecen distribuidos entre varias diapositivas.

### Posible causa
Puede que una diapositiva tenga errores y avisos al mismo tiempo, pero que el badge de error esté ocultando el de aviso.

### Mejora propuesta
Mostrar ambos estados cuando existan.

Ejemplo:

> `2 errores · 1 aviso`

Esto permitiría localizar todos los problemas y haría que el resumen global coincida visualmente con las miniaturas.

---

## 6. Jerarquía del botón “Aprobar diseño”

### Tipo
Problema de UX

### Problema
Aunque la aplicación indica que existen aproximadamente 20 errores, el botón principal sigue siendo:

> Aprobar diseño

Esto puede llevar al usuario a aprobar una presentación con problemas todavía activos.

### Mejora propuesta
Dar mayor prioridad a una acción como:

> Corregir errores

y dejar:

> Aprobar de todos modos

como acción secundaria.

También se podría mostrar una confirmación si se intenta aprobar con errores pendientes.

---

## 7. Navegación y selección de diapositivas con errores

### Tipo
Mejora de UX

### Problema
En presentaciones grandes, el usuario debe revisar las diapositivas una por una y marcar manualmente cuáles quiere cambiar.

### Mejora propuesta
Agregar opciones como:

- Seleccionar todas las diapositivas con errores
- Seleccionar todas las diapositivas con avisos
- Mostrar solo diapositivas con problemas
- Error anterior
- Siguiente error
- Limpiar selección

Esto reduciría el trabajo manual durante la revisión.

---

## 8. Falta un botón rápido para copiar el enlace compartido

### Tipo
Mejora de UX

### Problema
Después de publicar con enlace, la aplicación muestra la URL, pero no existe un botón rápido de:

> Copiar enlace

El usuario debe seleccionar y copiar el texto manualmente.

Además, la interfaz indica que el enlace debe guardarse porque no se volverá a mostrar.

### Mejora propuesta
Agregar un botón:

> Copiar enlace

junto al enlace generado.

También sería útil mostrar una confirmación breve:

> Enlace copiado

---

## 9. La presentación compartida puede abrir aparentemente en blanco

### Tipo
Bug funcional / problema de UX

### Problema
Al abrir el enlace compartido, la presentación puede aparecer inicialmente con el fondo visible pero sin el contenido de la diapositiva.

El usuario debe hacer clic o avanzar para que aparezca el contenido.

Este comportamiento se observó en varias diapositivas.

### Posible causa
La presentación parece iniciar en el estado inicial de una animación o transición antes de mostrar los elementos.

### Resultado esperado
La primera diapositiva debería mostrar al menos su contenido inicial inmediatamente al abrir el enlace.

### Mejora propuesta
Una de estas opciones:

- Mostrar directamente el contenido inicial
- Ejecutar automáticamente la primera animación
- Mostrar una indicación clara como “Haz clic para comenzar”

Actualmente la pantalla puede dar la impresión de que la presentación no cargó correctamente.

---

## 10. Inconsistencia en el estado de publicación

### Tipo
Bug de interfaz / UX

### Problema
Cuando una presentación ya está en estado:

> Pública

la interfaz puede seguir mostrando un botón:

> Cambiar a pública

Esto no tiene sentido porque la presentación ya está en ese estado.

También aparece el botón:

> Publicar

aunque la presentación ya se encuentra publicada.

### Mejora propuesta
Si la presentación ya está pública:

- Cambiar el botón a `Cambiar a con enlace`
- O usar una acción general como `Guardar cambios`
- O `Actualizar visibilidad`

La interfaz debería reflejar claramente el estado actual.

### Comportamiento correcto observado
La opción **Despublicar** sí funcionó correctamente y el enlace dejó de funcionar después de despublicar.

---

## 11. Falta edición posterior a la aprobación

### Tipo
Mejora funcional / UX

### Problema
Después de aprobar la presentación, no se encuentra una opción clara para editar una diapositiva individual.

Si el usuario detecta después un error pequeño o desea cambiar algo, no puede modificar fácilmente:

- Texto
- Fórmulas
- Imágenes
- Información
- Posición o tamaño de elementos

### Mejora propuesta
Agregar un botón:

> Editar diapositiva

desde la vista final.

Idealmente podría haber dos niveles:

### Editar contenido
- Texto
- Fórmulas
- Imágenes
- Datos

### Editar diseño
- Posición
- Tamaño
- Distribución
- Estilo

Esto permitiría realizar ajustes pequeños sin regenerar toda la presentación.

---

# Aspectos positivos

## 12. Visualización clara del uso diario

### Tipo
Punto positivo

La sección **“Tu uso de hoy”** muestra de forma clara cuántas acciones ha utilizado el usuario y cuál es el límite disponible para cada categoría.

Se muestran contadores como:

- Presentaciones nuevas
- Regeneraciones de contenido
- Regeneraciones de diseño
- Componentes nuevos

La combinación de contador numérico y barra de progreso permite entender rápidamente cuánto uso queda disponible.

También es útil que se indique cuándo se renuevan los límites.

### Valor para el usuario
Esta sección es clara, simple y ayuda a evitar confusión sobre cuánto uso queda disponible durante el día.

---

## 13. Historial de versiones

### Tipo
Punto positivo

La aplicación permite consultar versiones anteriores de la presentación.

Esto es útil porque el usuario puede revisar cómo estaba la presentación antes de:

- Una regeneración
- Un cambio de diseño
- Un pulido
- Una modificación posterior

### Valor para el usuario
El historial de versiones da más control y seguridad durante la edición.

Permite comparar cambios y volver a una versión anterior si el resultado nuevo no convence.

Es una función especialmente útil en presentaciones que pasan por varias etapas de generación y corrección.

---

# Prioridad sugerida

## Alta
1. El pulido no corrige errores ya detectados
2. La presentación compartida puede abrir aparentemente en blanco
3. Inconsistencia de estado al mostrar “Cambiar a pública” cuando ya está pública

## Media
4. Flujo de aprobación antes del pulido
5. Mensajes de error demasiado técnicos
6. Contador de avisos no coincide claramente con las miniaturas
7. Falta de edición posterior a la aprobación

## Baja / Mejora de experiencia
8. Botón para copiar enlace
9. Navegación rápida entre errores
10. Selección masiva de diapositivas con problemas
11. Mejor jerarquía visual entre “Corregir errores” y “Aprobar diseño”

---

# Resumen general

La aplicación tiene una base funcional sólida y varias decisiones positivas, especialmente el historial de versiones y el control visible del uso diario.

El principal problema encontrado es que el sistema **detecta errores correctamente, pero no siempre transforma esa detección en una corrección efectiva antes de publicar**.

Los puntos que más mejorarían la experiencia serían:

- Corregir automáticamente los problemas antes de pedir aprobación
- Volver a verificar después del pulido
- Evitar que una presentación final conserve errores ya detectados
- Convertir mensajes técnicos en acciones claras
- Mejorar la coherencia de los estados de publicación
- Permitir edición posterior sin regenerar toda la presentación
- Facilitar acciones comunes como copiar el enlace o navegar entre errores

En general, el sistema de detección parece útil y la aplicación tiene buenas bases de control e historial, pero la experiencia sería más completa si los errores detectados se convirtieran directamente en correcciones, decisiones simples o acciones concretas para el usuario.
