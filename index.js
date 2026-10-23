// Todo list di Cloudflare Workers + D1 (SQLite).
// GET /                    -> halaman web
// GET/POST/DELETE /api/todos        -> daftar / tambah / hapus semua yang selesai
// PATCH/DELETE /api/todos/<id>      -> ubah status / hapus satu tugas
// Semua endpoint /api/* butuh header Authorization: Bearer <APP_TOKEN>

const MAX_TITLE = 200;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

async function authorized(request, env) {
  if (!env.APP_TOKEN) return false; // tanpa secret, API tertutup
  const given = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(env.APP_TOKEN)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

const toTodo = (r) => ({ id: r.id, title: r.title, done: !!r.done, created_at: r.created_at });

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === "/") {
      return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (!pathname.startsWith("/api/todos")) {
      return new Response("Tidak ditemukan", { status: 404 });
    }
    if (!(await authorized(request, env))) {
      return json({ error: "Token salah atau belum diisi" }, 401);
    }

    if (pathname === "/api/todos") {
      if (request.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT id, title, done, created_at FROM todos ORDER BY id DESC LIMIT 500"
        ).all();
        return json({ todos: results.map(toTodo) });
      }
      if (request.method === "POST") {
        const body = await request.json().catch(() => null);
        const title = typeof body?.title === "string" ? body.title.trim() : "";
        if (!title || title.length > MAX_TITLE) {
          return json({ error: "Judul wajib diisi, maksimal " + MAX_TITLE + " karakter" }, 400);
        }
        const row = await env.DB.prepare(
          "INSERT INTO todos (title, done, created_at) VALUES (?, 0, ?) RETURNING id, title, done, created_at"
        )
          .bind(title, Date.now())
          .first();
        return json(toTodo(row), 201);
      }
      if (request.method === "DELETE") {
        await env.DB.prepare("DELETE FROM todos WHERE done = 1").run();
        return json({ ok: true });
      }
      return json({ error: "Metode tidak didukung" }, 405);
    }

    const m = pathname.match(/^\/api\/todos\/(\d+)$/);
    if (m) {
      const id = Number(m[1]);
      if (request.method === "PATCH") {
        const body = await request.json().catch(() => null);
        if (typeof body?.done !== "boolean") return json({ error: "Field done harus true atau false" }, 400);
        const r = await env.DB.prepare("UPDATE todos SET done = ? WHERE id = ?")
          .bind(body.done ? 1 : 0, id)
          .run();
        return r.meta.changes ? json({ ok: true }) : json({ error: "Tugas tidak ditemukan" }, 404);
      }
      if (request.method === "DELETE") {
        const r = await env.DB.prepare("DELETE FROM todos WHERE id = ?").bind(id).run();
        return r.meta.changes ? json({ ok: true }) : json({ error: "Tugas tidak ditemukan" }, 404);
      }
      return json({ error: "Metode tidak didukung" }, 405);
    }
    return json({ error: "Tidak ditemukan" }, 404);
  },
};

