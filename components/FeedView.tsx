'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  FeedPost,
  PostComment,
  UserProfile,
  CellGroup,
  ChurchAnnouncement,
} from '../types';
import {
  Heart,
  MessageCircle,
  Trash2,
  Image as ImageIcon,
  Send,
  Sparkles,
  AlertTriangle,
  Loader2,
  RefreshCw,
  X,
  ArrowUp,
  AlertCircle,
} from 'lucide-react';
import {
  optimizeImageToWebP,
  validateImageFile,
  validateImageForDatabase,
  IMAGE_PRESETS,
  formatFileSize,
} from '../lib/imageOptimizer';
import { uploadFeedImage, deleteFeedImage } from '../lib/feedStorage';
import { AppChurchService, supabase } from '../lib/supabase';

interface FeedViewProps {
  posts?: FeedPost[];
  announcements?: ChurchAnnouncement[];
  currentUser: UserProfile;
  currentCell: CellGroup;
  churchName: string;
  onLikePost?: (postId: string) => void;
  onAddComment?: (postId: string, commentText: string) => void;
  onDeleteComment?: (postId: string, commentId: string) => void;
  onDeletePost?: (postId: string) => void;
  onCreatePost?: (
    newPost: Omit<FeedPost, 'id' | 'likes' | 'likedByCurrentUser' | 'comments' | 'createdAt'>
  ) => void;
  onCreateAnnouncement?: (
    newAnnouncement: Omit<
      ChurchAnnouncement,
      'id' | 'createdAt' | 'confirmedAttendeesCount' | 'isConfirmedByCurrentUser'
    >
  ) => void;
  onToggleRSVP?: (announcementId: string) => void;
}

