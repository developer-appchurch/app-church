import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://srjkwwddbxniqhzqvrhc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNyamt3d2RkYnhuaXFoenF2cmhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDI4MjgsImV4cCI6MjEwNTU3ODgyOH0.9uvatfClKVxyzBrBC7zGL9ujSaVYtyxf74q6i1YVOjs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  console.log('--- VERIFICANDO STORAGE E TABELAS ---');
  
  // 1. Storage Buckets
  const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
  console.log('Buckets existentes:', buckets, bErr);

  // 2. Colunas de postagens_feed
  const { data: samplePost } = await supabase.from('postagens_feed').select('*').limit(1);
  console.log('Colunas de postagens_feed:', samplePost ? Object.keys(samplePost[0] || {}) : 'Nenhum');

  // 3. Verifica se tabela curtidas existe
  const { data: curtidasSample, error: cErr } = await supabase.from('curtidas').select('*').limit(1);
  console.log('Tabela curtidas:', curtidasSample, cErr?.message);

  // 4. Verifica se tabela curtidas_postagem existe
  const { data: cpSample, error: cpErr } = await supabase.from('curtidas_postagem').select('*').limit(1);
  console.log('Tabela curtidas_postagem:', cpSample, cpErr?.message);

  // 5. Verifica comentarios_postagem
  const { data: comSample } = await supabase.from('comentarios_postagem').select('*').limit(1);
  console.log('Colunas de comentarios_postagem:', comSample ? Object.keys(comSample[0] || {}) : 'Nenhum');
}

inspect().catch(console.error);
