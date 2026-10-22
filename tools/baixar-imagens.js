'use strict';
// Baixa as imagens geradas para o jogo e salva em public/img com os nomes que o jogo reconhece.
// Uso: npm run imagens   (precisa de internet; Node 18+)
const fs = require('fs');
const path = require('path');

// O slime, as 9 armas e os 3 peitorais já vêm recortados dentro de public/img: veja IMAGENS.md.
const FILES = {};

(async () => {
  const forcar = process.argv.includes('--forcar');
  const dir = path.join(__dirname, '..', 'public', 'img');
  fs.mkdirSync(dir, { recursive: true });
  let ok = 0, fail = 0, kept = 0;
  for (const [name, tail] of Object.entries(FILES)) {
    const dest = path.join(dir, name);
    if (!forcar && fs.existsSync(dest)) { console.log('já existe ' + name); kept++; continue; }
    try {
      const res = await fetch(BASE + tail, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      console.log('ok    ' + name); ok++;
    } catch (e) {
      console.log('falhou ' + name + ' (' + e.message + ') — veja IMAGENS.md para baixar à mão'); fail++;
    }
  }
  console.log('\n' + ok + ' baixadas, ' + kept + ' já existiam, ' + fail + ' falharam. Reinicie a página do jogo para ver as imagens.');
  console.log('O mapa e os 4 monstros pequenos vêm do Canva: veja IMAGENS.md para as versões em alta resolução.');
})();
