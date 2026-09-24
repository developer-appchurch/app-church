import { getSupabaseServerClient } from '../lib/supabaseServer.ts';

async function testEndpoints() {
  const supabase = getSupabaseServerClient();
  const url = 'https://srjkwwddbxniqhzqvrhc.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log('Testing SQL execution via service role API with correct URL...');
  try {
    const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key!,
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({ query: 'SELECT 1;' }),
    });
    console.log('exec_sql status:', res.status, await res.text());
  } catch (e) {
    console.error('Fetch error:', e);
  }
}

testEndpoints().catch(console.error);
