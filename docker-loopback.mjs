// The Supabase CLI leaves HostIp blank. Patch Docker's create request before the daemon can publish a port.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const address = '127.0.0.1';
export class LoopbackError extends Error {}
const fail = message => { throw new LoopbackError(message); };

function socketFor(host) {
  if (/^unix:\/\/(\/var\/run\/docker\.sock|\/run\/docker\.sock)$/.test(host)) return host.slice(7);
  const pipe = /^npipe:\/\/(?:\/\/)?\.\/pipe\/([a-zA-Z0-9-]+)$/.exec(host);
  if (pipe) return '\\\\.\\pipe\\' + pipe[1];
  return fail('Socket Docker fora do daemon local.');
}

function settings(hostConfig, allowed) {
  if (hostConfig.PublishAllPorts) fail('Publicação automática de todas as portas recusada.');
  const result = {};
  for (const [key, entries] of Object.entries(hostConfig.PortBindings ?? {})) {
    if (!entries?.length) continue;
    const port = String(allowed[key] ?? '');
    if (!port || entries.some(entry => String(entry.HostPort) !== port)) fail('Porta Docker fora da lista de homologação.');
    result[key] = [{ HostIp: address, HostPort: port }];
  }
  return result;
}

function expectedFor(name, project, rules) {
  if (name === `supabase_db_${project}`) return { '5432/tcp': rules.db };
  if (name === `supabase_kong_${project}`) return { '8000/tcp': rules.api };
  return {};
}

const matchesBindings = (actual, expected) => {
  const configured = Object.entries(actual ?? {}).filter(([, entries]) => entries?.length);
  const target = Object.entries(expected);
  return configured.length === target.length && target.every(([key, [binding]]) =>
    actual?.[key]?.length === 1 && actual[key][0].HostIp === address &&
    String(actual[key][0].HostPort) === binding.HostPort);
};

