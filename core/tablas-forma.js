// PROPONER QUÉ TABLAS DE UN DOCUMENTO SON «LA MISMA TABLA», MIRANDO SOLO SU FORMA.
//
// Hoy `clasificarTabla` (motor/importar-docx.js) decide qué es cada tabla con reglas escritas a mano
// para un departamento. Esta pieza es el otro camino: sin conocer ningún documento, agrupa las
// tablas que se parecen y explica por qué, para que una persona confirme, renombre o separe el grupo.
// No clasifica nada ni cambia lo que hace el importador: solo propone.
//
// QUÉ HACE QUE DOS TABLAS SEAN LA MISMA, EN DOS NIVELES
//
//   1. «misma-cabecera»: el texto de la primera fila es el mismo, celda a celda, una vez
//      normalizado (sin acentos, mayúsculas, dígitos ni signos). Es la señal fuerte y NO mira las
//      columnas: una rejilla con celdas fusionadas cuenta distinto en cada tabla aunque sea la misma.
//      Solo se aplica a tablas con cabecera de verdad: la primera fila entera en negrita, o toda de
//      celdas cortas. En una tabla de clave y valor la primera fila es un dato y no sirve de nombre.
//   2. «misma-forma»: con las que no se han agrupado por cabecera, comparten la FIRMA de forma:
//        columnas de la rejilla | celdas fusionadas de la primera fila | qué celdas de la primera
//        fila van en negrita | si la primera columna va en negrita | proporción de anchos (si se
//        conocen, redondeada al 10 %) | tramo de filas (solo si se pide con `bandasFilas`).
//      El número de filas NO entra por defecto: la ficha de un módulo y la de otro son la misma
//      tabla aunque una tenga una fila más.
//
// Una tabla que no encaja con ninguna queda SUELTA: no se fuerza un grupo de uno.
//
// Entrada: cada tabla es { rows: [[{ text, bold, colspan, rowspan }]], anchos?: [número] } (la forma
// que deja el importador, más los anchos de columna si quien llama los conoce).
// Salida: { grupos: [{ id, nivel, firma, indices, motivo, filas: {min,max}, ejemplo }], sueltas }.
//
// Lógica pura: sin DOM, sin node, sin red, y sin dependencias de otros ficheros de core/.
// Cuelga de `global.Core.tablasForma` y de `module.exports`.

