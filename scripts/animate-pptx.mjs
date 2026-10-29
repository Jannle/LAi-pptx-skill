#!/usr/bin/env node
/**
 * Native PresentationML entrance animation and slide transitions.
 * Modified/new source 2026-10-29; AGPL-3.0-only, see ../LICENSE and ../NOTICE.md.
 * No shape, text, chart, table, media, relationship or workbook content is rasterized.
 * Official reference: https://learn.microsoft.com/en-us/office/open-xml/presentation/working-with-animation
 * https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.setbehavior
 * https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.animateeffect
 * https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.commontimenode
 * https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.transition
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';

const PML = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const ATTR = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
function attributes(tag) { return Object.fromEntries([...tag.matchAll(ATTR)].map(m => [m[1], m[2] ?? m[3]])); }
function xmlDecode(value='') { return value.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'); }
function integer(value, label) { const n=Number(value); if (!Number.isSafeInteger(n)||n<1) throw new Error(`${label} must be a positive integer`); return n; }
function safeXml(xml, label) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error(`${label}: DTD/entity XML is unsupported`);
}

/** Return shape ids/names/types from the generator's p-prefixed slide XML. */
export function listSlideShapes(xml) {
  safeXml(xml,'slide');
  const result=[];
  for (const match of xml.matchAll(/<p:(sp|pic|graphicFrame|cxnSp)\b[\s\S]*?<p:cNvPr\b([^>]*?)(?:\/>|>)/g)) {
    const a=attributes(match[2]);
    if(a.id) result.push({id:integer(a.id,'shape id'),name:xmlDecode(a.name),type:match[1]});
  }
  return result;
}

// This package authors p-prefixed transitional PresentationML. Reject other dialects
// rather than trying to rewrite arbitrary third-party XML with regular expressions.
function rootChildren(xml) {
  safeXml(xml,'slide');
  if (!new RegExp(`<p:sld\\b[^>]*xmlns:p=["']${PML.replaceAll('/','\\/')}["']`).test(xml)) {
    throw new Error('Expected p-prefixed transitional PresentationML slide XML');
  }
  const tokens=[...xml.matchAll(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]+>/g)];
  let depth=0, rootStart=-1, rootClose=-1, current=null; const children=[];
  for(const token of tokens){
    const text=token[0], at=token.index;
    if(text.startsWith('<?')||text.startsWith('<!'))continue;
    const closing=text.startsWith('</'), selfClosing=/\/>$/.test(text);
    const name=text.match(/^<\/?([^\s/>]+)/)?.[1];
    if(closing){
      if(depth===2&&current){ children.push({...current,end:at+text.length});current=null; }
      if(depth===1){if(name!=='p:sld')throw new Error('Malformed slide XML');rootClose=at;}
      depth--;
    }else{
      if(depth===0){if(name!=='p:sld')throw new Error('Unexpected slide XML root');rootStart=at;}
      if(depth===1){current={name,start:at}; if(selfClosing){children.push({...current,end:at+text.length});current=null;}}
      if(!selfClosing)depth++;
    }
  }
  if(depth!==0||rootStart<0||rootClose<0)throw new Error('Malformed slide XML');
  return {children,rootClose};
}

function normalizedGroups(raw,shapes,autoSelect) {
  const valid=new Set(shapes.map(s=>s.id));
  let groups;
  if(raw!==undefined){
    if(!Array.isArray(raw))throw new Error('Each groupsBySlide value must be an array');
    groups=raw.map(g=>Array.isArray(g)?g:[g]);
  } else groups=autoSelect ? shapes.filter(s=>/^(editable-(text|shape|chart|table|image)|process|timeline|content|body|kpi|comparison)(?:[-_\s]|$)/i.test(s.name)&&!/(?:title|footer|header|page-no|brand|background)/i.test(s.name)).map(s=>[s.id]) : [];
  const seen=new Set();
  return groups.filter(g=>g.length).map(g=>g.map(value=>{
    let id;
    if(typeof value==='string'&&!/^\d+$/.test(value)){
      const matches=shapes.filter(shape=>shape.name===value);
      if(matches.length!==1)throw new Error(`Animation target name ${JSON.stringify(value)} resolves to ${matches.length} shapes; use a unique name or numeric id`);
      id=matches[0].id;
    }else id=integer(value,'animation shape id');
    if(!valid.has(id))throw new Error(`Animation target shape ${id} does not exist on the slide`);
    if(seen.has(id))throw new Error(`Shape ${id} occurs in more than one animation group`);
    seen.add(id);return id;
  }));
}

