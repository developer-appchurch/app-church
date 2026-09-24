async function getOpenApi() {
  const url = 'https://srjkwwddbxniqhzqvrhc.supabase.co';
  const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNyamt3d2RkYnhuaXFoenF2cmhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDI4MjgsImV4cCI6MjEwNTU3ODgyOH0.9uvatfClKVxyzBrBC7zGL9ujSaVYtyxf74q6i1YVOjs';
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  });
  const data = await res.json();
  console.log('Tables exposed in PostgREST:', Object.keys(data.definitions || {}));
  console.log('RPC paths exposed:', Object.keys(data.paths || {}).filter(p => p.startsWith('/rpc/')));
}

getOpenApi().catch(console.error);
