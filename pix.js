'use strict';
// Pix "copia e cola" (BR Code estático) para cobrar um valor fixo. Só monta o texto; o QR é desenhado no navegador (public/qr.js).
// Formato EMV do Banco Central: cada campo é ID (2 dígitos) + tamanho (2 dígitos) + valor. O último campo é o CRC16-CCITT do texto todo.

function tlv(id, value) { const v = String(value); return id + String(v.length).padStart(2, '0') + v; }
function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
// O Pix só aceita estes caracteres no nome e na cidade (sem acento), em caixa alta e com limite de tamanho.
function clean(s, max, fallback) {
  const t = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, max).trim();
  return t || fallback;
}
// opts: key (chave Pix; e-mail em minúsculas), name, city, amount (reais), txid (letras e números, até 25; sem txid vai '***')
function brcode(opts) {
  const key = String(opts.key || '').trim().toLowerCase();
  if (!key || key.length > 77) throw new Error('chave Pix inválida');
  const amount = Number(opts.amount);
  if (!(amount > 0) || amount > 99999) throw new Error('valor inválido');
  const txid = String(opts.txid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const acct = tlv('00', 'br.gov.bcb.pix') + tlv('01', key);
  const body =
    tlv('00', '01') + tlv('01', '11') + tlv('26', acct) + tlv('52', '0000') + tlv('53', '986') + tlv('54', amount.toFixed(2)) +
    tlv('58', 'BR') + tlv('59', clean(opts.name, 25, 'SLIMERPG')) + tlv('60', clean(opts.city, 15, 'BRASIL')) + tlv('62', tlv('05', txid)) + '6304';
  return body + crc16(body);
}
// Confere um BR Code (para os testes): CRC certo e campos de nível 1 lidos de volta.
function parse(code) {
  const out = {}; let i = 0;
  while (i < code.length - 4) { const id = code.slice(i, i + 2), n = parseInt(code.slice(i + 2, i + 4), 10); out[id] = code.slice(i + 4, i + 4 + n); i += 4 + n; }
  out.crcOk = crc16(code.slice(0, -4)) === code.slice(-4);
  return out;
}

module.exports = { brcode, crc16, parse, clean };