const PAGE = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Daftar tugas</title>
<style>
:root{--bg:#eef1f6;--card:#fff;--ink:#1b2333;--muted:#667085;--line:#d9deea;--accent:#3b5bdb;--accent-ink:#fff;--danger:#b42318;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#0e1118;--card:#161b26;--ink:#e7eaf3;--muted:#98a2b3;--line:#262d3d;--accent:#7c97ff;--accent-ink:#0b1230;--danger:#ff8f85}}
*{box-sizing:border-box}
[hidden]{display:none!important}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:560px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:1.6rem;margin:0}
.sub{margin:0 0 20px;color:var(--muted)}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px}
form.card{padding:16px;margin-bottom:16px}
label.f{display:block;font-size:.875rem;color:var(--muted);margin-bottom:6px}
.row{display:flex;gap:8px}
input[type=text],input[type=password]{flex:1;min-width:0;padding:10px 12px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:inherit;font:inherit}
button{padding:10px 16px;border:0;border-radius:6px;background:var(--accent);color:var(--accent-ink);font:inherit;font-weight:600;cursor:pointer}
button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.tabs{display:flex;gap:6px;margin:16px 0 10px}
.tabs button{background:transparent;color:var(--muted);border:1px solid var(--line);padding:6px 12px;font-weight:500}
.tabs button[aria-pressed=true]{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
ul{list-style:none;margin:0;padding:0}
li{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-top:1px solid var(--line)}
li:first-child{border-top:0}
li label{display:flex;align-items:center;gap:12px;min-width:0;flex:1;cursor:pointer}
li input{width:18px;height:18px;accent-color:var(--accent);flex:none}
li span{overflow-wrap:anywhere}
li span.done{color:var(--muted);text-decoration:line-through}
li.empty{color:var(--muted);justify-content:center;padding:28px 16px}
button.ghost{background:transparent;color:var(--danger);padding:4px 8px;font-weight:500}
.foot{margin-top:8px;text-align:right}
.msg{margin-top:12px;min-height:1.5em;font-size:.9rem;color:var(--danger)}
</style>
</head>
<body>
<main>
<h1>Daftar tugas</h1>
<p class="sub" id="count">&nbsp;</p>
<form id="auth" class="card" hidden>
<label class="f" for="token">Token akses</label>
<div class="row"><input id="token" type="password" autocomplete="off"><button>Masuk</button></div>
</form>
<form id="add" class="row">
<input id="title" type="text" placeholder="Tulis tugas baru…" maxlength="200" autocomplete="off" aria-label="Tugas baru">
<button>Tambah</button>
</form>
<div class="tabs" role="group" aria-label="Filter tugas">
<button type="button" data-f="all">Semua</button>
<button type="button" data-f="active">Aktif</button>
<button type="button" data-f="done">Selesai</button>
</div>
<ul id="list" class="card"></ul>
<div class="foot"><button id="clear" type="button" class="ghost" hidden>Hapus yang selesai</button></div>
<div id="msg" class="msg" role="status"></div>
</main>
<script>
const $=s=>document.querySelector(s);
const tok=$("#token");let todos=[],filter="all";
try{tok.value=sessionStorage.getItem("t")||""}catch(e){}
async function api(path,o){
  o=o||{};
  const r=await fetch(path,{method:o.method||"GET",body:o.body,headers:{"content-type":"application/json",authorization:"Bearer "+tok.value}});
  const d=await r.json().catch(()=>({}));
  if(r.status===401)$("#auth").hidden=false;
  if(!r.ok)throw new Error(d.error||("Gagal ("+r.status+")"));
  return d;
}
function say(t){$("#msg").textContent=t}
async function load(){
  try{todos=(await api("/api/todos")).todos;$("#auth").hidden=true;say("");render()}
  catch(e){say(e.message)}
}
async function act(fn){try{await fn();await load()}catch(e){await load();say(e.message)}}
function render(){
  const ul=$("#list");ul.textContent="";
  const shown=todos.filter(t=>filter==="all"||(filter==="active"?!t.done:t.done));
  $("#count").textContent=todos.filter(t=>!t.done).length+" tugas aktif";
  $("#clear").hidden=todos.every(t=>!t.done);
  document.querySelectorAll("[data-f]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.f===filter)));
  if(!shown.length){
    const li=document.createElement("li");li.className="empty";
    li.textContent=todos.length?"Tidak ada tugas di filter ini.":"Belum ada tugas. Tulis yang pertama di atas.";
    ul.append(li);return;
  }
  shown.forEach(t=>{
    const li=document.createElement("li"),lb=document.createElement("label"),cb=document.createElement("input"),sp=document.createElement("span"),del=document.createElement("button");
    cb.type="checkbox";cb.checked=t.done;
    cb.onchange=()=>act(()=>api("/api/todos/"+t.id,{method:"PATCH",body:JSON.stringify({done:cb.checked})}));
    sp.textContent=t.title;if(t.done)sp.className="done";
    del.type="button";del.className="ghost";del.textContent="Hapus";del.setAttribute("aria-label","Hapus: "+t.title);
    del.onclick=()=>act(()=>api("/api/todos/"+t.id,{method:"DELETE"}));
    lb.append(cb,sp);li.append(lb,del);ul.append(li);
  });
}
document.querySelectorAll("[data-f]").forEach(b=>b.onclick=()=>{filter=b.dataset.f;render()});
$("#clear").onclick=()=>act(()=>api("/api/todos",{method:"DELETE"}));
$("#add").onsubmit=e=>{
  e.preventDefault();
  const i=$("#title"),title=i.value.trim();
  if(!title)return;
  act(async()=>{await api("/api/todos",{method:"POST",body:JSON.stringify({title})});i.value=""});
};
$("#auth").onsubmit=e=>{e.preventDefault();try{sessionStorage.setItem("t",tok.value)}catch(_){}load()};
if(tok.value)load();else{$("#auth").hidden=false;render()}
</script>
</body>
</html>`;