/** Create an OOXML main sequence: one click advances one group of native objects. */
export function createTimingXml(groups,{effect='fade',durationMs=400}={}) {
  if(!['appear','fade','none'].includes(effect))throw new Error('effect must be appear, fade, or none');
  durationMs=integer(durationMs,'durationMs');
  if(durationMs<100||durationMs>3000)throw new Error('durationMs must be between 100 and 3000');
  if(effect==='none'||!groups.length)return '';
  let nextId=3;
  const steps=groups.map(group=>{
    const outer=nextId++,inner=nextId++;
    const effects=group.map((spid,index)=>{
      spid=integer(spid,'shape id');
      const effectId=nextId++,setId=nextId++;
      const set=`<p:set><p:cBhvr><p:cTn id="${setId}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>`;
      const fade=effect==='fade'?`<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${nextId++}" dur="${durationMs}"/><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cBhvr></p:animEffect>`:'';
      return `<p:par><p:cTn id="${effectId}" presetID="${effect==='fade'?10:1}" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="${index===0?'clickEffect':'withEffect'}"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${set}${fade}</p:childTnLst></p:cTn></p:par>`;
    }).join('');
    return `<p:par><p:cTn id="${outer}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="${inner}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${effects}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`;
  }).join('');
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${steps}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
}

export function patchSlideXml(xml,groups,{effect='fade',durationMs=400,transition='fade',transitionSpeed='med',replaceExisting=false}={}) {
  if(!['fade','none'].includes(transition))throw new Error('transition must be fade or none');
  if(!['slow','med','fast'].includes(transitionSpeed))throw new Error('transitionSpeed must be slow, med, or fast');
  let structure=rootChildren(xml);
  const old=structure.children.filter(x=>['p:timing','p:transition'].includes(x.name));
  if(old.length&&!replaceExisting)throw new Error('Slide already has timing/transition; set replaceExisting:true to deliberately replace it');
  for(const item of [...old].sort((a,b)=>b.start-a.start))xml=xml.slice(0,item.start)+xml.slice(item.end);
  structure=rootChildren(xml);
  const timing=createTimingXml(groups,{effect,durationMs});
  const trans=transition==='fade'?`<p:transition spd="${transitionSpeed}" advClick="1"><p:fade/></p:transition>`:'';
  // CT_Slide child order: cSld, clrMapOvr?, transition?, timing?, extLst?.
  const anchor=structure.children.find(x=>x.name==='p:extLst')?.start ?? structure.rootClose;
  return xml.slice(0,anchor)+trans+timing+xml.slice(anchor);
}

async function slideOrder(zip){
  const pres=zip.file('ppt/presentation.xml'),rels=zip.file('ppt/_rels/presentation.xml.rels');
  if(!pres||!rels)throw new Error('PPTX lacks presentation XML or relationships');
  const p=await pres.async('string'),r=await rels.async('string'); safeXml(p,'presentation');safeXml(r,'presentation relationships');
  const targets=new Map([...r.matchAll(/<(?:\w+:)?Relationship\b([^>]*?)\/?\s*>/g)].map(m=>attributes(m[1])).filter(a=>a.Type?.endsWith('/slide')&&a.TargetMode!=='External').map(a=>[a.Id,xmlDecode(a.Target)]));
  const files=[...p.matchAll(/<p:sldId\b([^>]*?)\/?\s*>/g)].map(m=>{
    const rid=attributes(m[1])['r:id'],target=targets.get(rid);
    if(!target)throw new Error(`Missing internal slide relationship ${rid}`);
    const file=path.posix.normalize(target.startsWith('/')?target.slice(1):`ppt/${target}`);
    if(!/^ppt\/slides\/[^/]+\.xml$/.test(file)||!zip.file(file))throw new Error(`Unsupported slide part ${file}`);
    return file;
  });
  if(!files.length)throw new Error('PPTX has no slides');
  return files;
}

