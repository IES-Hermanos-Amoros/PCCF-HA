// PROPONER QUÉ TABLAS DE UN DOCUMENTO SON «LA MISMA TABLA», MIRANDO SOLO SU FORMA.
//
// Hoy `clasificarTabla` (motor/importar-docx.js) decide qué es cada tabla con reglas escritas a mano
// para un departamento. Esta pieza es el otro camino: sin conocer ningún documento, agrupa las
// tablas que se parecen y explica por qué, para que una persona confirme, renombre o separe el grupo.
// No clasifica nada ni cambia lo que hace el importador: solo propone.
//
// UN GRUPO EQUIVOCADO CUESTA MÁS QUE UNA PAREJA SIN JUNTAR. Deshacer lo que no debía estar junto exige
// mirar el grupo entero; juntar dos sueltas es un gesto. Por eso cada regla es conservadora y lo que
// no encaja con claridad queda SUELTO, sin grupos de uno ni agrupaciones por aproximación.
//
// QUÉ HACE QUE DOS TABLAS SEAN LA MISMA, EN TRES NIVELES (por este orden)
//
//   1. «misma-cabecera». Las dos tienen cabecera y las cabeceras casan celda a celda, sin acentos,
//      mayúsculas, dígitos ni signos. Casar admite dos holguras, ninguna más: una celda es prefijo de
//      la otra («Temporaliz.» / «Temporalización», con 5 letras al menos), y una cabecera es la otra
//      con columnas de más al final (la familia que unas veces lleva dos columnas y otras cuatro).
//      Se exigen dos celdas que casen, o una sola si es idéntica. No mira las columnas de la rejilla:
//      las celdas fusionadas hacen que la misma tabla cuente distinto.
//   2. «matriz-partida». La misma primera celda, el mismo número de filas y el resto de la cabecera de
//      una sola letra: una matriz ancha que no cabía y se cortó en dos.
//   3. «misma-forma». Las que quedan comparten FIRMA: columnas de la rejilla, celdas fusionadas de la
//      primera fila, si la primera columna va en negrita y proporción de anchos (si se conocen). Los
//      anchos casan con tolerancia, no por redondeo: en la ficha de situación de aprendizaje la misma
//      tabla trae columnas que bailan una décima. La negrita de la primera fila NO entra: en la misma
//      ficha unas veces va entera en negrita y otras a medias. Las filas tampoco, salvo `bandasFilas`.
//      Y dos tablas que traen cada una SU cabecera, distinta, no son la misma por mucho que midan lo
//      mismo: la forma solo junta tablas de las que no se sabe más.
//
// QUÉ ES UNA CABECERA, SIN PEDIRLE NADA AL IMPORTADOR
//
// No hay un largo máximo absoluto, porque «Criterios de evaluación (Decreto 107/2022)» mide 42 y es
// cabecera igual. La primera fila es cabecera si, de menor a mayor evidencia:
//   · su texto aparece como primera fila de otra tabla del documento: una cabecera se repite, un dato
//     no; es la prueba más fuerte y no depende de la tipografía;
//   · todas sus celdas con texto SE DISTINGUEN del cuerpo: van en negrita en una columna cuyo cuerpo no
//     lo está, o son claramente más cortas (menos de la mitad) que la mediana de su columna.
// La primera columna en negrita en todas las filas no cuenta: es una tabla de clave y valor.
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
  const NIVEL_MATRIZ = 'matriz-partida';
  const NIVEL_FORMA = 'misma-forma';
  const MIN_PREFIJO = 5; // letras que debe tener el lado corto para que «prefijo» sea abreviatura
  const TOLERANCIA_ANCHO = 0.10; // por columna, sobre proporciones de 0 a 1
  const TOLERANCIA_MEDIA = 0.05; // en media entre columnas: separa 20/80 de 30/70

  const sinAcentos = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Sin dígitos: «Resultado de aprendizaje 1» y «… 2» encabezan la misma tabla.
  const normaCabecera = (t) => sinAcentos(t).toLowerCase().replace(/[^a-zñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const limpio = (t) => String(t || '').replace(/\s+/g, ' ').trim();

  const span = (c) => Math.max(1, Number(c && c.colspan) || 1);
  const anchoFila = (fila) => fila.reduce((a, c) => a + span(c), 0);

  const mediana = (v) => {
    if (!v.length) return 0;
    const s = v.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  // ¿Se distingue esta celda de la primera fila del resto de su columna?
  function destacada(fila0, j, cuerpo) {
    const celda = fila0[j];
    const texto = limpio(celda.text);
    if (!texto) return null; // celda vacía: ni suma ni resta
    const columna = cuerpo.map((f) => f[j]).filter((x) => x && limpio(x.text));
    if (!columna.length) return false;
    const negrita = columna.filter((x) => x.bold).length / columna.length;
    if (celda.bold && negrita < 0.5) return true;
    return texto.length < mediana(columna.map((x) => limpio(x.text).length)) / 2;
  }

  function pareceCabecera(rows) {
    const fila0 = rows[0] || [];
    if (!fila0.length || rows.length < 2) return false;
    const cuerpo = rows.slice(1);
    const veredictos = fila0.map((_c, j) => destacada(fila0, j, cuerpo)).filter((v) => v !== null);
    return veredictos.length > 0 && veredictos.every(Boolean);
  }

  // Los anchos como proporciones de 0 a 1; null si no se conocen.
  function proporciones(anchos) {
    if (!Array.isArray(anchos) || !anchos.length) return null;
    const total = anchos.reduce((a, b) => a + b, 0);
    return total > 0 ? anchos.map((a) => a / total) : null;
  }

  function anchosCasan(a, b) {
    if (!a || !b) return true; // si no se conocen, no se puede discriminar por ellos
    if (a.length !== b.length) return false;
    const d = a.map((x, i) => Math.abs(x - b[i]));
    return Math.max(...d) <= TOLERANCIA_ANCHO + 1e-9 && d.reduce((s, x) => s + x, 0) / d.length <= TOLERANCIA_MEDIA + 1e-9;
  }

  function bandaFilas(n) {
    if (n === 1) return '1';
    if (n <= 4) return '2-4';
    if (n <= 12) return '5-12';
    return '13+';
  }

  function rasgos(t) {
    const rows = (t && t.rows) || [];
    const fila0 = rows[0] || [];
    const celdas = fila0.map((c) => normaCabecera(c.text));
    return {
      filas: rows.length,
      columnas: rows.reduce((m, f) => Math.max(m, anchoFila(f)), 0),
      fusion: fila0.map(span).join(','),
      primeraCol: rows.length > 1 && rows.every((f) => f[0] && f[0].bold) ? 'N' : 'n',
      proporciones: proporciones(t && t.anchos),
      celdas,
      textoCabecera: celdas.join('|'),
      cab: pareceCabecera(rows),
    };
  }

  // Dos celdas de cabecera casan si son iguales o una es prefijo de la otra (abreviatura).
  function celdaCasa(a, b) {
    if (a === b) return true;
    const [corta, larga] = a.length <= b.length ? [a, b] : [b, a];
    return corta.length >= MIN_PREFIJO && larga.startsWith(corta);
  }

  // Dos cabeceras casan si lo hacen celda a celda hasta donde llega la más corta, y esa parte tiene
  // dos celdas con texto, o una sola pero idéntica.
  function cabecerasCasan(a, b) {
    const n = Math.min(a.celdas.length, b.celdas.length);
    if (n === 0) return false;
    for (let j = 0; j < n; j += 1) if (!celdaCasa(a.celdas[j], b.celdas[j])) return false;
    if (n === 1) return a.celdas.length === b.celdas.length && a.celdas[0] === b.celdas[0] && a.celdas[0] !== '';
    return a.celdas.slice(0, n).some(Boolean);
  }

  const esLetra = (c) => c.length === 1;
  function matricesPartidas(a, b) {
    if (!a.celdas[0] || a.celdas[0] !== b.celdas[0]) return false;
    if (a.filas !== b.filas || a.filas < 3) return false;
    const resto = (r) => r.celdas.slice(1);
    return resto(a).length > 1 && resto(b).length > 1 && resto(a).every(esLetra) && resto(b).every(esLetra);
  }

  const recorte = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const textoFilas = (fr) => (fr.min === fr.max ? `todas de ${plural(fr.min, 'fila', 'filas')}` : `de ${fr.min} a ${fr.max} filas`);

  // Agrupa de forma voraz contra el representante de cada grupo (el primero que entró, con las
  // cabeceras más anchas por delante), y no por encadenamiento: A casa con B y B con C no hace que A
  // case con C, y un criterio por parecido que encadena acaba juntando cosas que no se parecen.
  function agrupar(indices, casa) {
    const cubos = [];
    for (const i of indices) {
      const cubo = cubos.find((c) => casa(c[0], i));
      if (cubo) cubo.push(i); else cubos.push([i]);
    }
    return cubos.filter((c) => c.length >= 2);
  }

  function proponer(tablas, opciones) {
    const op = opciones || {};
    const lista = Array.isArray(tablas) ? tablas : [];
    const R = lista.map((t) => rasgos(t));
    const usada = new Set();
    const grupos = [];
    const resumen = (idx) => {
      const n = idx.map((i) => R[i].filas);
      return { min: Math.min(...n), max: Math.max(...n) };
    };
    const emitir = (nivel, idx, firma, motivo) => {
      idx.forEach((i) => usada.add(i));
      grupos.push({ nivel, firma, indices: idx.slice().sort((a, b) => a - b), motivo, filas: resumen(idx) });
    };
    const libres = () => R.map((_r, i) => i).filter((i) => !usada.has(i));

    // La repetición de una primera fila en otra tabla es prueba de cabecera aunque no se distinga.
    const veces = new Map();
    R.forEach((r) => { if (r.textoCabecera.replace(/\|/g, '')) veces.set(r.textoCabecera, (veces.get(r.textoCabecera) || 0) + 1); });
    R.forEach((r) => { if (!r.cab && (veces.get(r.textoCabecera) || 0) > 1 && r.filas > 1) r.cab = true; });

    // Nivel 1. Las cabeceras más anchas primero: son las representantes más completas.
    const conCab = libres().filter((i) => R[i].cab).sort((a, b) => R[b].celdas.length - R[a].celdas.length || a - b);
    for (const idx of agrupar(conCab, (a, b) => cabecerasCasan(R[a], R[b]))) {
      const titulo = (lista[idx[0]].rows[0] || []).map((c) => limpio(c.text)).join(' | ');
      const fr = resumen(idx);
      emitir(NIVEL_CABECERA, idx, `cabecera «${recorte(titulo, 60)}»`,
        `${plural(idx.length, 'tabla', 'tablas')} con la misma primera fila, «${recorte(titulo, 80)}», o casi: `
        + `${textoFilas(fr)}.`);
    }

    // Nivel 2.
    const sueltas2 = libres();
    for (const idx of agrupar(sueltas2, (a, b) => matricesPartidas(R[a], R[b]))) {
      emitir(NIVEL_MATRIZ, idx, `matriz de ${idx.length} partes`,
        `${plural(idx.length, 'tabla', 'tablas')} que empiezan por la misma celda, «${recorte(lista[idx[0]].rows[0][0].text, 40)}», `
        + `con las mismas ${R[idx[0]].filas} filas y columnas de una sola letra: parecen una matriz cortada por no caber a lo ancho.`);
    }

    // Nivel 3.
    const prefijo = (i) => `${R[i].columnas} col · fusión ${R[i].fusion} · col 1 ${R[i].primeraCol}` + (op.bandasFilas ? ` · filas ${bandaFilas(R[i].filas)}` : '');
    const restantes = libres();
    const cubos = new Map();
    restantes.forEach((i) => { const k = prefijo(i); if (!cubos.has(k)) cubos.set(k, []); cubos.get(k).push(i); });
    for (const [k, miembros] of cubos) {
      for (const idx of agrupar(miembros, (a, b) => !(R[a].cab && R[b].cab) && anchosCasan(R[a].proporciones, R[b].proporciones))) {
        const p = R[idx[0]].proporciones;
        const firma = k + (p ? ' · anchos ' + p.map((x) => Math.round(x * 100)).join('/') : '');
        const fr = resumen(idx);
        emitir(NIVEL_FORMA, idx, firma,
          `${plural(idx.length, 'tabla', 'tablas')} con la misma forma (${firma}); ${textoFilas(fr)}. `
          + 'El texto de la primera fila no coincide.');
      }
    }

    grupos.sort((a, b) => b.indices.length - a.indices.length || a.indices[0] - b.indices[0]);
    grupos.forEach((g, n) => {
      g.id = 'grupo-' + (n + 1);
      g.ejemplo = recorte(((lista[g.indices[0]].rows || [])[0] || []).map((c) => limpio(c.text)).join(' | '), 80);
    });
    return { grupos, sueltas: libres() };
  }

  const api = { proponer, rasgos, NIVEL_CABECERA, NIVEL_MATRIZ, NIVEL_FORMA };

  global.Core = global.Core || {};
  global.Core.tablasForma = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
