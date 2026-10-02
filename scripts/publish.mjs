// Run locally as the author. Credentials never enter the repository or CI.
import { packageAt } from './validate.mjs';
const folder=process.argv[2];
if(!folder)throw Error('Usage: node scripts/publish.mjs things/<your-thing>');
const {thing,manifest,code}=packageAt(folder);
const {ACRE_URL,ACRE_ANON_KEY,ACRE_ACCESS_TOKEN}=process.env;
if(!ACRE_URL||!ACRE_ANON_KEY||!ACRE_ACCESS_TOKEN)throw Error('Set ACRE_URL, ACRE_ANON_KEY and ACRE_ACCESS_TOKEN locally');
const base=new URL(ACRE_URL);
if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/')throw Error('ACRE_URL must be an https origin');
async function api(path,method='GET',body){
 const res=await fetch(new URL(path,base),{method,redirect:'error',headers:{apikey:ACRE_ANON_KEY,Authorization:`Bearer ${ACRE_ACCESS_TOKEN}`,'Content-Type':'application/json',Prefer:'return=representation'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 if(!res.ok)throw Error(`Acre refused ${method} ${path.split('?')[0]} (${res.status})`);
 return res.status===204?null:res.json();
}
const user=await api('/auth/v1/user');
const [profile]=await api(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=handle`);
if(profile?.handle!==thing.author)throw Error('Sign in as the author declared in thing.json');
const fields={name:thing.name,description:thing.description,icon:thing.icon,color:thing.color,draft_code:code,draft_manifest:manifest};
let id=thing.id;
if(id){const rows=await api(`/rest/v1/things?id=eq.${id}&author=eq.${user.id}&select=id`,'PATCH',fields);if(rows.length!==1)throw Error('That thing does not belong to this account')}
else{id=(await api('/rest/v1/things?select=id','POST',fields))[0].id}
const version=await api('/rest/v1/rpc/publish_thing','POST',{target:id});
await api(`/rest/v1/things?id=eq.${id}&select=id`,'PATCH',{listed:true});
console.log(`Published ${thing.name}: ${id}, version ${version}. Save this id in thing.json before publishing an update.`);
