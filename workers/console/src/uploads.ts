const MAX_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 20;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface UploadEnv { DB: D1Database; INBOX_IMAGES: R2Bucket }
interface Batch { id: string; status: string; expected_count: number; expected_text: number; keys_json: string; task_id: string | null; created_at: string; expires_at: number }
const key = (id: string, i: number) => `inbox/${id}/${String(i + 1).padStart(2, '0')}.jpg`;
const textKey = (id: string) => `inbox/${id}/text.txt`;
const result = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
export async function uploadApi(request: Request, env: UploadEnv, role: 'owner' | 'device', path: string, now: number): Promise<Response | null> {
  if (role === 'owner' && path === '/api/owner/uploads' && request.method === 'POST') {
    const body = await request.json() as {count?: unknown; text?: unknown; attached?: unknown}; const count = Number(body.count); const text = body.text === true;
    if (!Number.isInteger(count) || count < 0 || count > MAX_FILES || (!count && !text)) return result(400, {error: 'Invalid image count'});
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO upload_batches (id,status,expected_count,expected_text,created_at,expires_at,is_attachment) VALUES (?1,'uploading',?2,?3,?4,?5,?6)").bind(id,count,text ? 1 : 0,new Date().toISOString(),now + 7*86400,body.attached === true ? 1 : 0).run();
    const uploads = Array.from({length:count}, (_, i) => ({url:`/api/owner/uploads/${id}/${i}`,fields:{}}));
    if (text) uploads.push({url:`/api/owner/uploads/${id}/text`,fields:{}});
    return result(201, {batchId:id, uploads});
  }
  const match = path.match(/^\/api\/(owner|device)\/uploads\/([^/]+)(?:\/([^/]+))?$/);
  if (!match || match[1] !== role) return null;
  const id = match[2]; if (!ID.test(id)) return result(400, {error:'Invalid upload ID'});
  const batch = await env.DB.prepare('SELECT * FROM upload_batches WHERE id = ?1 AND expires_at > ?2').bind(id,now).first<Batch>();
  if (!batch) return result(404,{error:'Upload not found'});
  if (role === 'owner' && request.method === 'POST' && match[3] === 'text') {
    if (batch.status !== 'uploading' || !batch.expected_text) return result(400,{error:'Text not expected'});
    const max = 2 * 1024 * 1024;
    if (Number(request.headers.get('content-length') || 0) > max) return result(413,{error:'Text too large'});
    const reader = request.body?.getReader(); if (!reader) return result(400,{error:'Text required'});
    const chunks: Uint8Array[] = []; let total = 0;
    for (;;) { const part = await reader.read(); if (part.done) break; total += part.value.byteLength; if (total > max) { await reader.cancel(); return result(413,{error:'Text too large'}); } chunks.push(part.value); }
    if (!total) return result(400,{error:'Text required'});
    const joined = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { joined.set(chunk,offset); offset += chunk.byteLength; }
    await env.INBOX_IMAGES.put(textKey(id),joined,{httpMetadata:{contentType:'text/plain;charset=utf-8'}}); return result(200,{ok:true});
  }
  if (role === 'owner' && request.method === 'POST' && /^\d+$/.test(match[3] ?? '')) {
    const index = Number(match[3]); if (batch.status !== 'uploading' || index >= batch.expected_count) return result(400,{error:'Invalid image index'});
    const length = Number(request.headers.get('content-length') || 0); if (length > MAX_BYTES) return result(413,{error:'Image too large'});
    const reader = request.body?.getReader(); if (!reader) return result(400,{error:'Image required'});
    const chunks: Uint8Array[] = []; let total = 0;
    for (;;) { const part = await reader.read(); if (part.done) break; total += part.value.byteLength; if (total > MAX_BYTES) { await reader.cancel(); return result(413,{error:'Image too large'}); } chunks.push(part.value); }
    if (!total) return result(400,{error:'Image required'});
    const joined = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; } const data = joined.buffer;
    const bytes = new Uint8Array(data); if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return result(400,{error:'JPEG required'});
    await env.INBOX_IMAGES.put(key(id,index),data,{httpMetadata:{contentType:'image/jpeg'}}); return result(200,{ok:true});
  }
  if (role === 'owner' && request.method === 'POST' && match[3] === 'commit') {
    const keys = (await Promise.all(Array.from({length:batch.expected_count}, (_,i) => env.INBOX_IMAGES.head(key(id,i))))).filter((v): v is R2Object => !!v).map(v=>v.key);
    if (batch.expected_text) { if (!await env.INBOX_IMAGES.head(textKey(id))) return result(400,{error:'Text not received'}); keys.push(textKey(id)); }
    if (!keys.length) return result(400,{error:'No images received'});
    await env.DB.prepare("UPDATE upload_batches SET status='ready', keys_json=?1 WHERE id=?2 AND status='uploading'").bind(JSON.stringify(keys),id).run();
    return result(200,{batchId:id,count:keys.length,missing:batch.expected_count-(keys.length-(batch.expected_text ? 1 : 0))});
  }
  if (role === 'device' && request.method === 'GET' && /^\d+$/.test(match[3] ?? '')) {
    const keys = JSON.parse(batch.keys_json) as string[]; const k=keys[Number(match[3])]; if (batch.status !== 'ready' || !k) return result(404,{error:'Image not found'});
    const object = await env.INBOX_IMAGES.get(k); return object ? new Response(object.body,{headers:{'content-type':k.endsWith('/text.txt') ? 'text/plain;charset=utf-8' : 'image/jpeg','cache-control':'no-store','x-content-type-options':'nosniff'}}) : result(404,{error:'Image not found'});
  }
  if (role === 'device' && request.method === 'POST' && match[3] === 'done') {
    if (batch.status !== 'ready') return result(409,{error:'Upload is not ready'});
    await env.INBOX_IMAGES.delete(JSON.parse(batch.keys_json) as string[]); await env.DB.prepare('DELETE FROM upload_batches WHERE id=?1').bind(id).run(); return result(200,{deleted:id});
  }
  return null;
}
