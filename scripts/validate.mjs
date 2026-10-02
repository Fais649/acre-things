import { readdirSync, readFileSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkManifest } from './manifest.ts';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function packageAt(folder){
 const path=resolve(folder);
 for(const name of ['thing.json','manifest.json','code.html']){
  const file=resolve(path,name);
  if(lstatSync(file).isSymbolicLink()||!lstatSync(file).isFile()||realpathSync(file)!==file)throw Error(`${name}: use a regular file`);
 }
 const thing=JSON.parse(readFileSync(resolve(path,'thing.json'),'utf8'));
 const manifest=JSON.parse(readFileSync(resolve(path,'manifest.json'),'utf8'));
 const code=readFileSync(resolve(path,'code.html'),'utf8');
 const text=(v,min,max)=>typeof v==='string'&&v.trim().length>=min&&v.length<=max;
 if(!text(thing.name,1,40)||!text(thing.description,1,500)||!text(thing.icon,1,60)||!/^#[0-9a-f]{6}$/i.test(thing.color))throw Error('thing.json needs name (1–40), description (1–500), icon (1–60), and hex color');
 if(!text(thing.author,3,20)||!/^[a-z0-9_]+$/.test(thing.author))throw Error('author must be your Acre handle');
 if(!text(thing.license,1,50))throw Error('Declare a source license');
 if(thing.id!==undefined&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(thing.id))throw Error('id must be a published Acre thing UUID');
 if(Buffer.byteLength(code)<1||Buffer.byteLength(code)>200000)throw Error('code.html must be 1–200000 bytes');
 if(Buffer.byteLength(JSON.stringify(manifest))>20000)throw Error('manifest is over 20000 bytes');
 for(const key of Object.keys(manifest))if(!['size','settings','sources','game'].includes(key))throw Error(`Unknown manifest field: ${key}`);
 const checked=checkManifest(manifest);
 if(/<(?:iframe|object|embed|form)\b/i.test(code)||/<(?:script|link|img|audio|video)\b[^>]*(?:src|href)\s*=\s*["']?https?:/i.test(code))throw Error('Inline scripts and assets; external resources and frames are blocked by Acre');
 return {thing,manifest:checked,code};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const folders=process.argv.slice(2);
 for(const folder of folders.length?folders:readdirSync(resolve(root,'things'),{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>resolve(root,'things',e.name))){packageAt(folder);console.log('Valid:',folder)}
}
