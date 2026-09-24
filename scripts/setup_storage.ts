import { getSupabaseServerClient } from '../lib/supabaseServer.ts';

async function setup() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    console.error('Supabase client não disponível');
    return;
  }

  console.log('--- TESTANDO CRIAÇÃO DO BUCKET feed ---');
  const { data: createData, error: createErr } = await supabase.storage.createBucket('feed', {
    public: true,
    fileSizeLimit: 2 * 1024 * 1024, // 2 MB
    allowedMimeTypes: ['image/webp', 'image/jpeg'],
  });
  console.log('createBucket result:', createData, createErr);

  const { data: buckets } = await supabase.storage.listBuckets();
  console.log('Buckets após criação:', buckets);
}

setup().catch(console.error);
