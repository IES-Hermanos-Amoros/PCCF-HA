// Las fichas de situación de aprendizaje, del lado del navegador: dónde están
// guardadas, cómo se leen y cómo se vuelven a escribir. Sin DOM y sin red, para
// que la pantalla se quede solo con la pantalla.
//
// La LÓGICA de la ficha —la forma, la tabla que sale impresa, el resumen SA × RA,
// renumerar, duplicar, mover— está en `core/sa.js`, la misma que usa el motor del
// PDF. Aquí vive únicamente lo que es propio de la aplicación: de qué apartado
// sale la lista y en qué forma se devuelve al `PATCH`. Es el mismo reparto que
// hace `docs/mockup-v2/js/sa.js` con el `localStorage` del prototipo.
//
// DÓNDE ESTÁN LAS FICHAS DE UN MÓDULO, QUE NO ES UN SITIO SINO DOS
//
// El importador deja las fichas donde las encuentra en el Word, y el Word no es
// uniforme:
//
//   · lo normal (10 de los 11 módulos de la PD de DAW, 78 fichas) es la sección
//     REPETIDORA `modulos/situaciones-de-aprendizaje/situacion-de-aprendizaje`,
//     cuyo valor es `{ items: [ { titulo, ficha: [ficha], texto } ] }`;
//   · y en el módulo que no lleva ese encabezado dentro (Digitalización
//     Aplicada a los Sectores Productivos, 5 fichas) las fichas se quedan en el
//     campo `ficha` del apartado PADRE `modulos/situaciones-de-aprendizaje`,
//     que es `ficha_situacion_aprendizaje` con `multiple: true`.
//
// Así que el panel trabaja sobre «la lista de fichas de ESTE apartado», y cada
// apartado guarda la suya con su propio `esperaUpdatedAt`. No se mueven fichas
// de un apartado al otro: mover datos de sitio sin que nadie lo haya pedido es
// lo que hace que un apartado parezca vacío en la pantalla y salga lleno en el
// PDF.
//
// POR QUÉ SE TIRA `filas` AL CAMBIAR UNA FICHA, Y SOLO ENTONCES
//
// Una ficha importada lleva dos cosas: la tabla tal como venía (`filas`) y el
// modelo con campos con nombre. El motor imprime `filas` si está, y si no la
// monta desde el modelo (`motor/render-generico.js`). Si al editar el modelo se
// conservara `filas`, el PDF seguiría imprimiendo **lo de antes**: la pantalla
// diría una cosa y el papel otra, que es el fallo que nadie ve hasta la
// exportación.
//
// Por eso, en cuanto una ficha cambia, `filas` se va y la tabla pasa a montarse
// desde sus campos. Y solo esa: las que no se han tocado conservan su tabla
// importada, porque la maquetación del documento no es exactamente la que monta
// `core/sa.js` —el Word usa dos para las actividades— y reescribirlas todas por
// haber editado una sería cambiar el documento por la espalda.
//
// Renumerar cuenta como cambiar: `filas` lleva escrito «Situación de aprendizaje
// 3» en su primera celda, así que una ficha que pasa a ser la 4 tiene que
// soltarla o el papel seguiría llamándola 3.

'use client';

import Sa from '../../core/sa';

// Las fichas nuevas de la aplicación nacen con la primera evaluación y no
// vacías: el motor agrupa el resumen por `evaluacion || ''`, así que una ficha
// sin evaluación acaba en un grupo sin nombre (docs/plan.md, «Para el E4»).
export const EVALUACION_NUEVA = Sa.EVALUACIONES[0];

// Los dos tipos de campo de la plantilla que guardan fichas, y el id del valor
// de una sección repetidora.
export const TIPO_FICHA = 'ficha_situacion_aprendizaje';
export const TIPO_RESUMEN = 'derivado.resumen_situaciones';
export const TIPO_PONDERACION = 'ponderacion_ra_ce';
export const CAMPO_ITEMS = 'items';

// ---------------------------------------------------------------- la ficha suelta