/**
 * Input: Buffer/Uint8Array of a generated PPTX. Return {buffer, report}.
 * options.groupsBySlide: 1-based slide number -> [[id1,id2],[id3]], one click/group.
 * Each target may also be its unique cNvPr name, e.g. 'editable-text-3'.
 * Supplying groupsBySlide disables automatic selection on omitted pages.
 * Default names: editable-text-*, editable-shape-*, process-*, body-*, etc.
 */
export async function animatePptxBuffer(input,options={}) {
  const zip=await JSZip.loadAsync(input,{checkCRC32:true});
  const files=await slideOrder(zip),report=[];
  let changed=false;
  if(options.groupsBySlide!==undefined&&(typeof options.groupsBySlide!=='object'||options.groupsBySlide===null||Array.isArray(options.groupsBySlide)))throw new Error('groupsBySlide must be an object keyed by 1-based slide number');
  for(const key of Object.keys(options.groupsBySlide??{}))if(integer(key,'slide index')>files.length)throw new Error(`Slide index ${key} exceeds slide count`);
  for(let i=0;i<files.length;i++){
    const xml=await zip.file(files[i]).async('string');
    const shapes=listSlideShapes(xml);
    const explicit=options.groupsBySlide?.[i+1];
    const groups=options.effect==='none'?[]:normalizedGroups(explicit,shapes,options.groupsBySlide===undefined&&options.autoSelect!==false);
    const patched=patchSlideXml(xml,groups,options);
    if(patched!==xml){zip.file(files[i],patched);changed=true;}
    report.push({slide:i+1,part:files[i],effect:options.effect??'fade',groups,clicks:groups.length,shapeCount:shapes.length,transition:options.transition??'fade'});
  }
  const buffer=changed?await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}}):Buffer.from(input);
  return {buffer,report};
}

/** Create a new animated file; refuses to overwrite any existing output by default. */
export async function animatePptx(inputPath,outputPath,options={}) {
  if(path.resolve(inputPath)===path.resolve(outputPath))throw new Error('Use a different output path to preserve the original deck');
  const result=await animatePptxBuffer(await fs.readFile(inputPath),options);
  await fs.mkdir(path.dirname(path.resolve(outputPath)),{recursive:true});
  await fs.writeFile(outputPath,result.buffer,{flag:options.overwrite?'w':'wx'});
  return {outputPath:path.resolve(outputPath),slides:result.report};
}

async function main(){
  const args=process.argv.slice(2);
  if(args.includes('--help')||args.length<2){
    console.log('Usage: node scripts/animate-pptx.mjs input.pptx output.pptx [--effect fade|appear|none] [--groups groups.json] [--duration 400] [--transition fade|none] [--replace-existing]\nGroups JSON: {"2":[[5,6],[7]]}; slide indices are 1-based. Default: fade transitions + named-body-object fade on click. Existing outputs are never overwritten.');
    if(!args.includes('--help'))process.exitCode=2;return;
  }
  const [input,output,...rest]=args,options={};
  for(let i=0;i<rest.length;i++){
    if(rest[i]==='--effect')options.effect=rest[++i];
    else if(rest[i]==='--groups')options.groupsBySlide=JSON.parse(await fs.readFile(rest[++i],'utf8'));
    else if(rest[i]==='--duration')options.durationMs=Number(rest[++i]);
    else if(rest[i]==='--transition')options.transition=rest[++i];
    else if(rest[i]==='--replace-existing')options.replaceExisting=true;
    else throw new Error(`Unknown option: ${rest[i]}`);
  }
  console.log(JSON.stringify(await animatePptx(input,output,options),null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error(`Animation failed: ${e.message}`);process.exitCode=1;});
