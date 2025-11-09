// src/utils/helpers.js

/**
 * Pausa la ejecución de forma asíncrona (para espaciar mensajes)
 * @param {number} ms - milisegundos a esperar
 * @returns {Promise<void>}
 */
export const sleep = (ms = 250) => new Promise(resolve => setTimeout(resolve, ms));