// Sin `filas`: la tabla se vuelve a montar desde el modelo. Se borra la clave en
// lugar de dejarla en `undefined` porque esto viaja por JSON.
//
// Y ANTES DE TIRARLA, SE LE SACA LO QUE TODAVÍA SEPA. El modelo de una ficha
// importada lo escribió el lector del día en que se importó, y ese lector no
// reconocía todas las redacciones que usan los documentos del departamento
// (core/sa.js, `SINONIMOS`): hay fichas cuyo texto de «materiales y recursos» o
// de «actividades de profundización» está solo en la rejilla, porque el campo
// que le correspondía se quedó vacío. Tirar la rejilla sin más haría
// desaparecer ese texto del PDF en el primer cambio —y no en el momento de
// escribirlo, sino al tocar cualquier otra cosa de la ficha—, que es la peor
// forma de perder algo: nadie relaciona lo que falta con lo que hizo.
//
// La regla de qué se rescata y cuándo está en core/sa.js (`completarDesdeFilas`),
// con sus pruebas, y no aquí: es la misma decisión para quien edite desde donde
// sea.
export function sinFilas(ficha) {
  const out = Sa.completarDesdeFilas(ficha);
  delete out.filas;
  return out;
}

// La ficha completa: el modelo con todos sus campos presentes, aunque la
// importada no trajera alguno. Así el formulario se pinta igual con una ficha
// del Word y con una nueva.
//
// Si la importada no trae número —pasa cuando la cabecera de la tabla no se deja
// leer— se le pone el de su posición: sin número no entra en el resumen que
// imprime el PDF (`resumenSituaciones` de motor/render-generico.js la descarta) y
// quedaría fuera sin que nada lo dijera.
//
// `campos` es la estructura de la tabla de la ficha del documento (`estructuraFicha` de la
// plantilla); sin ella, la de siempre.
export function completa(ficha, num, campos) {
  const f = { ...Sa.fichaVacia(num, undefined, campos), ...(ficha || {}) };
  if (f.num === null || f.num === undefined) f.num = num === undefined ? null : num;
  return f;
}

// La tabla que va a salir impresa, con el mismo criterio que el motor: la
// importada si sigue ahí, y si no la montada desde los campos.
export const filasDe = (ficha, campos) => (ficha && Array.isArray(ficha.filas) && ficha.filas.length
  ? ficha.filas
  : Sa.filasDeFicha(ficha, campos));

// ---------------------------------------------------------------- leer el apartado

// De dónde salen las fichas de este apartado y cuáles son. `donde` es el id del
// campo que hay que mandar en el PATCH (`items` en un repetidor, o el id del
// campo `ficha_situacion_aprendizaje`), y null si este apartado no guarda fichas.
// Lo que un ítem repetido lleva además de la ficha —el campo `texto` de la
// plantilla, o cualquier clave que el importador deje ahí— viaja pegado a la
// ficha en `resto`, para que duplicar o mover no lo pierda. Se quita al guardar.
const RESTO = 'resto';

export function fichasDe(apartado) {
  if (!apartado) return { donde: null, lista: [] };

  if (apartado.repetidor) {
    const items = (apartado.valores && Array.isArray(apartado.valores.items))
      ? apartado.valores.items : [];
    return {
      donde: CAMPO_ITEMS,
      // El título del ítem manda sobre el de la tabla: es el campo con nombre de
      // la plantilla y es el que el PDF imprime en el encabezado de la ficha.
      lista: items.map((it, i) => {
        const item = it || {};
        const f = Array.isArray(item.ficha) ? item.ficha[0] : item.ficha;
        const base = completa(f, i + 1, apartado.estructuraFicha);
        const { titulo, ficha, ...resto } = item;
        return { ...base, titulo: titulo || base.titulo || '', [RESTO]: resto };
      }),
    };
  }

  const campo = (apartado.campos || []).find((c) => c.tipo === TIPO_FICHA);
  if (!campo) return { donde: null, lista: [] };
  const valor = apartado.valores ? apartado.valores[campo.id] : null;
  const fichas = Array.isArray(valor) ? valor : (valor ? [valor] : []);
  return { donde: campo.id, lista: fichas.map((f, i) => completa(f, i + 1, apartado.estructuraFicha)) };
}

// Y la vuelta: la lista de fichas en la forma que guarda el apartado.
//
// Aquí NO se tira `filas`: eso lo hacen las operaciones, y solo en la ficha que
// cambia (ver la cabecera). Si se tirara aquí, guardar una ficha reescribiría la
// maquetación de las otras cinco del módulo sin que nadie lo hubiera pedido —que
// es exactamente lo que pasaba antes de probarlo en el navegador—.
export function paraGuardar(lista, donde) {
  return lista.map((f) => {
    const limpia = { ...f };
    const resto = limpia[RESTO] || {};
    delete limpia[RESTO];
    if (donde !== CAMPO_ITEMS) return limpia;
    return { ...resto, titulo: limpia.titulo || '', ficha: [limpia] };
  });
}