function collect(stream) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    stream.on('data', data => {
      size += data.length;
      if (size > 8 * 1024 * 1024) stream.destroy(Error());
      else chunks.push(data);
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}
function engine(host) {
  const socketPath = socketFor(host);
  return async (method, path, body, permit404 = false) => {
    const input = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const res = await new Promise((resolve, reject) => {
      const req = request({ socketPath, method, path, timeout: 60_000,
        ...(input && { headers: { 'Content-Type':'application/json', 'Content-Length':input.length } }),
      }, resolve);
      req.on('timeout', () => req.destroy(Error()));
      req.on('error', reject);
      req.end(input);
    });
    const content = await collect(res);
    if (permit404 && res.statusCode === 404) return null;
    if (res.statusCode >= 400) fail(`Docker recusou ${method} ${path.split('?')[0].replace(/\/containers\/[^/]+/,'/containers/(local)')} (HTTP ${res.statusCode}).`);
    return content.length ? JSON.parse(content) : undefined;
  };
}

function verifyIdentity(item, name, project, network) {
  if (item?.Name !== '/' + name || !name.startsWith('supabase_') || !name.replace(/\.biosaude-loopback-backup$/,'').endsWith('_'+project) ||
      item.Config?.Labels?.['com.docker.compose.project'] !== project ||
      item.HostConfig?.NetworkMode !== network ||
      Object.keys(item.NetworkSettings?.Networks ?? {}).join() !== network) {
    fail('Container estranho ou fora da rede exclusiva de homologação.');
  }
}

function createSpec(old, network, bindings) {
  const host = { ...old.HostConfig, PortBindings:bindings, PublishAllPorts:false };
  if (host.AutoRemove || host.VolumesFrom?.length) fail('Montagem automática incompatível com recuperação sem perda.');
  if (old.Name.startsWith('/supabase_db_') && !(old.Mounts??[]).some(m =>
    m.Type==='volume' && m.Name && m.Destination==='/var/lib/postgresql/data' && m.RW))
    fail('Volume PostgreSQL esperado não encontrado; o container original foi preservado.');
  host.Mounts = [...(host.Mounts ?? [])];
  for (const mount of old.Mounts ?? []) {
    if (!['volume','bind','tmpfs'].includes(mount.Type)) fail('Tipo de montagem desconhecido.');
    const target = mount.Destination;
    const existing = host.Mounts.some(m => m.Target === target) ||
      (host.Binds ?? []).some(b => b.endsWith(':'+target) || b.includes(':'+target+':')) ||
      Object.hasOwn(host.Tmpfs ?? {},target);
    if (existing) continue;
    if (mount.Type !== 'volume' || !mount.Name || !target) fail('Montagem do container sem configuração reproduzível.');
    host.Mounts.push({ Type:'volume', Source:mount.Name, Target:target, ReadOnly:!mount.RW });
  }
  const oldEndpoint = old.NetworkSettings.Networks[network];
  const endpoint = Object.fromEntries(['Aliases','IPAMConfig','Links','DriverOpts','GwPriority']
    .filter(key => oldEndpoint[key] != null).map(key => [key,oldEndpoint[key]]));
  return { ...old.Config, Image:old.Image, HostConfig:host, NetworkingConfig:{ EndpointsConfig:{ [network]:endpoint } } };
}

const mountsMatch = (before, after) => {
  const key = m => JSON.stringify([m.Type,m.Name ?? m.Source,m.Destination,m.RW]);
  return JSON.stringify((before.Mounts??[]).map(key).sort()) === JSON.stringify((after.Mounts??[]).map(key).sort());
};

export function managedStack(host, project, network, rules) {
  const get = engine(host);
  const inspect = id => get('GET',`/containers/${encodeURIComponent(id)}/json`,undefined,true);
  const stop = id => get('POST',`/containers/${id}/stop?t=30`);
  const start = id => get('POST',`/containers/${id}/start`);
  const remove = id => get('DELETE',`/containers/${id}?v=false`);
  const rename = (id,name) => get('POST',`/containers/${id}/rename?name=${encodeURIComponent(name)}`);
  const saved = /\.biosaude-loopback-backup$/;
  async function inventory() {
    const rows = await get('GET','/containers/json?all=1');
    const candidates = rows.flatMap(row => (row.Names??[])
      .map(name=>name.slice(1)).filter(name=>name.startsWith('supabase_') && name.replace(saved,'').endsWith('_'+project)));
    return Promise.all(candidates.map(async name => {
      const item = await inspect(name);
      verifyIdentity(item,name,project,network);
      return [name,item];
    }));
  }

  // A backup is deliberately stopped and kept until its replacement has passed all validations.
  function actualExpected(item, name) {
    const required=expectedFor(name.replace(saved,''),project,rules);
    const result=settings(item.HostConfig,required);
    if(Object.keys(result).length!==Object.keys(required).length) fail('Mapeamento obrigatório ausente.');
    return result;
  }
  function secure(item, expected) {
    return matchesBindings(item.HostConfig.PortBindings,expected) &&
      (!item.State.Running || matchesBindings(item.NetworkSettings.Ports,expected));
  }
  return {
    async recover() {
      // Verify ownership and scope before stopping anything. A previous interrupted run may have left a backup.
      const found = await inventory();
      for (const [name,item] of found) {
        if (!item.State.Running) continue;
        try {
          if (saved.test(name) || !secure(item,actualExpected(item,name))) await stop(item.Id);
        } catch (error) {
          await stop(item.Id);
          throw error;
        }
      }
      for (const [name,item] of found) {
        if (saved.test(name)) continue;
        const expected = actualExpected(item,name);
        if (secure(item,expected)) continue;
        if (found.some(([n])=>n===name+'.biosaude-loopback-backup')) fail('Recuperação anterior precisa ser retomada a partir do backup local.');
        const spec = createSpec(item,network,expected);
        await rename(item.Id,name+'.biosaude-loopback-backup');
        try {
          const newItem = await get('POST',`/containers/create?name=${encodeURIComponent(name)}`,spec);
          const replacement = await inspect(newItem.Id);
          if (!replacement || !mountsMatch(item,replacement) || !secure(replacement,expected)) fail('Montagens ou portas do substituto divergentes.');
          await start(newItem.Id);
        } catch (error) {
          const bad = await inspect(name);
          if (bad?.State.Running) await stop(bad.Id);
          if (bad) await remove(bad.Id);
          await rename(item.Id,name); // preserve the original, but never restart a wildcard mapping
          throw error;
        }
      }
      for (const [backup,original] of found.filter(([name])=>saved.test(name))) {
        const name=backup.replace(saved,'');
        const expected=actualExpected(original,backup);
        let replacement=await inspect(name);
        if (!replacement) {
          const spec=createSpec(original,network,expected);
          const created=await get('POST',`/containers/create?name=${encodeURIComponent(name)}`,spec);
          replacement=await inspect(created.Id);
        }
        if (!replacement || !mountsMatch(original,replacement) || !secure(replacement,expected)) fail('Substituto incompatível com o backup local.');
        if (!replacement.State.Running) await start(replacement.Id);
      }
      const planned=(await inventory()).filter(([name])=>!saved.test(name));
      planned.sort(([a],[b])=>Number(b.startsWith('supabase_db_'))-Number(a.startsWith('supabase_db_')));
      for (const [name,item] of planned) {
        if (!item.State.Running && secure(item,actualExpected(item,name))) await start(item.Id);
      }
      return ['supabase_db_','supabase_kong_'].every(prefix=>planned.some(([name])=>name===prefix+project));
    },
    async verify({ finalize = false } = {}) {
      const found=await inventory();
      for (const [name,item] of found) {
        if (saved.test(name)) {
          if (item.State.Running) await stop(item.Id);
          continue;
        }
        let valid=false;
        try { valid=secure(item,actualExpected(item,name)); } catch {}
        if (!valid) {
          if (item.State.Running) await stop(item.Id);
          fail('Docker publicou portas fora do loopback; o container afetado foi parado.');
        }
      }
      if (!['supabase_db_','supabase_kong_'].every(prefix=>found.some(([name,item])=>name===prefix+project && item.State.Running)))
        fail('PostgreSQL ou API Supabase local não está em execução.');
      if (finalize) for (const [name,original] of found.filter(([n])=>saved.test(n))) {
        const replacement=found.find(([n])=>n===name.replace(saved,''))?.[1];
        if (!replacement?.State.Running || !mountsMatch(original,replacement)) fail('Backup retido porque o substituto não foi validado.');
        await remove(original.Id); // API v=false retains named and anonymous volumes
      }
    },
    async quarantine() {
      for (const [name,item] of await inventory()) {
        const bindings=item.NetworkSettings?.Ports??{};
        if(item.State.Running && (saved.test(name)||Object.values(bindings).some(values=>values?.length))) await stop(item.Id);
      }
    }
  };
}

export async function withLoopbackProxy(host, project, network, rules, action) {
  const win=process.platform==='win32';
  const folder=win?null:mkdtempSync(join(tmpdir(),'biosaude-docker-'));
  const name='biosaude-docker-'+randomUUID();
  const path=win?'\\\\.\\pipe\\'+name:join(folder,'docker.sock');
  const proxyHost=win?'npipe:////./pipe/'+name:'unix://'+path;
  const child=spawn(process.execPath,[fileURLToPath(import.meta.url)],{
    env:{...(process.env.SystemRoot && {SystemRoot:process.env.SystemRoot}),BIOSAUDE_DOCKER_PROXY_SPEC:JSON.stringify({host,project,network,rules,path})},
    stdio:['ignore','ignore','ignore','ipc'],windowsHide:true,
  });
  try {
    await new Promise((resolve, reject)=>{
      const timer=setTimeout(()=>reject(new LoopbackError('Proxy Docker local não respondeu.')),8000);
      const done=error=>{clearTimeout(timer);error?reject(error):resolve();};
      child.once('message',message=>done(message==='ready'?null:new LoopbackError('Proxy Docker local indisponível.')));
      child.once('exit',()=>done(new LoopbackError('Proxy Docker local encerrou.')));
      child.once('error',()=>done(new LoopbackError('Falha ao abrir proxy Docker local.')));
    });
    return await action(proxyHost);
  } finally {
    if(child.exitCode===null && child.signalCode===null) await new Promise(resolve=>{
      child.once('exit',resolve);
      child.kill();
    });
    if(folder) rmSync(folder,{recursive:true,force:true});
  }
}

if(process.env.BIOSAUDE_DOCKER_PROXY_SPEC && process.send) {
  const {host,project,network,rules,path} = JSON.parse(process.env.BIOSAUDE_DOCKER_PROXY_SPEC);
  const socketPath=socketFor(host);
  const server=createServer(async (incoming,outgoing)=>{
    try {
      const url=new URL(incoming.url,'http://docker.local');
      let input;
      if(incoming.method==='POST' && /^\/(?:v[\d.]+\/)?containers\/create$/.test(url.pathname)) {
        const spec=JSON.parse(await collect(incoming));
        const name=url.searchParams.get('name')??'';
        const labels=spec.Labels??{};
        const hostConfig=spec.HostConfig??{};
        if(labels['com.docker.compose.project']!==project || !name.startsWith('supabase_') ||
           !name.endsWith('_'+project) || hostConfig.NetworkMode!==network) fail('Container fora da homologação.');
        const expected=expectedFor(name,project,rules);
        const bindings=settings(hostConfig,expected);
        if(Object.keys(bindings).length!==Object.keys(expected).length) fail('Mapeamento obrigatório ausente.');
        spec.HostConfig={...hostConfig,PortBindings:bindings,PublishAllPorts:false};
        input=Buffer.from(JSON.stringify(spec));
      }
      const headers={...incoming.headers};
      if(input){delete headers['transfer-encoding'];headers['content-length']=input.length;}
      const upstream=request({socketPath,path:incoming.url,method:incoming.method,headers},res=>{
        outgoing.writeHead(res.statusCode,res.headers);
        outgoing.flushHeaders(); // Docker's wait endpoint sends headers before container start.
        res.pipe(outgoing);
      });
      upstream.on('error',()=>{if(!outgoing.headersSent) outgoing.writeHead(502);outgoing.end();});
      incoming.on('aborted',()=>upstream.destroy());
      if(input) upstream.end(input);
      else incoming.pipe(upstream);
    } catch {
      outgoing.writeHead(400,{'Content-Type':'application/json'});
      outgoing.end(JSON.stringify({message:'Criação recusada pelo controle de portas exclusivo da homologação.'}));
    }
  });
  server.on('upgrade',(req,socket,head)=>{
    if(!/^\/(?:v[\d.]+\/)?(?:exec\/[a-f0-9]+\/start|containers\/[^/]+\/attach)(?:\?|$)/.test(req.url??'')) {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      return;
    }
    const upstream=connect(socketPath,()=>{
      let header=`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
      for(let i=0;i<req.rawHeaders.length;i+=2) header+=req.rawHeaders[i]+': '+req.rawHeaders[i+1]+'\r\n';
      upstream.write(header+'\r\n');
      if(head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on('error',()=>socket.destroy());
    socket.on('error',()=>upstream.destroy());
    socket.on('close',()=>upstream.destroy());
  });
  server.on('error',()=>process.send('error'));
  process.on('disconnect',()=>process.exit(0));
  server.listen({path,readableAll:false,writableAll:false},()=>{
    if(process.platform!=='win32') chmodSync(path,0o600);
    process.send('ready');
  });
}