(function (global) {
  'use strict';

  const NIVEL_CABECERA = 'misma-cabecera';
  const NIVEL_FORMA = 'misma-forma';
  const CORTA = 40; // el umbral con el que el importador decide que una primera fila es cabecera

  const sinAcentos = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Sin dígitos: «Resultado de aprendizaje 1» y «… 2» encabezan la misma tabla.
  const normaCabecera = (t) => sinAcentos(t).toLowerCase().replace(/[^a-zñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const limpio = (t) => String(t || '').replace(/\s+/g, ' ').trim();

  const span = (c) => Math.max(1, Number(c && c.colspan) || 1);
  const anchoFila = (fila) => fila.reduce((a, c) => a + span(c), 0);

  function esCabecera(fila) {
    if (!fila.length) return false;
    return fila.every((c) => c.bold) || fila.every((c) => String(c.text || '').length <= CORTA);
  }

  // Los anchos como proporción redondeada al 10 %: columnas 20/80 y 50/50 no son la misma rejilla,
  // y 48/52 contra 50/50 sí. El redondeo tiene frontera: 45/55 y 44/56 caen a lados distintos.
  function claseAnchos(anchos) {
    if (!Array.isArray(anchos) || !anchos.length) return null;
    const total = anchos.reduce((a, b) => a + b, 0);
    if (!(total > 0)) return null;
    return anchos.map((a) => Math.round((a / total) * 10) * 10).join('/');
  }

  function bandaFilas(n) {
    if (n === 1) return '1';
    if (n <= 4) return '2-4';
    if (n <= 12) return '5-12';
    return '13+';
  }

  function rasgos(t, opciones) {
    const rows = (t && t.rows) || [];
    const fila0 = rows[0] || [];
    const columnas = rows.reduce((m, f) => Math.max(m, anchoFila(f)), 0);
    const anchos = claseAnchos(t && t.anchos);
    const mascara = fila0.map((c) => (c.bold ? 'N' : 'n')).join('');
    const fusion = fila0.map(span).join(',');
    const primeraCol = rows.length > 1 && rows.every((f) => f[0] && f[0].bold) ? 'N' : 'n';
    const cab = esCabecera(fila0);
    const clave = cab ? fila0.map((c) => normaCabecera(c.text)).join('|') : null;
    const partes = [`${columnas} col`, `fusión ${fusion}`, `fila 1 ${mascara}`, `col 1 ${primeraCol}`];
    if (anchos) partes.push(`anchos ${anchos}`);
    if (opciones.bandasFilas) partes.push(`filas ${bandaFilas(rows.length)}`);
    return { columnas, cab, clave, forma: partes.join(' · '), filas: rows.length };
  }

  const recorte = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  function resumenFilas(idx, R) {
    const n = idx.map((i) => R[i].filas);
    return { min: Math.min(...n), max: Math.max(...n) };
  }
  const textoFilas = (fr) => (fr.min === fr.max ? `todas de ${plural(fr.min, 'fila', 'filas')}` : `de ${fr.min} a ${fr.max} filas`);

  function proponer(tablas, opciones) {
    const op = opciones || {};
    const lista = Array.isArray(tablas) ? tablas : [];
    const R = lista.map((t) => rasgos(t, op));
    const usada = new Set();
    const grupos = [];

    // Nivel 1: misma rejilla y mismo texto de cabecera.
    const porCabecera = new Map();
    R.forEach((r, i) => {
      if (!r.cab || !r.clave || !r.clave.replace(/[| ]/g, '')) return;
      const k = r.clave;
      if (!porCabecera.has(k)) porCabecera.set(k, []);
      porCabecera.get(k).push(i);
    });
    for (const idx of porCabecera.values()) {
      if (idx.length < 2) continue;
      idx.forEach((i) => usada.add(i));
      const titulo = lista[idx[0]].rows[0].map((c) => limpio(c.text)).join(' | ');
      const fr = resumenFilas(idx, R);
      grupos.push({
        nivel: NIVEL_CABECERA,
        firma: `${R[idx[0]].columnas} col · cabecera «${recorte(titulo, 60)}»`,
        indices: idx,
        motivo: `${plural(idx.length, 'tabla', 'tablas')} con ${plural(R[idx[0]].columnas, 'columna', 'columnas')} `
          + `y la misma primera fila, «${recorte(titulo, 80)}»; ${textoFilas(fr)}.`,
        filas: fr,
      });
    }

    // Nivel 2: la misma firma de forma, entre las que quedan.
    const porForma = new Map();
    R.forEach((r, i) => {
      if (usada.has(i)) return;
      if (!porForma.has(r.forma)) porForma.set(r.forma, []);
      porForma.get(r.forma).push(i);
    });
    for (const [forma, idx] of porForma) {
      if (idx.length < 2) continue;
      idx.forEach((i) => usada.add(i));
      const fr = resumenFilas(idx, R);
      grupos.push({
        nivel: NIVEL_FORMA,
        firma: forma,
        indices: idx,
        motivo: `${plural(idx.length, 'tabla', 'tablas')} con la misma forma (${forma}); ${textoFilas(fr)}. `
          + 'El texto de la primera fila no coincide.',
        filas: fr,
      });
    }

    grupos.sort((a, b) => b.indices.length - a.indices.length || a.indices[0] - b.indices[0]);
    grupos.forEach((g, n) => {
      g.id = 'grupo-' + (n + 1);
      g.ejemplo = recorte(((lista[g.indices[0]].rows || [])[0] || []).map((c) => limpio(c.text)).join(' | '), 80);
    });
    const sueltas = R.map((_r, i) => i).filter((i) => !usada.has(i));
    return { grupos, sueltas };
  }

  const api = { proponer, rasgos, NIVEL_CABECERA, NIVEL_FORMA };

  global.Core = global.Core || {};
  global.Core.tablasForma = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