// ---------------------------------------------------------------- operaciones
//
// Todas delegan en core/sa.js y se limitan a soltar `filas` de las fichas que
// cambian de número, que es lo que core/ no puede saber: core/ no sabe que la
// tabla importada lleva el número escrito dentro.

const numsDe = (lista) => lista.map((f) => f.num);

// Renumera y, a la vez, suelta la tabla importada de las fichas que han cambiado
// de número.
export function renumerar(lista) {
  const antes = numsDe(lista);
  return Sa.renumerar(lista).map((f, i) => (f.num === antes[i] ? f : sinFilas(f)));
}

export function anadir(lista, campos) {
  const r = Sa.anadirVacia(lista, EVALUACION_NUEVA, campos);
  return { lista: renumerar(r.lista), num: r.num };
}

export function duplicar(lista, num) {
  const r = Sa.duplicarEn(lista, num);
  if (!r) return null;
  // La copia no puede quedarse la tabla de la original: lleva el número y el
  // título de la otra.
  const marcada = r.lista.map((f, i) => (i === r.num - 1 ? sinFilas(f) : f));
  return { lista: renumerar(marcada), num: r.num };
}

export function mover(lista, num, delta) {
  const r = Sa.moverEn(lista, num, delta);
  if (!r) return null;
  return { lista: renumerar(r.lista), num: r.num };
}

export const borrar = (lista, num) => renumerar(Sa.borrarDe(lista, num));

// Sustituye una ficha por la editada. Se tira su tabla importada: lo que se ve
// en el formulario tiene que ser lo que salga en el PDF.
export const reemplazar = (lista, ficha) => Sa.reemplazarEn(lista, sinFilas(ficha));

// ---------------------------------------------------------------- los RA del módulo

// Los resultados de aprendizaje y sus criterios, del apartado del propio módulo,
// para elegirlos en lugar de copiarlos a mano. Sale del campo `auto.tabla_ra_ce`
// (`{ ra: [{ num, texto, ce: [{ letra, texto }] }] }`), que es lo que el
// importador deja ahí.
export function raDeApartado(apartado) {
  if (!apartado || !apartado.valores) return [];
  const valores = apartado.valores;
  for (const campo of apartado.campos || []) {
    const v = valores[campo.id];
    if (v && typeof v === 'object' && Array.isArray(v.ra)) {
      return v.ra
        .filter((r) => r && r.num !== null && r.num !== undefined)
        .map((r) => ({
          num: Number(r.num),
          texto: r.texto || '',
          ce: (r.ce || []).map((ce) => ({ letra: ce.letra, texto: ce.texto || '' })),
        }));
    }
  }
  return [];
}

// ---------------------------------------------------------------- lo que le falta a una ficha
//
// Las mismas tres comprobaciones que el panel del prototipo
// (docs/mockup-v2/js/validaciones.js): sin RA es error, porque la ficha no entra
// en el resumen ni en las ponderaciones; sin sesiones y sin criterios son avisos.
// El panel de validaciones del documento las vuelve a calcular en el servidor;
// esto es para avisar aquí, al lado de la ficha.
export function reparosDeFicha(ficha) {
  const out = [];
  if (!ficha) return out;
  if (!(ficha.ra || []).length) out.push({ severidad: 'error', texto: 'sin RA' });
  if (ficha.sesiones === null || ficha.sesiones === undefined || Number(ficha.sesiones) <= 0) {
    out.push({ severidad: 'aviso', texto: 'sin sesiones' });
  }
  if (!Sa.lineas(ficha.ce).length) out.push({ severidad: 'aviso', texto: 'sin criterios' });
  if (!String(ficha.evaluacion || '').trim()) out.push({ severidad: 'aviso', texto: 'sin evaluación' });
  return out;
}

// Las evaluaciones que ofrece el desplegable. Las tres de `core/sa.js` MÁS la
// que trae la ficha si no es ninguna de ellas: el documento real escribe «1º» en
// ocho fichas y «1ª» en las demás, y un desplegable que no ofreciera lo que hay
// guardado cambiaría «2º» por «1ª» con solo abrir la ficha y guardar.
export function evaluacionesPara(ficha) {
  const actual = String((ficha && ficha.evaluacion) || '').trim();
  const lista = Sa.EVALUACIONES.slice();
  if (actual && !lista.includes(actual)) lista.push(actual);
  return lista;
}
