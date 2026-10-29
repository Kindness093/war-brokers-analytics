import {readFile,writeFile} from 'node:fs/promises';
async function load(file){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
const baseline=await load('.data/baseline.json'),progress=await load('.data/progress.json');
const snapshot={...(baseline||{weapons:{}}),collection:progress?{playersDiscovered:progress.uids.length,playersFetched:progress.index}:null,snapshotAt:new Date().toISOString()};
await writeFile('assets/daily-baseline.json',JSON.stringify(snapshot));
