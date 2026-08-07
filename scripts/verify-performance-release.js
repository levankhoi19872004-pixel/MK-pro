#!/usr/bin/env node
'use strict';
const fs=require('fs'); const path=require('path'); const os=require('os'); const crypto=require('crypto'); const cp=require('child_process');
function shaFile(p){const h=crypto.createHash('sha256');h.update(fs.readFileSync(p));return h.digest('hex');}
function walk(root,current=root){const out=[];for(const ent of fs.readdirSync(current,{withFileTypes:true})){const p=path.join(current,ent.name);if(ent.isDirectory()) out.push(...walk(root,p));else if(ent.isFile()) out.push(path.relative(root,p).split(path.sep).join('/'));}return out.sort();}
function treeSha(root,exclude=[]){const h=crypto.createHash('sha256');for(const rel of walk(root).filter(r=>!exclude.includes(r))){h.update(rel+'\0');h.update(fs.readFileSync(path.join(root,rel)));h.update('\0');}return h.digest('hex');}
function fail(msg){console.error(msg);process.exitCode=1;}
const zip=path.resolve(process.argv[2]||''); const expected=process.argv[3]||''; if(!zip||!fs.existsSync(zip)){fail('ZIP_NOT_FOUND');return;}
if(expected&&shaFile(zip)!==expected) fail('ZIP_SHA_MISMATCH');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'perf-a5r2-'));
try{
 const listing=cp.execFileSync('unzip',['-Z1',zip],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
 if(listing.some(x=>x.startsWith('/')||x.split('/').includes('..'))) fail('PATH_TRAVERSAL');
 cp.execFileSync('unzip',['-q',zip,'-d',tmp]);
 const manifestPath=path.join(tmp,'PERF_A5R2_RELEASE_MANIFEST.json'); if(!fs.existsSync(manifestPath)){fail('MANIFEST_MISSING');return;}
 const m=JSON.parse(fs.readFileSync(manifestPath,'utf8')); const files=walk(tmp);
 if(files.length!==m.actualFileCount) fail(`FILE_COUNT_MISMATCH ${files.length} ${m.actualFileCount}`);
 const actualTree=treeSha(tmp,m.treeHashExcludedPaths||[]); if(actualTree!==m.treeSha256) fail(`TREE_SHA_MISMATCH ${actualTree} ${m.treeSha256}`);
 for(const a of m.packagedArtifacts||[]){const p=path.join(tmp,a.relativePath);if(!fs.existsSync(p)) fail(`ARTIFACT_MISSING ${a.relativePath}`);else if(shaFile(p)!==a.sha256) fail(`ARTIFACT_SHA_MISMATCH ${a.relativePath}`);}
 const bad=files.filter(f=>f.includes('node_modules/')||/(^|\/)\.env($|\.)/.test(f)||/\.(bson|dump|pem|key)$/i.test(f)); if(bad.length) fail(`FORBIDDEN_FILES ${bad.join(',')}`);
 const flags=m.featureFlagDefaults||{}; if(String(flags.PERF_BULK_CONCURRENCY)!=='1') fail('BAD_CONCURRENCY_DEFAULT');
 if(Object.entries(flags).some(([k,v])=>k.startsWith('PERF_')&&k!=='PERF_TELEMETRY_ENABLED'&&k!=='PERF_BULK_CONCURRENCY'&&k!=='PERF_BULK_TRANSIENT_RETRY_LIMIT'&&String(v)!=='0'&&String(v)!=='')) fail('OPTIMIZATION_FLAG_ENABLED');
 if(!process.exitCode) console.log(JSON.stringify({status:'PASS',zipSha256:shaFile(zip),fileCount:files.length,treeSha256:actualTree,releaseId:m.releaseId},null,2));
} finally {fs.rmSync(tmp,{recursive:true,force:true});}
