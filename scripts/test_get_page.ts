import { AppChurchService } from '../lib/supabase';

async function testPage() {
  const churchId = '6ddefcae-2fec-41ba-b187-bb290b05beee';
  const res = await AppChurchService.getFeedPostsPage({ churchId, pageSize: 5 });
  console.log('getFeedPostsPage result:', {
    count: res.posts.length,
    firstPost: res.posts[0] ? {
      id: res.posts[0].id,
      caption: res.posts[0].caption,
      imageUrl: res.posts[0].imageUrl,
      commentsCount: res.posts[0].commentsCount,
      likes: res.posts[0].likes,
    } : null,
    nextCursor: res.nextCursor,
    hasMore: res.hasMore,
  });
}

testPage().catch(console.error);
