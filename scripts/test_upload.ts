import { getSupabaseServerClient } from '../lib/supabaseServer.ts';

async function testStorageUpload() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;

  const testBuffer = Buffer.from('RIFF....WEBPVP8 ...test', 'utf-8');
  const fileName = `test/${Date.now()}.webp`;

  const { data, error } = await supabase.storage
    .from('feed')
    .upload(fileName, testBuffer, {
      contentType: 'image/webp',
      cacheControl: '31536000', // 1 ano
      upsert: true,
    });

  console.log('Upload test result:', { data, error });

  if (data) {
    const { data: publicUrlData } = supabase.storage
      .from('feed')
      .getPublicUrl(fileName);
    console.log('Public URL:', publicUrlData.publicUrl);

    // Clean up test file
    await supabase.storage.from('feed').remove([fileName]);
    console.log('Cleaned up test file');
  }
}

testStorageUpload().catch(console.error);
