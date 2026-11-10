// Roda um script do Blender sem abrir a interface, sobre o arquivo do prédio.
// Uso: npm run blender -- <script.py> [opções do script]      ex.: npm run blender -- hero.py --passe ids
// O Blender: BLENDER_BIN, ou o lugar padrão no Mac, no Windows e no Linux. O .blend: ARBO_BLEND, --cena <arquivo>
// ou fonte/predio.blend.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const [script, ...resto] = process.argv.slice(2);
if (!script) {
  console.error('Uso: npm run blender -- <script.py> [opções]   (scripts em fonte/: hero.py, modelos.py, exporta_glb.py, clipe.py, cena_exemplo.py)');
  process.exit(1);
}

function acha() {
  if (process.env.BLENDER_BIN) return process.env.BLENDER_BIN;
  const lugares = [
    '/Applications/Blender.app/Contents/MacOS/Blender',
    ...['C:/Program Files/Blender Foundation'].flatMap((d) =>
      fs.existsSync(d) ? fs.readdirSync(d).sort().reverse().map((v) => `${d}/${v}/blender.exe`) : []),
    '/usr/bin/blender', '/snap/bin/blender', '/usr/local/bin/blender',
  ];
  const ok = lugares.find((l) => fs.existsSync(l));
  if (ok) return ok;
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['blender'], { encoding: 'utf8' });
  if (r.status === 0) return r.stdout.split(/\r?\n/)[0].trim();
  console.error('Não achei o Blender. Instale o Blender 5.2 LTS (blender.org/download) ou diga onde ele está:\n  BLENDER_BIN="/caminho/do/blender" npm run blender -- ' + script);
  process.exit(1);
}

let cena = process.env.ARBO_BLEND ?? path.join(AQUI, 'predio.blend');
const i = resto.indexOf('--cena');
if (i >= 0) { cena = path.resolve(resto[i + 1]); resto.splice(i, 2); }
const arq = path.isAbsolute(script) ? script : path.join(AQUI, path.basename(script));
const criaCena = path.basename(script) === 'cena_exemplo.py';
if (!criaCena && !fs.existsSync(cena)) {
  console.error(`Não achei o arquivo do prédio: ${cena}\nSalve o seu .blend como fonte/predio.blend, use --cena <arquivo>, ou gere o de exemplo: npm run blender -- cena_exemplo.py`);
  process.exit(1);
}
const a = ['--background', ...(criaCena ? ['--factory-startup'] : [cena]), '--python-exit-code', '1', '--python', arq, '--', ...resto];
const { status } = spawnSync(acha(), a, { stdio: 'inherit' });
process.exit(status ?? 1);