const generateOptimisticId = (): string => {
  return `optimistic-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
};

export const FeedView: React.FC<FeedViewProps> = ({
  currentUser,
  currentCell,
  churchName,
}) => {
  const queryClient = useQueryClient();

  // Query Key para isolamento por igreja e célula
  const queryKey = useMemo(
    () => ['feed_posts', currentUser.churchId, currentCell?.id],
    [currentUser.churchId, currentCell?.id]
  );

  // 1. Paginação por Cursor e Cache com Stale-While-Revalidate via useInfiniteQuery
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      AppChurchService.getFeedPostsPage({
        churchId: currentUser.churchId,
        cellId: undefined, // feed congregação
        userId: currentUser.id,
        cursor: pageParam,
        pageSize: 10,
      }),
    initialPageParam: null as { criado_em: string; id: string } | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    staleTime: 1000 * 60 * 2, // 2 minutos stale-while-revalidate
  });

  const allFetchedPosts = useMemo(() => {
    return data?.pages.flatMap((page) => page.posts) || [];
  }, [data]);

  // Publicações otimistas (aparecem na hora com progresso local)
  const [optimisticPosts, setOptimisticPosts] = useState<FeedPost[]>([]);

  // Lista unificada de posts (otimistas no topo + posts paginados do servidor)
  const displayPosts = useMemo(() => {
    return [...optimisticPosts, ...allFetchedPosts];
  }, [optimisticPosts, allFetchedPosts]);

  // Realtime: banner de novos posts sem quebrar a rolagem do usuário
  const [newPostsCount, setNewPostsCount] = useState<number>(0);

  // Estado do formulário de criação de post
  const [newPostCaption, setNewPostCaption] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [imageMeta, setImageMeta] = useState<{
    width: number;
    height: number;
    statsLabel: string;
  } | null>(null);
  const [isOptimizingImage, setIsOptimizingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<FeedPost['category']>('Célula');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estado dos comentários sob demanda por post
  const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [postCommentsState, setPostCommentsState] = useState<
    Record<
      string,
      {
        comments: PostComment[];
        isLoading: boolean;
        isLoaded: boolean;
      }
    >
  >({});

  // Modais de confirmação de exclusão
  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const [commentToDelete, setCommentToDelete] = useState<{ postId: string; commentId: string } | null>(null);
  const [isDeletingPost, setIsDeletingPost] = useState(false);

  // Sentinela de rolagem infinita
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  // Observador de interseção para scroll infinito automático
  useEffect(() => {
    if (isLoading || isFetchingNextPage || !hasNextPage) return;

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    );

    if (loadMoreSentinelRef.current) {
      observerRef.current.observe(loadMoreSentinelRef.current);
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [hasNextPage, isFetchingNextPage, isLoading, fetchNextPage]);

  // Inscrição Realtime no Supabase apenas para alertar de novos posts
  useEffect(() => {
    if (!supabase || !currentUser?.churchId) return;

    const channelName = `realtime-feed-${currentUser.churchId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'postagens_feed',
          filter: `igreja_id=eq.${currentUser.churchId}`,
        },
        (payload) => {
          // Só notifica se não for post criado pelo próprio usuário logado
          const author = (payload.new as any)?.nome_autor;
          if (author && author !== currentUser.name) {
            setNewPostsCount((prev) => prev + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  }, [currentUser?.churchId, currentUser?.name]);

  // RBAC para postar
  const userRoleNormalized = (currentUser.role || '').toLowerCase();
  const isUserPastor =
    userRoleNormalized.includes('pastor') ||
    userRoleNormalized.includes('pastora') ||
    userRoleNormalized.includes('administrador') ||
    currentUser.login === 'admin' ||
    currentUser.isSystemAdmin === true;

  const canUserPost =
    userRoleNormalized.includes('líder de setor') ||
    userRoleNormalized.includes('lider de setor') ||
    userRoleNormalized.includes('líder de célula') ||
    userRoleNormalized.includes('lider de celula') ||
    userRoleNormalized.includes('líder de área') ||
    userRoleNormalized.includes('lider de area') ||
    userRoleNormalized.includes('líder em treinamento') ||
    userRoleNormalized.includes('lider em treinamento') ||
    isUserPastor;

  // RBAC para deletar post
  const canUserDeletePost = (post: FeedPost): boolean => {
    if (isUserPastor) return true;
    const currentUserName = (currentUser.name || '').trim().toLowerCase();
    const postAuthorName = (post.authorName || '').trim().toLowerCase();
    return Boolean(postAuthorName && postAuthorName === currentUserName);
  };

  // RBAC para deletar comentário
  const canUserDeleteComment = (comment: { authorName: string }): boolean => {
    if (isUserPastor) return true;
    const currentUserName = (currentUser.name || '').trim().toLowerCase();
    const commentAuthorName = (comment.authorName || '').trim().toLowerCase();
    return Boolean(commentAuthorName && commentAuthorName === currentUserName);
  };

  // 2. Anexar Foto: Validação, redimensionamento para máx 1280px e conversão estrita para WebP
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';
    setImageError(null);

    const validation = validateImageFile(file);
    if (!validation.isValid) {
      setImageError(validation.error || 'Arquivo de imagem inválido.');
      return;
    }

    setIsOptimizingImage(true);

    try {
      // Otimização antecipada local para preview rápido e validação EXIF em formato WebP
      const optimized = await optimizeImageToWebP(file, IMAGE_PRESETS.FEED_POST);
      if (!optimized.dataUrl.startsWith('data:image/webp')) {
        throw new Error('Falha ao converter para o formato WebP.');
      }
      setSelectedFile(file);
      setPreviewDataUrl(optimized.dataUrl);
      setImageMeta({
        width: optimized.width,
        height: optimized.height,
        statsLabel: `${optimized.reductionLabel} • ${formatFileSize(optimized.optimizedSize)}`,
      });
      setImageError(null);
    } catch (err: any) {
      console.error('Falha ao processar e converter imagem do post para WebP:', err);
      setImageError('Não foi possível converter a imagem para WebP. Por favor, envie uma foto válida (JPG, PNG ou WEBP).');
      setSelectedFile(null);
      setPreviewDataUrl('');
      setImageMeta(null);
    } finally {
      setIsOptimizingImage(false);
    }
  };

  // 3. Publicação Otimista com barra de progresso e retry
  const handlePublishPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostCaption.trim() && !previewDataUrl) return;

    const tempId = generateOptimisticId();
    const fileToUpload = selectedFile;
    const captionToPublish = newPostCaption.trim();
    const categoryToPublish = selectedCategory;
    const currentPreviewUrl = previewDataUrl;
    const currentDims = imageMeta;

    // Post Otimista que aparece na hora na tela
    const optimisticPost: FeedPost = {
      id: tempId,
      churchId: currentUser.churchId,
      cellId: currentCell.id,
      cellName: `Célula ${currentCell.name}`,
      authorName: currentUser.name,
      authorRole: currentUser.role,
      authorAvatar: currentUser.avatarUrl,
      caption: captionToPublish,
      imageUrl: currentPreviewUrl || undefined,
      imageWidth: currentDims?.width,
      imageHeight: currentDims?.height,
      category: categoryToPublish,
      likes: 0,
      likedByCurrentUser: false,
      comments: [],
      commentsCount: 0,
      createdAt: 'Agora mesmo',
      isPending: true,
      uploadProgress: 15,
      isError: false,
    };

    // Insere imediatamente no topo do feed local
    setOptimisticPosts((prev) => [optimisticPost, ...prev]);

    // Limpa os campos do formulário na hora para digitação contínua
    setNewPostCaption('');
    setSelectedFile(null);
    setPreviewDataUrl('');
    setImageMeta(null);

    // Executa upload e gravação em background
    executePostPublish(tempId, optimisticPost, fileToUpload);
  };

  // Executa o upload para o Supabase Storage e gravação em postagens_feed
  const executePostPublish = async (
    tempId: string,
    postData: FeedPost,
    fileToUpload: File | null
  ) => {
    try {
      let finalImageUrl: string | undefined = undefined;
      let finalWidth = postData.imageWidth;
      let finalHeight = postData.imageHeight;

      // 1. Upload para Supabase Storage se houver imagem (via signed URL com sessão validada)
      if (fileToUpload) {
        const uploadRes = await uploadFeedImage(
          fileToUpload,
          currentUser.churchId,
          (percent) => {
            setOptimisticPosts((prev) =>
              prev.map((p) => (p.id === tempId ? { ...p, uploadProgress: percent } : p))
            );
          },
          currentUser.id
        );
        finalImageUrl = uploadRes.publicUrl;
        finalWidth = uploadRes.width;
        finalHeight = uploadRes.height;
      }

      // 2. Grava no banco apenas a URL pública e dimensões (nunca base64)
      await AppChurchService.createFeedPost({
        churchId: postData.churchId,
        cellId: postData.cellId,
        cellName: postData.cellName,
        authorName: postData.authorName,
        authorRole: postData.authorRole,
        authorAvatar: postData.authorAvatar,
        caption: postData.caption,
        imageUrl: finalImageUrl,
        imageWidth: finalWidth,
        imageHeight: finalHeight,
        category: postData.category,
      });

      // 3. Sucesso: remove o post otimista e invalida a query para revalidação suave
      setOptimisticPosts((prev) => prev.filter((p) => p.id !== tempId));
      queryClient.invalidateQueries({ queryKey });
    } catch (err: any) {
      console.error('Falha ao publicar postagem:', err);
      // Marca como erro no card com opção de tentar novamente
      setOptimisticPosts((prev) =>
        prev.map((p) =>
          p.id === tempId ? { ...p, isPending: false, isError: true } : p
        )
      );
    }
  };

  // Re-tentar publicação que falhou
  const handleRetryPost = (failedPost: FeedPost) => {
    setOptimisticPosts((prev) =>
      prev.map((p) =>
        p.id === failedPost.id
          ? { ...p, isPending: true, isError: false, uploadProgress: 20 }
          : p
      )
    );
    executePostPublish(failedPost.id, failedPost, selectedFile);
  };

  // Descartar post com falha
  const handleDismissFailedPost = (postId: string) => {
    setOptimisticPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  // 4. Curtidas com Atualização Otimista
  const handleToggleLike = async (post: FeedPost) => {
    const nextLiked = !post.likedByCurrentUser;
    const nextLikes = nextLiked ? post.likes + 1 : Math.max(0, post.likes - 1);

    // Atualização otimista no cache do React Query
    queryClient.setQueryData(queryKey, (oldData: any) => {
      if (!oldData?.pages) return oldData;
      return {
        ...oldData,
        pages: oldData.pages.map((page: any) => ({
          ...page,
          posts: page.posts.map((p: FeedPost) =>
            p.id === post.id
              ? { ...p, likedByCurrentUser: nextLiked, likes: nextLikes }
              : p
          ),
        })),
      };
    });

    try {
      await AppChurchService.toggleLikePost(post.id, currentUser.id, currentUser.churchId);
    } catch (err) {
      console.error('Erro ao curtir post, revertendo:', err);
      // Reverte em caso de erro
      queryClient.setQueryData(queryKey, (oldData: any) => {
        if (!oldData?.pages) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            posts: page.posts.map((p: FeedPost) =>
              p.id === post.id
                ? { ...p, likedByCurrentUser: post.likedByCurrentUser, likes: post.likes }
                : p
            ),
          })),
        };
      });
    }
  };

  // 5. Comentários sob demanda (buscados apenas ao abrir)
  const handleToggleComments = async (postId: string) => {
    if (activeCommentPostId === postId) {
      setActiveCommentPostId(null);
      return;
    }

    setActiveCommentPostId(postId);

    // Se ainda não carregou os comentários deste post, busca do Supabase
    if (!postCommentsState[postId]?.isLoaded) {
      setPostCommentsState((prev) => ({
        ...prev,
        [postId]: { comments: [], isLoading: true, isLoaded: false },
      }));

      try {
        const comments = await AppChurchService.getPostComments(postId);
        setPostCommentsState((prev) => ({
          ...prev,
          [postId]: { comments, isLoading: false, isLoaded: true },
        }));
      } catch (err) {
        console.error('Erro ao carregar comentários do post:', err);
        setPostCommentsState((prev) => ({
          ...prev,
          [postId]: { comments: [], isLoading: false, isLoaded: true },
        }));
      }
    }
  };

  // Enviar comentário com atualização atômica e otimista
  const handleCommentSubmit = async (postId: string) => {
    const text = commentInputs[postId]?.trim();
    if (!text) return;

    setCommentInputs((prev) => ({ ...prev, [postId]: '' }));

    // Atualização otimista no contador de comentários
    queryClient.setQueryData(queryKey, (oldData: any) => {
      if (!oldData?.pages) return oldData;
      return {
        ...oldData,
        pages: oldData.pages.map((page: any) => ({
          ...page,
          posts: page.posts.map((p: FeedPost) =>
            p.id === postId
              ? { ...p, commentsCount: (p.commentsCount || 0) + 1 }
              : p
          ),
        })),
      };
    });

    try {
      const newComment = await AppChurchService.addComment(postId, text, currentUser);
      setPostCommentsState((prev) => ({
        ...prev,
        [postId]: {
          comments: [...(prev[postId]?.comments || []), newComment],
          isLoading: false,
          isLoaded: true,
        },
      }));
    } catch (err) {
      console.error('Erro ao adicionar comentário:', err);
    }
  };

  // Excluir comentário
  const handleConfirmDeleteComment = async () => {
    if (!commentToDelete) return;
    const { postId, commentId } = commentToDelete;
    setCommentToDelete(null);

    // Remove da lista de comentários local
    setPostCommentsState((prev) => ({
      ...prev,
      [postId]: {
        ...prev[postId],
        comments: (prev[postId]?.comments || []).filter((c) => c.id !== commentId),
      },
    }));

    // Decrementa contador no card
    queryClient.setQueryData(queryKey, (oldData: any) => {
      if (!oldData?.pages) return oldData;
      return {
        ...oldData,
        pages: oldData.pages.map((page: any) => ({
          ...page,
          posts: page.posts.map((p: FeedPost) =>
            p.id === postId
              ? { ...p, commentsCount: Math.max(0, (p.commentsCount || 1) - 1) }
              : p
          ),
        })),
      };
    });

    try {
      await AppChurchService.deleteComment(postId, commentId);
    } catch (err) {
      console.error('Erro ao remover comentário:', err);
    }
  };

  // 6. Excluir postagem (remove do banco e imagem do Storage)
  const handleConfirmDeletePost = async () => {
    if (!postToDelete) return;
    const targetId = postToDelete;
    setIsDeletingPost(true);

    try {
      // Remove otimista da lista
      queryClient.setQueryData(queryKey, (oldData: any) => {
        if (!oldData?.pages) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            posts: page.posts.filter((p: FeedPost) => p.id !== targetId),
          })),
        };
      });

      await AppChurchService.deleteFeedPost(targetId, currentUser.id);
      setPostToDelete(null);
    } catch (err) {
      console.error('Erro ao excluir postagem:', err);
      refetch();
    } finally {
      setIsDeletingPost(false);
    }
  };

  // Clique no banner de novos posts
  const handleScrollToTopAndRefetch = () => {
    setNewPostsCount(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    refetch();
  };

  return (
    <div id="screen-feed" className="bg-[#e9eff6] min-h-screen pb-20 font-sans select-none relative">
      {/* Banner Flutuante Realtime de Novos Posts */}
      {newPostsCount > 0 && (
        <div className="fixed top-18 left-1/2 -translate-x-1/2 z-40 animate-in fade-in slide-in-from-top-4 duration-300">
          <button
            type="button"
            onClick={handleScrollToTopAndRefetch}
            className="flex items-center gap-2 px-4 py-2 bg-[#052447] text-white text-xs font-bold rounded-full shadow-lg hover:bg-[#073366] transition cursor-pointer border border-sky-400/30"
          >
            <ArrowUp size={14} className="text-sky-300 animate-bounce" />
            <span>{newPostsCount === 1 ? '1 nova publicação' : `${newPostsCount} novas publicações`}</span>
            <span className="text-sky-300 font-normal">• Toque para ver</span>
          </button>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-3 sm:px-6 pt-4">
        {/* Post Creation Box - Restrito por liderança */}
        {canUserPost && (
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs mb-4">
            <div className="flex items-center gap-3 mb-3">
              {/* Miniatura do Avatar do Autor (~96px) */}
              <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden border border-slate-300 shrink-0 relative">
                <Image
                  src={
                    currentUser.avatarUrl ||
                    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
                  }
                  alt={currentUser.name}
                  width={40}
                  height={40}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                  unoptimized
                  referrerPolicy="no-referrer"
                />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-[#052447]">
                  {currentUser.name}
                </h4>
                <p className="text-[11px] text-slate-500">
                  Compartilhando na <strong>Célula {currentCell.name}</strong>
                </p>
              </div>
            </div>

            <form onSubmit={handlePublishPost}>
              <textarea
                id="feed-post-caption-input"
                value={newPostCaption}
                onChange={(e) => setNewPostCaption(e.target.value)}
                placeholder={`O que Deus fez na Célula ${currentCell.name} essa semana? Compartilhe fotos, louvores e testemunhos...`}
                rows={3}
                className="w-full bg-[#f8fafc] border border-slate-200 rounded-xl p-3 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#052447] focus:ring-1 focus:ring-[#052447]"
              />

              {/* Erro de Validação de Imagem */}
              {imageError && (
                <div className="flex items-center gap-2 p-3 mt-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                  <AlertCircle size={16} className="text-rose-600 shrink-0" />
                  <span>{imageError}</span>
                </div>
              )}

              {/* Status de Otimização e Conversão no Navegador */}
              {isOptimizingImage && (
                <div className="flex items-center gap-2.5 p-3 mt-2 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 text-xs animate-pulse">
                  <Loader2 size={16} className="animate-spin text-sky-700 shrink-0" />
                  <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1.5">
                    <span className="font-bold">Redimensionando para máx 1280px e convertendo para WebP 0.8...</span>
                    <span className="text-slate-500 text-[11px]">(Respeitando EXIF)</span>
                  </div>
                </div>
              )}

              {/* Preview Local Imediato */}
              {previewDataUrl && !isOptimizingImage && (
                <div className="relative mt-2 rounded-xl overflow-hidden border border-slate-200 max-h-64 bg-slate-900 shadow-sm">
                  <Image
                    src={previewDataUrl}
                    alt="Preview local"
                    width={imageMeta?.width || 800}
                    height={imageMeta?.height || 500}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-auto object-cover max-h-64"
                    unoptimized
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/75 backdrop-blur-xs text-white text-[11px] font-medium px-2.5 py-1 rounded-full border border-white/20 shadow-xs">
                    <Sparkles size={12} className="text-amber-400" />
                    <span className="font-semibold">WebP Otimizado</span>
                    {imageMeta && (
                      <span className="text-emerald-300 font-semibold">• {imageMeta.statsLabel}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setPreviewDataUrl('');
                      setImageMeta(null);
                    }}
                    className="absolute top-2 right-2 bg-black/70 hover:bg-black text-white text-xs px-2.5 py-1 rounded-full cursor-pointer transition"
                  >
                    Remover foto
                  </button>
                </div>
              )}

              {/* Input de Arquivo Oculto */}
              <input
                type="file"
                ref={fileInputRef}
                accept="image/webp,image/jpeg,image/png,image/*"
                className="hidden"
                onChange={handleFileChange}
              />

              {/* Barra de Ações do Criador */}
              <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    id="btn-upload-photo"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isOptimizingImage}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    {isOptimizingImage ? (
                      <Loader2 size={15} className="animate-spin text-sky-700" />
                    ) : (
                      <ImageIcon size={15} className="text-sky-700" />
                    )}
                    Carregar Foto
                  </button>
                  <select
                    value={selectedCategory}
                    onChange={(e) =>
                      setSelectedCategory(e.target.value as FeedPost['category'])
                    }
                    className="bg-slate-100 text-slate-700 text-xs font-semibold px-2.5 py-1.5 rounded-xl border-none focus:outline-none cursor-pointer"
                  >
                    <option value="Célula">Célula</option>
                    <option value="Comunhão">Comunhão</option>
                    <option value="Batismo">Batismo</option>
                    <option value="Testemunho">Testemunho</option>
                    <option value="Liderança">Liderança</option>
                    <option value="Jejum & Oração">Jejum & Oração</option>
                  </select>
                </div>

                <button
                  type="submit"
                  id="btn-publish-post"
                  disabled={isOptimizingImage || (!newPostCaption.trim() && !previewDataUrl)}
                  className="px-5 py-1.5 bg-[#052447] hover:bg-[#073366] text-white text-xs font-bold rounded-xl shadow-xs disabled:opacity-50 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Send size={13} />
                  <span>Publicar</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 7. Skeleton no Primeiro Carregamento */}
        {isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={`skeleton-${i}`}
                className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs animate-pulse space-y-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="w-32 h-3.5 bg-slate-200 rounded-md" />
                    <div className="w-24 h-2.5 bg-slate-100 rounded-md" />
                  </div>
                </div>
                <div className="w-full h-12 bg-slate-100 rounded-xl" />
                <div className="w-full h-52 bg-slate-200 rounded-xl" />
                <div className="flex justify-between pt-2 border-t border-slate-100">
                  <div className="w-20 h-4 bg-slate-100 rounded" />
                  <div className="w-24 h-4 bg-slate-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Feed Posts Stream */}
        {!isLoading && (
          <div className="space-y-4">
            {displayPosts.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-slate-500 border border-slate-200">
                <p className="text-sm font-medium">
                  Ainda não há postagens no feed desta igreja.
                </p>
                {canUserPost && (
                  <p className="text-xs text-slate-400 mt-1">
                    Seja o primeiro líder a compartilhar um momento abençoado!
                  </p>
                )}
              </div>
            ) : (
              displayPosts.map((post, postIndex) => {
                const isCommentsOpen = activeCommentPostId === post.id;
                const commentsState = postCommentsState[post.id];
                const commentsList = commentsState?.comments || [];

                return (
                  <article
                    key={post.id}
                    id={`feed-post-${post.id}`}
                    className={`bg-white rounded-2xl border shadow-2xs overflow-hidden transition ${
                      post.isPending
                        ? 'border-sky-300 ring-2 ring-sky-100 opacity-90'
                        : post.isError
                        ? 'border-rose-300 ring-2 ring-rose-100'
                        : 'border-slate-200/80'
                    }`}
                  >
                    {/* Barra de Progresso de Publicação Otimista */}
                    {post.isPending && (
                      <div className="bg-sky-50 px-4 py-2 border-b border-sky-100 flex items-center justify-between text-xs text-sky-800">
                        <div className="flex items-center gap-2">
                          <Loader2 size={13} className="animate-spin text-sky-600" />
                          <span className="font-semibold">Publicando... {post.uploadProgress || 20}%</span>
                        </div>
                        <div className="w-24 bg-sky-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-sky-600 h-full transition-all duration-300"
                            style={{ width: `${post.uploadProgress || 20}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Alerta de Falha com Botão de Tentar Novamente */}
                    {post.isError && (
                      <div className="bg-rose-50 px-4 py-2.5 border-b border-rose-200 flex items-center justify-between text-xs text-rose-800">
                        <div className="flex items-center gap-1.5 font-medium">
                          <AlertTriangle size={14} className="text-rose-600 shrink-0" />
                          <span>Falha no envio da postagem.</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRetryPost(post)}
                            className="px-2.5 py-1 bg-rose-600 text-white rounded-lg font-bold hover:bg-rose-700 transition cursor-pointer flex items-center gap-1"
                          >
                            <RefreshCw size={11} /> Tentar Novamente
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDismissFailedPost(post.id)}
                            className="text-rose-500 hover:text-rose-700 p-1"
                            title="Descartar"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Post Author Header */}
                    <div className="p-4 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Miniatura do Avatar (~96px) */}
                        <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden border border-slate-300 shrink-0 relative">
                          <Image
                            src={
                              post.authorAvatar ||
                              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
                            }
                            alt={post.authorName}
                            width={40}
                            height={40}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover"
                            unoptimized
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                              {post.authorName}
                            </h3>
                            {post.category && (
                              <span className="text-[10px] font-semibold bg-sky-100 text-sky-800 px-2 py-0.2 rounded-full shrink-0">
                                {post.category}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 truncate">
                            <span className="font-semibold text-slate-700 truncate">{post.cellName}</span>
                            <span className="shrink-0">•</span>
                            <span className="shrink-0">{post.createdAt}</span>
                          </div>
                        </div>
                      </div>
                      {!post.isPending && canUserDeletePost(post) && (
                        <button
                          type="button"
                          onClick={() => setPostToDelete(post.id)}
                          className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition cursor-pointer shrink-0"
                          title="Excluir publicação"
                          aria-label="Excluir publicação"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>

                    {/* Post Caption */}
                    {post.caption && (
                      <div className="px-4 pb-3 text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-line">
                        {post.caption}
                      </div>
                    )}

                    {/* 8. Post Photo: loading=lazy, decoding=async, largura/altura reservadas para evitar layout shift */}
                    {post.imageUrl && (
                      <div
                        className="w-full bg-slate-100 max-h-[500px] overflow-hidden flex items-center justify-center relative"
                        style={{
                          aspectRatio:
                            post.imageWidth && post.imageHeight
                              ? `${post.imageWidth} / ${post.imageHeight}`
                              : '16 / 9',
                        }}
                      >
                        <Image
                          src={post.imageUrl}
                          alt="Momento da congregação"
                          width={post.imageWidth || 800}
                          height={post.imageHeight || 450}
                          priority={postIndex === 0}
                          {...(postIndex > 0 ? { loading: 'lazy' as const } : {})}
                          decoding="async"
                          className="w-full h-full object-cover hover:scale-[1.01] transition duration-300"
                          unoptimized
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}

                    {/* Interaction Stats Row */}
                    <div className="px-4 py-2 flex items-center justify-between text-xs text-slate-500 border-b border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center text-[9px]">
                          ❤️
                        </span>
                        <span>{post.likes} curtidas</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span>{post.commentsCount ?? post.comments?.length ?? 0} comentários</span>
                      </div>
                    </div>

                    {/* Action Buttons: Curtir e Comentar */}
                    <div className="px-2 sm:px-4 py-1.5 flex items-center justify-around border-b border-slate-100 text-xs font-semibold text-slate-600">
                      <button
                        type="button"
                        disabled={post.isPending}
                        onClick={() => handleToggleLike(post)}
                        title={post.likedByCurrentUser ? 'Descurtir' : 'Curtir'}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl hover:bg-slate-50 transition cursor-pointer ${
                          post.likedByCurrentUser ? 'text-rose-600 font-bold' : 'text-slate-600'
                        }`}
                      >
                        <Heart
                          size={18}
                          className={post.likedByCurrentUser ? 'fill-rose-600 text-rose-600' : ''}
                        />
                        <span>{post.likedByCurrentUser ? 'Curtido' : 'Curtir'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleComments(post.id)}
                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl hover:bg-slate-50 text-slate-600 transition cursor-pointer"
                      >
                        <MessageCircle size={18} />
                        <span>Comentar</span>
                      </button>
                    </div>

                    {/* Seção de Comentários Sob Demanda */}
                    {isCommentsOpen && (
                      <div className="bg-slate-50/60 p-4 space-y-3 border-t border-slate-100 animate-in fade-in duration-200">
                        {/* Carregando comentários sob demanda */}
                        {commentsState?.isLoading && (
                          <div className="py-4 flex items-center justify-center gap-2 text-slate-400 text-xs">
                            <Loader2 size={16} className="animate-spin text-[#052447]" />
                            <span>Carregando comentários...</span>
                          </div>
                        )}

                        {/* Lista de Comentários */}
                        {!commentsState?.isLoading && commentsList.length > 0 && (
                          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                            {commentsList.map((comment) => (
                              <div key={comment.id} className="flex items-start gap-2 text-xs group">
                                <div className="w-7 h-7 rounded-full bg-slate-300 overflow-hidden shrink-0 mt-0.5 relative">
                                  <Image
                                    src={
                                      comment.authorAvatar ||
                                      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'
                                    }
                                    alt={comment.authorName}
                                    width={28}
                                    height={28}
                                    loading="lazy"
                                    decoding="async"
                                    className="w-full h-full object-cover"
                                    unoptimized
                                    referrerPolicy="no-referrer"
                                  />
                                </div>
                                <div className="bg-white p-2.5 rounded-xl border border-slate-200/70 flex-1 shadow-2xs">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-bold text-slate-900">
                                      {comment.authorName}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] text-slate-400">
                                        {comment.createdAt}
                                      </span>
                                      {canUserDeleteComment(comment) && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setCommentToDelete({
                                              postId: post.id,
                                              commentId: comment.id,
                                            })
                                          }
                                          className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition cursor-pointer"
                                          title="Apagar comentário"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <p className="text-slate-700 mt-0.5">{comment.content}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Estado Vazio de Comentários */}
                        {!commentsState?.isLoading && commentsList.length === 0 && (
                          <p className="text-center text-xs text-slate-400 py-1">
                            Nenhum comentário ainda. Seja o primeiro a abençoar!
                          </p>
                        )}

                        {/* Input de Novo Comentário */}
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="text"
                            placeholder="Escreva uma palavra de bênção ou comentário..."
                            value={commentInputs[post.id] || ''}
                            onChange={(e) =>
                              setCommentInputs({ ...commentInputs, [post.id]: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleCommentSubmit(post.id);
                              }
                            }}
                            className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#052447]"
                          />
                          <button
                            type="button"
                            onClick={() => handleCommentSubmit(post.id)}
                            className="p-2 bg-[#052447] text-white rounded-xl hover:bg-[#073366] transition cursor-pointer"
                            title="Enviar comentário"
                          >
                            <Send size={15} />
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })
            )}

            {/* Sentinela de Rolagem Infinita & Indicadores de Carga */}
            <div ref={loadMoreSentinelRef} className="py-4 text-center">
              {isFetchingNextPage && (
                <div className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-500 py-2">
                  <Loader2 size={18} className="animate-spin text-[#052447]" />
                  <span>Carregando mais publicações do feed...</span>
                </div>
              )}
              {!hasNextPage && allFetchedPosts.length > 5 && (
                <div className="text-xs text-slate-400 font-medium py-2">
                  ✓ Você visualizou todas as publicações recentes.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal de Confirmação para Excluir Postagem */}
      {postToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in select-none">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200 p-5 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle size={24} />
            </div>
            <h3 className="font-bold text-base text-slate-900 mb-1">
              Excluir publicação?
            </h3>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              Esta ação removerá a publicação, seus comentários e a imagem do Storage definitivamente.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={isDeletingPost}
                onClick={() => setPostToDelete(null)}
                className="flex-1 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingPost}
                onClick={handleConfirmDeletePost}
                className="flex-1 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isDeletingPost ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Excluindo...
                  </>
                ) : (
                  'Sim, excluir'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação para Excluir Comentário */}
      {commentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in select-none">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200 p-5 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle size={24} />
            </div>
            <h3 className="font-bold text-base text-slate-900 mb-1">
              Excluir comentário?
            </h3>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              Esta ação removerá este comentário definitivamente.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setCommentToDelete(null)}
                className="flex-1 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteComment}
                className="flex-1 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition cursor-pointer"
              >
                Sim, excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
