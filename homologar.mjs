import { LoopbackError, managedStack, withLoopbackProxy } from './docker-loopback.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, createHmac, createPrivateKey, createPublicKey, pbkdf2Sync, randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname, relative, isAbsolute } from 'node:path';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';

process.umask(0o077);
const here = dirname(fileURLToPath(import.meta.url));
const { values: opt } = parseArgs({ options: {
  repos: {type:'string'}, estado:{type:'string'}, perfil:{type:'string'},
  verificar:{type:'boolean'}, iniciar:{type:'boolean'}, redis:{type:'boolean'},
}});
const repos = realpathSync(opt.repos);
const state = resolve(opt.estado);
const apps = [
  { name:'comercial', repo:'movopainelcomercial', branch:'feat/commercial-corporate-auth', sha:'6c4dad8821514333d90d7a7a117fc0abe0928864', port:55321, web:55331, prefix:'COMMERCIAL', redis:'comercial', entitlement:'CENTRAL_BI' },
  { name:'retencao', repo:'Reten-o-de-Faturamento', branch:'feat/retention-corporate-preview', sha:'41f64cb8740bff314802a0a8c12e55ef9068e6b0', port:55421, web:55431, prefix:'RETENTION', redis:'retention', entitlement:'RETENTION_CENTRAL_BI' },
];
const central = 'https://central-bi-biosaude-git-feat-commercial-entitl-44f2cd-biosaude1.vercel.app';
const redisTargets = [...apps, { name:'limite-global', prefix:'GLOBAL_LIMIT', redis:'global-limit' }];
const requiredBranches = [...apps,
  {repo:'central-bi-biosaude',branch:'feat/commercial-entitlement-api',sha:'88cbaa7098b722510b58e6d5f33b7f3b04ebc40c'},
  {repo:'novo_limite_global_por_cliente',branch:'feat/global-limit-corporate-preview',sha:'499f675d0c0587167528cdb6d1dbe1b290831b5d'}];
