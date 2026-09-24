async function testPgEndpoint() {
  const url = 'https://srjkwwddbxniqhzqvrhc.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const endpoints = [
    '/pg/query',
    '/sql',
    '/api/query',
    '/rest/v1/rpc',
    '/pg'
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${url}${ep}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': key,
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({ query: 'SELECT 1;' })
      });
      console.log(ep, '-> status:', res.status);
    } catch (e) {
      console.log(ep, '-> error:', e.message);
    }
  }
}

testPgEndpoint().catch(console.error);
