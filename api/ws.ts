import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { Client, SFTPWrapper, ClientChannel } from 'ssh2';
import crypto from 'crypto';
import path from 'path';
import type { ClientMessage, RemoteFile, ServerMessage } from '../lib/protocol';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 12 * 1024 * 1024 });
const send = (ws:WebSocket, msg:ServerMessage) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));
const fp = (key:Buffer) => 'SHA256:' + crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '');

wss.on('connection', (ws) => {
  const SESSION_LIMIT_MS = 60 * 60 * 1000;
  let sessionTimer:ReturnType<typeof setTimeout>|null=null;
  let client:Client|null=null, shell:ClientChannel|null=null, sftp:SFTPWrapper|null=null;
  const uploads = new Map<string, {stream:ReturnType<SFTPWrapper['createWriteStream']>; done:number; total:number}>();
  const response=(id:string,data?:unknown)=>send(ws,{type:'response',id,ok:true,data});
  const failure=(id:string,e:unknown)=>send(ws,{type:'response',id,ok:false,error:e instanceof Error?e.message:String(e)});
  const getSftp=()=>new Promise<SFTPWrapper>((resolve,reject)=>{
    if(sftp) return resolve(sftp); if(!client) return reject(new Error('SSH is not connected'));
    client.sftp((e,s)=>{ if(e) reject(e); else {sftp=s; resolve(s);} });
  });
  const close=()=>{ if(sessionTimer){clearTimeout(sessionTimer);sessionTimer=null;} for(const u of uploads.values()) try{u.stream.destroy();}catch{} uploads.clear(); try{shell?.end();}catch{} try{sftp?.end();}catch{} try{client?.end();}catch{} shell=null;sftp=null;client=null; };

  ws.on('message', async raw => {
    let m:ClientMessage; try { m=JSON.parse(raw.toString()); } catch { return; }
    try {
      if(m.type==='connect') {
        close(); client=new Client(); let fingerprint=''; const expiresAt=Date.now()+SESSION_LIMIT_MS;
        client.on('error',e=>send(ws,{type:'closed',reason:e.message}));
        client.on('close',()=>send(ws,{type:'closed',reason:'SSH connection closed'}));
        client.on('ready',()=>client!.shell({term:'xterm-256color',cols:m.cols||100,rows:m.rows||30},(err,stream)=>{
          if(err){send(ws,{type:'closed',reason:err.message});return;} shell=stream;
          stream.on('data',(d:Buffer)=>send(ws,{type:'terminal',data:d.toString('utf8')}));
          stream.stderr.on('data',(d:Buffer)=>send(ws,{type:'terminal',data:d.toString('utf8')}));
          stream.on('close',()=>{shell=null;}); sessionTimer=setTimeout(()=>{send(ws,{type:'closed',reason:'Session expired after 60 minutes'});close();try{ws.close(1000,'Session expired');}catch{}},SESSION_LIMIT_MS); send(ws,{type:'connected',fingerprint,expiresAt});
        }));
        client.connect({host:m.host,port:Number(m.port)||22,username:m.username,password:m.password||undefined,privateKey:m.privateKey||undefined,passphrase:m.passphrase||undefined,readyTimeout:15000,keepaliveInterval:10000,keepaliveCountMax:3,hostVerifier:(key: Buffer)=>{fingerprint=fp(key);return true;}});
      } else if(m.type==='input') shell?.write(m.data);
      else if(m.type==='resize') shell?.setWindow(m.rows,m.cols,0,0);
      else if(m.type==='disconnect') close();
      else if(m.type==='list') { const s=await getSftp(); s.readdir(m.path,(e,files)=>{if(e)return failure(m.id,e); const out:RemoteFile[]=files.filter(f=>!['.','..'].includes(f.filename)).map(f=>({name:f.filename,isDirectory:f.attrs.isDirectory(),isFile:f.attrs.isFile(),size:f.attrs.size,mtime:f.attrs.mtime,mode:f.attrs.mode})); response(m.id,out);}); }
      else if(m.type==='mkdir') { const s=await getSftp(); s.mkdir(m.path,e=>e?failure(m.id,e):response(m.id)); }
      else if(m.type==='rename') { const s=await getSftp(); s.rename(m.from,m.to,e=>e?failure(m.id,e):response(m.id)); }
      else if(m.type==='delete') { const s=await getSftp(); const cb=(e?:Error|null)=>e?failure(m.id,e):response(m.id); m.isDirectory?s.rmdir(m.path,cb):s.unlink(m.path,cb); }
      else if(m.type==='download') { const s=await getSftp(); s.stat(m.path,(e,attrs)=>{ if(e)return failure(m.id,e); send(ws,{type:'download-start',id:m.id,name:path.posix.basename(m.path),size:attrs.size}); const rs=s.createReadStream(m.path); rs.on('data',(d:Buffer)=>send(ws,{type:'download-chunk',id:m.id,data:d.toString('base64')})); rs.on('error',e=>failure(m.id,e)); rs.on('end',()=>send(ws,{type:'download-end',id:m.id})); }); }
      else if(m.type==='upload-start') { const s=await getSftp(); const stream=s.createWriteStream(m.path); uploads.set(m.id,{stream,done:0,total:m.size}); stream.on('error',e=>failure(m.id,e)); response(m.id); }
      else if(m.type==='upload-chunk') { const u=uploads.get(m.id); if(!u)throw new Error('Upload not found'); const b=Buffer.from(m.data,'base64'); if(!u.stream.write(b)) await new Promise<void>(r=>u.stream.once('drain',r)); u.done+=b.length; send(ws,{type:'upload-progress',id:m.id,done:u.done,total:u.total}); }
      else if(m.type==='upload-end') { const u=uploads.get(m.id); if(!u)throw new Error('Upload not found'); await new Promise<void>((resolve,reject)=>{u.stream.once('close',resolve);u.stream.once('error',reject);u.stream.end();}); uploads.delete(m.id); response(m.id); }
    } catch(e) { if('id' in m && typeof m.id==='string') failure(m.id,e); else send(ws,{type:'closed',reason:e instanceof Error?e.message:String(e)}); }
  });
  ws.on('close',close);
});
app.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');res.setHeader('Pragma','no-cache');res.setHeader('Expires','0');next();});
app.get('/api/ws', (_req,res)=>res.status(426).send('WebSocket upgrade required'));
export default server;