let logfile;
class SafeError extends Error {}
const fail = msg => { throw new SafeError(msg); };
function log(message) {
  console.log(message);
  if (logfile) appendFileSync(logfile, `${new Date().toISOString()} ${message}\n`, {mode:0o600});
}
function writeOnce(file, body) {
  if (existsSync(file)) {
    if (lstatSync(file).isSymbolicLink() || readFileSync(file,'utf8') !== body) fail('Estado existente divergente; mantenha a instalação anterior intacta.');
  } else writeFileSync(file, body, {flag:'wx',mode:0o600});
}
function sanitizedEnv() {
  const allowed = /^(path|systemroot|systemdrive|windir|comspec|pathext|temp|tmp|tmpdir|userprofile|appdata|localappdata|home|xdg_.*|https?_proxy|no_proxy|ssl_cert_file|node_extra_ca_certs)$/i;
  return {...Object.fromEntries(Object.entries(process.env).filter(([k])=>allowed.test(k))), CI:'true', NO_COLOR:'1', npm_config_cache:join(state,'.npm-cache'), BUN_INSTALL_CACHE_DIR:join(state,'.bun-cache')};
}
const common = sanitizedEnv();
function run(label, cmd, args, options={}) {
  const result=spawnSync(cmd,args,{env:common,encoding:'utf8',maxBuffer:8*1024*1024,timeout:1_200_000,windowsHide:true,...options});
  if (result.status !== 0) {
    const error = result.stderr ?? '';
    const reason = /403|forbidden/i.test(error) ? 'acesso bloqueado (403)' :
      /timeout|timed out|etimedout/i.test(error) ? 'tempo limite' :
      /not found|could not resolve|eai_again/i.test(error) ? 'dependência ou nome indisponível' :
      /port is already allocated|address already in use/i.test(error) ? 'porta em uso' : '';
    fail(`${label} falhou (código ${result.status ?? result.error?.code ?? 'desconhecido'}${reason ? ', '+reason : ''}).`);
  }
  return result.stdout.trim();
}
function call(label, args, options={}) { return run(label,'docker',args,options); }
function git(dir,args) { return run('Verificação Git','git',['-C',dir,...args]); }
function npm(args, options={}) {
  const win = join(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
  return process.platform==='win32'
    ? run('npm',process.execPath,[win,...args],options)
    : run('npm','npm',args,options);
}
const toolDir=join(state,'ferramentas');
const cliBinary=join(toolDir,process.platform==='win32'?'supabase.exe':'supabase');
function installCli(){
  const checksums={
    'linux_amd64':'0cf60ba1c36f74c1bc052b924f1a90c9c42829c621f29fff6daaa92460098c49',
    'linux_arm64':'d445b00404e8daaac627442d6d016e1fe0798c21f6900f93e93350e50e5d2bb3',
    'windows_amd64':'0d859cbfc18c05bbc34605fa1b275983334e460f8baf1db674f2a21be8a22860',
    'windows_arm64':'67a89d840d64df0a898d77cb8507111d51435d41dd76fd19ed4851c9164a0975',
  };
  const target=`${process.platform==='win32'?'windows':process.platform}_${process.arch==='x64'?'amd64':process.arch}`;
  if(!checksums[target]) fail('Plataforma sem binário oficial registrado do Supabase CLI.');
  mkdirSync(toolDir,{recursive:true});
  if(!existsSync(cliBinary)){
    const file=`supabase_${target}.tar.gz`;
    const stage=join(toolDir,file);
    try {
      run('Download do Supabase CLI','curl',['--fail','--silent','--show-error','--location',
        '--proto','=https','--proto-redir','=https','--max-time','90',
        '--output',stage,'https://github.com/supabase/cli/releases/download/v2.76.14/'+file]);
      if(createHash('sha256').update(readFileSync(stage)).digest('hex')!==checksums[target]) fail('Checksum do Supabase CLI divergente.');
      run('Instalação do Supabase CLI','tar',['-xzf',stage,'-C',toolDir]);
    } finally { if(existsSync(stage)) unlinkSync(stage); }
  }
  if(!lstatSync(cliBinary).isFile() || cli(['--version'],'Versão Supabase CLI')!=='2.76.14') fail('Binário Supabase CLI divergente.');
}
function cli(args,label,options={}){
  return run(label,cliBinary,args,options);
}
function source(app,path) { return git(join(repos,app.repo),['show',`${app.sha}:${path}`]); }
const reach = (port,host='127.0.0.1') => new Promise(resolveReach=>{
  const socket=connect({port,host});
  socket.setTimeout(800);
  socket.on('connect',()=>{socket.destroy();resolveReach(true);});
  socket.on('error',()=>resolveReach(false));
  socket.on('timeout',()=>{socket.destroy();resolveReach(false);});
});
function appDir(app){ return join(state,app.name,'app'); }
function workDir(app){ return join(state,app.name,'supabase-local'); }
function slug(app){return `biosaude-${app.name}-${createHash('sha256').update(state).digest('hex').slice(0,10)}`;}
function network(app){ return `${slug(app)}-loopback`; }
function dbContainer(app){ return `supabase_db_${slug(app)}`; }
const api = app => `http://127.0.0.1:${app.port}`;
const origin = app => `http://localhost:${app.web}`;
const config = app => `project_id = "${slug(app)}"
[api]
enabled = true
port = ${app.port}
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
[db]
port = ${app.port+1}
shadow_port = ${app.port-1}
major_version = 17
[db.pooler]
enabled = false
[db.seed]
enabled = false
[studio]
enabled = false
[inbucket]
enabled = false
[storage]
enabled = false
[realtime]
enabled = false
[edge_runtime]
enabled = false
[analytics]
enabled = false
[auth]
enabled = true
site_url = "${origin(app)}"
additional_redirect_urls = ["${origin(app)}"]
enable_signup = false
[auth.email]
enable_signup = true
enable_confirmations = false
`;
function stageApp(app) {
  const dest=appDir(app), marker=join(dest,'.biosaude-stage');
  const patchFile=join(here,`${app.name}-local.patch`);
  const signature=app.sha+'\n'+createHash('sha256').update(readFileSync(patchFile)).digest('hex')+'\n';
  if (!existsSync(marker)) {
    mkdirSync(dest);
    const arch=join(state,app.name,'source.tar');
    git(join(repos,app.repo),['archive','--format=tar',`--output=${arch}`,app.sha]);
    run('Extração da revisão publicada','tar',['-xf',arch,'-C',dest]);
    unlinkSync(arch);
    git(dest,['apply','--check',patchFile]);
    git(dest,['apply',patchFile]);
    writeOnce(marker,signature);
  } else writeOnce(marker,signature);
  if(readdirSync(dest).some(name=>name.startsWith('.env')&&name!=='.env.example'))
    fail('Arquivo dotenv inesperado na pasta de aplicação isolada.');
  if (app.name==='retencao') {
    writeOnce(join(dest,'scripts','homologacao-biosaude.ts'),readFileSync(join(here,'local-retencao.ts'),'utf8'));
    if (!existsSync(join(dest,'node_modules','tsx','dist','cli.mjs')) ||
        !existsSync(join(dest,'node_modules','vite','bin','vite.js')))
      npm(['ci','--no-audit','--no-fund'],{cwd:dest});
  } else {
    mkdirSync(join(dest,'scripts'),{recursive:true});
    writeOnce(join(dest,'scripts','homologacao-biosaude.ts'),readFileSync(join(here,'local-comercial.ts'),'utf8'));
    if (existsSync(join(dest,'node_modules','vite','bin','vite.js')) &&
        existsSync(join(dest,'node_modules','pg','package.json'))) return;
    const lock=join(dest,'bun.lock');
    const original=readFileSync(lock,'utf8');
    const registry=original.replace(/https:\/\/europe-west[14]-npm\.pkg\.dev\/lovable-core-prod\/sandbox-npm-cache\//g,'https://registry.npmjs.org/');
    // The package versions and integrity hashes remain locked.
    if(registry!==original) writeFileSync(lock,registry);
    try {run('Dependências do Comercial','bun',['install','--frozen-lockfile','--registry','https://registry.npmjs.org'],{cwd:dest});}
    finally {if(registry!==original) writeFileSync(lock,original);}
  }
}
function stageSupabase(app) {
  const local=join(workDir(app),'supabase'), migrations=join(local,'migrations');
  mkdirSync(migrations,{recursive:true});
  if (['.temp/project-ref','.temp/pooler-url'].some(x=>existsSync(join(local,x)))) fail('Vínculo remoto detectado na pasta local do Supabase.');
  writeOnce(join(local,'config.toml'),config(app));
  for (const file of git(join(repos,app.repo),['ls-tree','-r','--name-only',app.sha,'supabase/migrations']).split('\n')) {
    if (app.name==='comercial' && !file.includes('/20261014')) continue;
    writeOnce(join(migrations,file.split('/').at(-1)),source(app,file)+'\n');
  }
}
function containers(app){
  return JSON.parse(call('Inspeção da rede local',['network','inspect',network(app)]))[0];
}
function verifyWindowsListeners(ports) {
  if (process.platform!=='win32') return;
  const portList=ports.join(',');
  const command=`$all=Get-NetTCPConnection -State Listen -ErrorAction Stop; $targets=@(${portList}); @($all | Where-Object { $_.LocalPort -in $targets } | Select-Object LocalAddress,LocalPort) | ConvertTo-Json -AsArray -Compress`;
  // Windows PowerShell 5.1 lacks ConvertTo-Json -AsArray. Invoke the PowerShell 7 used by the package.
  const data=JSON.parse(run('Verificação das portas efetivas no Windows','pwsh',['-NoProfile','-NonInteractive','-Command',command]) || '[]');
  if(!Array.isArray(data) || ports.some(port=>!data.some(x=>Number(x.LocalPort)===port && x.LocalAddress==='127.0.0.1')) ||
     data.some(x=>x.LocalAddress!=='127.0.0.1')) fail('O Windows não confirmou as portas exclusivas em 127.0.0.1.');
}
async function waitForLocalApi(app) {
  const deadline=Date.now()+60_000;
  while(Date.now()<deadline){
    try {
      const check=await fetch(api(app)+'/auth/v1/health',{redirect:'error',signal:AbortSignal.timeout(2500)});
      await check.body?.cancel();
      if(check.ok && await reach(app.port+1)) {
        const dbReady=call('Saúde do PostgreSQL local',['inspect','--format',
          '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',dbContainer(app)]);
        if(dbReady==='healthy' || dbReady==='running') return;
      }
    } catch {}
    await new Promise(resolve=>setTimeout(resolve,750));
  }
  fail('A API ou o PostgreSQL local não respondeu; os backups dos containers foram preservados.');
}
async function startStack(app, dockerHost) {
  const netName=network(app);
  const existing=call('Listagem das redes Docker',['network','ls','--format','{{.Name}}']).split('\n');
  if (!existing.includes(netName)) {
    if (await reach(app.port) || await reach(app.port+1) || await reach(app.port-1)) fail(`Conflito de portas do ${app.name}.`);
    call('Rede Docker restrita ao loopback',['network','create','--driver','bridge','--opt','com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
      '--label',`biosaude.fixture=${slug(app)}`,netName]);
  }
  const net=containers(app);
  if (net.Driver!=='bridge' || net.Options?.['com.docker.network.bridge.host_binding_ipv4']!=='127.0.0.1' ||
      net.Labels?.['biosaude.fixture']!==slug(app) ||
      Object.values(net.Containers??{}).some(({Name})=>
        !Name.startsWith('supabase_') || !Name.replace(/\.biosaude-loopback-backup$/,'').endsWith('_'+slug(app))))
    fail('Rede Docker inesperada.');
  const rules={api:app.port,db:app.port+1};
  const guard=managedStack(dockerHost,slug(app),netName,rules);
  const args=['--workdir',workDir(app),'--network-id',netName];
  try {
    const existingStack=await guard.recover();
    return await withLoopbackProxy(dockerHost,slug(app),netName,rules,async proxyHost=>{
      const guardedEnv={...common,DOCKER_HOST:proxyHost};
      try {
        if(!existingStack) cli(['start',...args],'Supabase start do '+app.name,{env:guardedEnv});
      } catch (error) {
        if (!(error instanceof SafeError) || !error.message.includes('(403)') ||
            Object.keys(containers(app).Containers??{}).length) throw error;
        log('Registro padrão bloqueado. Tentando as mesmas imagens oficiais pelo Docker Hub.');
        cli(['start',...args],'Supabase start pelo Docker Hub do '+app.name,
          {env:{...guardedEnv,SUPABASE_INTERNAL_IMAGE_REGISTRY:'docker.io'}});
      }
      await guard.verify();
      if (!Object.values(containers(app).Containers??{}).some(x=>x.Name===dbContainer(app))) fail('Container PostgreSQL local inesperado.');
      await waitForLocalApi(app);
      cli(['migration','up','--local',...args],'Migrações locais do '+app.name,{env:guardedEnv});
      const output=cli(['status','-o','json',...args],'Estado local do '+app.name,{env:guardedEnv});
      const status=JSON.parse(output.slice(output.indexOf('{')));
      if ((status.API_URL!==api(app) && status.API_URL!==api(app)+'/') || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) fail('URL ou chaves locais divergentes.');
      await waitForLocalApi(app);
      verifyWindowsListeners([app.port,app.port+1]);
      await guard.verify({finalize:true});
      return status;
    });
  } catch(error) {
    await guard.quarantine();
    throw error;
  }
}
function scram(password) {
  const salt = randomBytes(16);
  const salted = pbkdf2Sync(password,salt,4096,32,'sha256');
  const key = role => createHmac('sha256',salted).update(role).digest();
  const stored = createHash('sha256').update(key('Client Key')).digest('base64');
  return `SCRAM-SHA-256$4096:${salt.toString('base64')}$${stored}:${key('Server Key').toString('base64')}`;
}
function psql(app,sql) {
  return call('SQL local do '+app.name,
    ['exec','-i',dbContainer(app),'psql','-X','-U','postgres','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'], {input:sql});
}
async function response(url, args, statusOk=true){
  const r=await fetch(url,{...args,redirect:'error',signal:AbortSignal.timeout(7000)});
  return {status:r.status,ok:!statusOk||r.ok,body:await r.json().catch(()=>null)};
}
async function localUsers(app,status,privateState) {
  const keys={apikey:status.SERVICE_ROLE_KEY,Authorization:`Bearer ${status.SERVICE_ROLE_KEY}`,'Content-Type':'application/json'};
  const usersUrl=api(app)+'/auth/v1/admin/users';
  const users=(await response(usersUrl+'?page=1&per_page=100',{headers:keys})).body?.users;
  if (!Array.isArray(users)) fail('Admin API do Supabase local indisponível.');
  const result={};
  for (const kind of ['admin','visitante']) {
    const email=`${kind}.biosaude@synthetic.example.com`;
    const password=privateState[kind];
    let user=users.find(u=>u.email===email);
    if (!user) {
      const created=await response(usersUrl,{method:'POST',headers:keys,body:JSON.stringify({email,password,email_confirm:true})});
      if (!created.ok) fail('Cadastro de usuário sintético falhou.');
      user=created.body?.user??created.body;
    }
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(user?.id??'')) fail('Identificador Auth local inválido.');
    const signed=await response(api(app)+'/auth/v1/token?grant_type=password',{method:'POST',
      headers:{apikey:status.ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    if (!signed.ok || signed.body?.user?.id!==user.id || !signed.body?.access_token) fail('Login local da conta sintética falhou.');
    result[kind]={id:user.id,token:signed.body.access_token};
  }
  return result;
}
function shellSecretFile(app){
  const path=join(state,app.name,'credenciais-locais.json');
  if (existsSync(path) && !lstatSync(path).isFile()) fail('Arquivo de credenciais locais inválido.');
  if (!existsSync(path)) writeOnce(path,JSON.stringify(Object.fromEntries(['admin','visitante','leitor'].map(k=>[k,randomBytes(24).toString('hex')]))));
  const values=JSON.parse(readFileSync(path,'utf8'));
  if (!['admin','visitante','leitor'].every(k=>/^[a-f0-9]{48}$/.test(values[k]??''))) fail('Credenciais locais alteradas.');
  return values;
}
function profileFile() {
  if (!opt.perfil) return {};
  const file=realpathSync(opt.perfil);
  if (spawnSync('git',['-C',dirname(file),'rev-parse','--is-inside-work-tree'],{env:common,stdio:'ignore'}).status===0)
    fail('Perfil corporativo deve ficar fora de repositórios.');
  const result=parseEnv(readFileSync(file,'utf8'));
  const allowed=new Set(['GLOBAL_LIMIT_SESSION_STORE_URL','GLOBAL_LIMIT_SESSION_STORE_TOKEN']);
  for (const a of apps) {
    for (const part of ['CLIENT_ID','CLIENT_SECRET','TENANT_ID']) allowed.add(`${a.prefix}_ENTRA_${part}`);
    for (const part of ['URL','TOKEN']) allowed.add(`${a.prefix}_SESSION_STORE_${part}`);
    for (const part of ['ASSERTION_KEY_ID','ASSERTION_PRIVATE_KEY']) allowed.add(`${a.entitlement}_${part}`);
    allowed.add(`${a.prefix}_CENTRAL_BI_VERCEL_BYPASS_TOKEN`);
  }
  if (Object.keys(result).some(k=>!allowed.has(k))) fail('Perfil contém variável fora da lista de homologação.');
  return result;
}
function appEnv(app,status,secret,profile){
  const filtered=Object.fromEntries(Object.entries(profile).filter(([key])=>key.startsWith(app.prefix+'_')||key.startsWith(app.entitlement+'_')));
  const isCommercial=app.name==='comercial';
  return {...common,...filtered,NODE_ENV:'development',
    [`${app.prefix}_LOCAL_SUPABASE`]:'1', [`${app.prefix}_AUTH_MODE`]:'preview',
    [`${app.prefix}_PREVIEW_ORIGIN`]:origin(app), [`${app.prefix}_PREVIEW_SUPABASE_URL`]:api(app),
    [`${app.entitlement}_ENTITLEMENT_URL`]:central+'/api/internal/'+(isCommercial?'commercial':'retention')+'-entitlement',
    ...(isCommercial ? {COMMERCIAL_PREVIEW_SUPABASE_PUBLISHABLE_KEY:status.ANON_KEY,
      COMMERCIAL_PREVIEW_READER_DATABASE_URL:`postgresql://commercial_preview_reader:${secret.leitor}@127.0.0.1:55322/postgres?sslmode=disable`}
      : {VITE_RETENTION_CORPORATE_PREVIEW:'true',RETENTION_PREVIEW_SUPABASE_ANON_KEY:status.ANON_KEY,
        RETENTION_PREVIEW_SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY})};
}
async function assertRestDenied(app,status,path,verb='GET',body,token=status.ANON_KEY){
  const r=await response(api(app)+'/rest/v1/'+path,{method:verb,
    headers:{apikey:status.ANON_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},
    ...(body && {body:JSON.stringify(body)})});
  if (![401,403].includes(r.status) || r.body?.code!=='42501') fail('Acesso indevido não bloqueado explicitamente nas ACLs.');
}
function tsx(app, action, env) {
  run('Execução local da Retenção',process.execPath,
    [join(appDir(app),'node_modules','tsx','dist','cli.mjs'),'scripts/homologacao-biosaude.ts',action],{cwd:appDir(app),env});
}
async function seedAndVerify(app,status,secret,env){
  const users=await localUsers(app,status,secret);
  const admin=users.admin.id;
  if (app.name==='comercial') {
    const acl=source(app,'supabase/operations/commercial-preview-reader.sql')
      .replace('CREATE FUNCTION public.dashboard_preview_read_history','CREATE OR REPLACE FUNCTION public.dashboard_preview_read_history');
    psql(app,`DO $$BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='commercial_preview_reader') THEN
        CREATE ROLE commercial_preview_reader LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION PASSWORD '${scram(secret.leitor)}';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname='commercial_preview_reader' AND r.rolcanlogin
        AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication)
        AND NOT EXISTS(SELECT FROM pg_auth_members m WHERE m.member=r.oid)
        AND NOT has_schema_privilege(r.rolname,'public','CREATE')) THEN RAISE EXCEPTION 'Papel inesperado'; END IF;
      END$$;\n${acl}`);
    psql(app,`BEGIN;
      INSERT INTO public.dashboard_admins(user_id) VALUES ('${admin}') ON CONFLICT DO NOTHING;
      DO $$BEGIN
        IF EXISTS(SELECT 1 FROM public.dashboard_settings WHERE active_import_id IS NOT NULL
            AND active_import_id <> '10000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Publicação anterior divergente'; END IF;
      END$$;
      SELECT EXISTS (SELECT 1 FROM public.dashboard_settings WHERE active_import_id IS NULL) AS vazio \\gset
      \\if :vazio
        SET LOCAL ROLE authenticated;
        SET LOCAL request.jwt.claim.sub='${admin}';
        SELECT public.dashboard_publish('10000000-0000-4000-8000-000000000001',NULL,'fixture-biosaude-sintetica.xlsx',
          '[{"gr":"TESTE","rep":"TESTE","uf":"SP","marca":"TESTE","topico":"TESTE","tipo":"TESTE","periodo":"Q3 2026","mes":"08","cliente":"Fictício","valor":123.45}]',
          '[{"gr":"TESTE","rep":"TESTE","uf":"SP","marca":"TESTE","topico":"TESTE","tipo":"TESTE","periodo":"Q3 2026","meta":300,"metaFinanceira":270}]');
      \\endif
      COMMIT;`);
    run('Leitura pelo papel real do Comercial','bun',['scripts/homologacao-biosaude.ts'],{cwd:appDir(app),env});
    await assertRestDenied(app,status,'dashboard_faturamento?select=data');
    await assertRestDenied(app,status,'rpc/dashboard_read_manifest','POST',{});
    await assertRestDenied(app,status,'rpc/dashboard_read_manifest','POST',{},users.visitante.token);
  } else {
    psql(app,`BEGIN;
      REVOKE ALL ON public.retention_roles,public.retention_current,public.retention_imports,public.retention_audit_versions FROM PUBLIC,anon,authenticated;
      GRANT SELECT ON public.retention_roles,public.retention_current,public.retention_imports,public.retention_audit_versions TO service_role;
      INSERT INTO public.retention_roles (user_id,role) VALUES ('${admin}','admin') ON CONFLICT DO NOTHING;
      DO $$BEGIN
        IF EXISTS(SELECT 1 FROM public.retention_roles WHERE user_id='${users.visitante.id}')
          OR NOT EXISTS(SELECT 1 FROM public.retention_roles WHERE user_id='${admin}' AND role='admin')
        THEN RAISE EXCEPTION 'Perfis sintéticos divergentes'; END IF;
      END$$;
      COMMIT;`);
    tsx(app,'seed',{...env,BIOSAUDE_FIXTURE_ADMIN:admin});
    await assertRestDenied(app,status,'retention_current?select=payload');
    await assertRestDenied(app,status,'retention_audit_versions?select=payload','GET',undefined,users.visitante.token);
    await assertRestDenied(app,status,'rpc/replace_retention_dataset','POST',{new_payload:{},expected_id:null,actor_id:admin});
  }
}
function redisSettings(app,profile) {
  const url=URL.parse(profile[app.prefix+'_SESSION_STORE_URL']??'');
  const token=profile[app.prefix+'_SESSION_STORE_TOKEN'];
  if (!url || url.protocol!=='https:' || !/^[a-z0-9-]+\.upstash\.io$/.test(url.hostname) ||
      url.href!==url.origin+'/' || !token) fail(`Configure URL e token Upstash exclusivos de homologação para ${app.name}.`);
  return {url,token};
}
function validateAuth(app,profile){
  redisSettings(app,profile);
  for (const field of ['TENANT_ID','CLIENT_ID','CLIENT_SECRET']) if (!profile[app.prefix+'_ENTRA_'+field]) fail(`Configuração Entra incompleta de ${app.name}.`);
  const pem=profile[app.entitlement+'_ASSERTION_PRIVATE_KEY'];
  let key;
  try { key=createPrivateKey(pem??''); } catch { fail(`PEM Ed25519 inválido de ${app.name}.`); }
  const kid=profile[app.entitlement+'_ASSERTION_KEY_ID'];
  const hash=createHash('sha256').update(createPublicKey(key).export({format:'pem',type:'spki'})).digest('hex');
  if (key.asymmetricKeyType!=='ed25519' || kid!==`${app.name}-preview-${hash.slice(0,16)}`)
    fail(`Ed25519 ou ID divergente de ${app.name}.`);
}
async function probeRedis(profile,localProfiles){
  const map=JSON.parse(readFileSync(join(here,'origens-e-redis.json'),'utf8')).filter(p=>p.redis_padroes_de_chave);
  const tokens=new Set(redisTargets.map(x=>redisSettings(x,profile).token));
  if(tokens.size!==3) fail('São necessários três tokens ACL independentes.');
  const probes=redisTargets.map((a,i)=>({...a,...redisSettings(a,profile), keys:[
    map[i].redis_padroes_de_chave.map(k=>k.replace('*',randomBytes(32).toString('hex'))),
    ...(localProfiles&&i<2?[['login','session'].map(k=>`${a.redis}:preview:${createHash('sha256').update(origin(a)).digest('hex')}:${k}:${randomBytes(32).toString('hex')}`)]:[])
  ].flat()}));
  async function action(t,args,denied=false){
    const r=await response(t.url,{method:'POST',headers:{Authorization:`Bearer ${t.token}`,'Content-Type':'application/json'},body:JSON.stringify(args)});
    if (denied) {
      if (!/NOPERM|permission/i.test(r.body?.error??'')) fail(`ACL não comprovou negação para ${t.name}.`);
    } else if (!r.ok || !r.body || !Object.hasOwn(r.body,'result') || r.body.error) fail(`Redis REST/ACL falhou para ${t.name}.`);
    return r.body?.result;
  }
  for (const t of probes) {
    for (const key of t.keys) {
      if (await action(t,['SET',key,'fixture', 'EX',20,'NX'])!=='OK' ||
          await action(t,['GET',key])!=='fixture') fail('Redis SET/GET divergente.');
      for (const other of probes.filter(x=>x!==t)) {
        for (const cmd of ['GET','GETDEL','SET','DEL']) {
          await action(other,cmd==='SET'?[cmd,key,'fixture-limite','EX',20,'NX']:[cmd,key],true);
        }
      }
      await action(t,['EXISTS',key],true);
      if (await action(t,['GETDEL',key])!=='fixture' || await action(t,['GET',key])!==null ||
          await action(t,['SET',key,'fixture','EX',20,'NX'])!=='OK' || await action(t,['DEL',key])!==1)
        fail('Redis consumo/exclusão divergente.');
    }
    const key=t.keys[0];
    await action(t,['SET',key,'fixture','EX',1,'NX']);
    await new Promise(r=>setTimeout(r,1250));
    if(await action(t,['GET',key])!==null) fail('Redis TTL divergente.');
    log(`REST, segregação ACL, comandos e expiração validados para ${t.name}.`);
  }
}
async function launch(configs){
  const children=[];
  const stop=()=>{ for(const child of children) child.kill(); };
  const cleanup=()=>{stop();process.exitCode=0;};
  process.once('SIGINT',cleanup);
  process.once('SIGTERM',cleanup);
  try {
    for (const {app,env} of configs) {
      if (await reach(app.web)) fail(`Porta do dashboard já em uso (${app.web}).`);
      if (app.name==='retencao') npm(['run','build'],{cwd:appDir(app),env});
    }
    for (const {app,env} of configs) {
      const cmd=app.name==='retencao'
        ? [process.execPath,[join(appDir(app),'node_modules','tsx','dist','cli.mjs'),'scripts/homologacao-biosaude.ts','serve']]
        : [process.execPath,[join(appDir(app),'node_modules','vite','bin','vite.js'),'dev','--host','127.0.0.1','--port','55331','--strictPort']];
      const child=spawn(cmd[0],cmd[1],{cwd:appDir(app),env,stdio:'ignore',windowsHide:true});
      child.on('error',()=>{});
      children.push(child);
    }
    for (const {app} of configs) {
      const path=app.name==='retencao'?'/api/public/dataset':'/api/corporate-auth/login';
      let alive=false;
      for(let i=0;i<45;i++){
        await new Promise(r=>setTimeout(r,1000));
        if(children.some(c=>c.exitCode!==null)) break;
        try {
          // Never start an Entra login during the automatic unauthenticated probe.
          if(app.name==='comercial') {
            const page=await fetch(origin(app)+'/',{signal:AbortSignal.timeout(3000)});
            const html=await page.text();
            alive=page.ok && /Entrar com Microsoft/i.test(html);
          } else {
            const data=await fetch(origin(app)+path,{signal:AbortSignal.timeout(3000)});
            alive=data.status===401;
          }
        } catch {}
        if(alive) break;
      }
      if(!alive) fail(`Servidor ou verificação sem login indisponível para ${app.name}.`);
      log(`Dashboard pronto em ${origin(app)}; login corporativo deve ser exercitado no navegador.`);
    }
    log('Ctrl+C encerra somente os dois dashboards iniciados por este script.');
    await Promise.race(children.map(child=>new Promise(r=>child.once('exit', r))));
  } finally { stop(); }
}
async function main(){
  if(Number(process.versions.node.split('.')[0])<24) fail('Instale Node.js 24 LTS.');
  for (const item of requiredBranches) {
    const actual=git(join(repos,item.repo),['rev-parse','HEAD']);
    if(actual!==item.sha || git(join(repos,item.repo),['branch','--show-current'])!==item.branch)
      fail(`Checkout divergente em ${item.repo}; confira a branch e revisão publicadas.`);
    log(`${item.repo}: revisão publicada conferida.`);
  }
  if (opt.verificar) { log('Pré-verificação offline concluída.');return; }
  if ([state,...requiredBranches.map(x=>join(repos,x.repo))].some((x,i)=>i>0&&[relative(x,state),relative(state,x)].some(p=>!isAbsolute(p)&&!p.startsWith('..'))))
    fail('Estado deve ficar fora dos repositórios.');
  if (process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) fail('Remova DOCKER_HOST/DOCKER_CONTEXT para usar apenas o Docker local.');
  const context=call('Docker local',['context','inspect','--format','{{.Endpoints.docker.Host}}']);
  if (!/^npipe:\/\/(?:\/\/)?\.\/pipe\/(dockerDesktopLinuxEngine|docker_engine)$/.test(context) &&
      !/^unix:\/\/(\/var\/run\/docker\.sock|\/run\/docker\.sock)$/.test(context)) fail('Identidade do daemon Docker local não reconhecida.');
  const dockerVersion=call('Versão Docker',['version','--format','{{.Server.Version}}']);
  if(call('Modo do Docker Desktop',['info','--format','{{.OSType}}'])!=='linux') fail('O Docker Desktop deve usar containers Linux.');
  if(Number(dockerVersion.split('.')[0])<28) fail('Atualize o Docker Desktop para um Engine 28 ou superior.');
  run('Bun','bun',['--version']);
  mkdirSync(state,{recursive:true,mode:0o700});
  if(lstatSync(state).isSymbolicLink() || (process.platform!=='win32' && (lstatSync(state).mode&0o077))) fail('Diretório de estado sem proteção.');
  logfile=join(state,'homologacao.log');
  const lock=join(state,'.homologacao-executando');
  writeFileSync(lock, String(process.pid),{flag:'wx',mode:0o600});
  try {
    const profile=profileFile();
    const failures=[];
    const blocked = (error, label) => {
      log(`${label}: ${error instanceof SafeError || error instanceof LoopbackError?error.message:'falha local ('+(error.code??error.name)+').'}`);
      failures.push(label);
    };
    if(opt.iniciar) for(const app of apps) {
      try { validateAuth(app,profile); } catch(error) { blocked(error,'Perfil de '+app.name); }
    }
    if(opt.redis) {
      try { await probeRedis(profile,!!opt.iniciar); } catch(error) { blocked(error,'Validação Redis'); }
    }
    installCli();
    const configs=[];
    for(const app of apps){
      try {
        log(`Preparando ${app.name} com Supabase sintético local.`);
        mkdirSync(join(state,app.name),{recursive:true});
        stageApp(app);stageSupabase(app);
        const status=await startStack(app,context);
        const secret=shellSecretFile(app);
        const env=appEnv(app,status,secret,profile);
        await seedAndVerify(app,status,secret,env);
        configs.push({app,env});
        log(`${app.name}: dados sintéticos, login Supabase e bloqueios de acesso REST conferidos.`);
      } catch (error) { blocked(error,app.name); }
    }
    if(failures.length) fail('Há etapas pendentes. Confira os motivos por frente no arquivo homologacao.log.');
    if(opt.iniciar) await launch(configs);
    else log('Stacks locais prontos. As aplicações corporativas exigem -Iniciar e o perfil autorizado.');
  } finally { unlinkSync(lock); }
}
try { await main(); }
catch(error) {
  log(error instanceof SafeError || error instanceof LoopbackError?error.message:`Falha local (${error.code??error.name??'desconhecida'}). Verifique ferramentas, portas e permissões nas etapas acima.`);
  process.exitCode=1;
}
