import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const root = process.cwd();
const dir = mkdtempSync(join(tmpdir(), "avatar-consumer-"));
const run = (bin, args, cwd = dir) =>
  execFileSync(bin, args, { cwd, stdio: "pipe" });
try {
  run("npm", ["pack", "--pack-destination", dir], root);
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "avatar-independent-consumer",
      private: true,
      type: "module",
    }),
  );
  run("npm", [
    "install",
    join(dir, "zoomap-avatar-studio-0.1.0.tgz"),
    "@types/node@^22",
    "@types/three@^0.180",
    "--ignore-scripts",
  ]);
  const source = `import { AvatarLibrary, ComicStyle } from '@zoomap/avatar-studio';
import { defaultRecipe } from '@zoomap/avatar-studio/core';
import { readFile } from 'node:fs/promises';
const base=new URL('./node_modules/@zoomap/avatar-studio/public/',import.meta.url);
const catalog=JSON.parse(await readFile(new URL('catalog.json',base),'utf8'));
const library=new AvatarLibrary(catalog,base.href,async input=>new Response(new Uint8Array(await readFile(new URL(String(input))))));
const create=await library.prepare(defaultRecipe(library.catalog));
const avatar=create();const character=avatar.asCharacter();character.update({vx:1,vz:0,gesture:0},1);
if(!avatar.diagnostics().triangles||typeof ComicStyle!=='function')throw Error('Incomplete exports or assembly');
avatar.dispose();library.dispose();`;
  writeFileSync(join(dir, "check.mjs"), source);
  run("node", ["check.mjs"]);
  writeFileSync(join(dir, "check.ts"), source);
  run(resolve("node_modules/.bin/tsc"), [
    "--noEmit",
    "--strict",
    "--module",
    "NodeNext",
    "--target",
    "ES2022",
    "--skipLibCheck",
    "check.ts",
  ]);
  writeFileSync(
    join(dir, "index.html"),
    '<div id="app"></div><script type="module" src="/main.js"></script>',
  );
  writeFileSync(
    join(dir, "main.js"),
    "import { AvatarLibrary, ComicStyle } from '@zoomap/avatar-studio'; document.querySelector('#app').textContent = typeof AvatarLibrary + typeof ComicStyle;",
  );
  run(resolve("node_modules/.bin/vite"), ["build"]);
  console.log(
    "Packed independent consumer passed: ESM exports, TypeScript declarations, packaged GLB assembly, browser production build.",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
