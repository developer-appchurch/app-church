'use client';

import React, { useState, useRef } from 'react';
import Image from 'next/image';
import {
  FeedPost,
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
} from 'lucide-react';

interface FeedViewProps {
  posts: FeedPost[];
  announcements?: ChurchAnnouncement[];
  currentUser: UserProfile;
  currentCell: CellGroup;
  churchName: string;
  onLikePost: (postId: string) => void;
  onAddComment: (postId: string, commentText: string) => void;
  onDeletePost: (postId: string) => void;
  onCreatePost: (
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

export const FeedView: React.FC<FeedViewProps> = ({
  posts,
  currentUser,
  currentCell,
  churchName,
  onLikePost,
  onAddComment,
  onDeletePost,
  onCreatePost,
}) => {
  // Feed post state
  const [newPostCaption, setNewPostCaption] = useState('');
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<FeedPost['category']>('Célula');
  const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // RBAC for creating posts:
  // "somente algumas funções como Líder de Setor, Líder de Célula, Pastor(a), Líder de Área, Líder em Treinamento tenha a possiblidade de postar"
  const userRoleNormalized = (currentUser.role || '').toLowerCase();
  const canUserPost =
    userRoleNormalized.includes('líder de setor') ||
    userRoleNormalized.includes('lider de setor') ||
    userRoleNormalized.includes('líder de célula') ||
    userRoleNormalized.includes('lider de celula') ||
    userRoleNormalized.includes('pastor') ||
    userRoleNormalized.includes('pastora') ||
    userRoleNormalized.includes('líder de área') ||
    userRoleNormalized.includes('lider de area') ||
    userRoleNormalized.includes('líder em treinamento') ||
    userRoleNormalized.includes('lider em treinamento') ||
    userRoleNormalized.includes('administrador') ||
    currentUser.login === 'admin';

  // RBAC for deleting posts:
  // "opção de excluir um post, ela dada somente ao próprio usuário que postou, ao usuário administrador e a função ao membro na função de Pastor(a)"
  const canUserDeletePost = (post: FeedPost): boolean => {
    const currentUserName = (currentUser.name || '').trim().toLowerCase();
    const postAuthorName = (post.authorName || '').trim().toLowerCase();
    const isAuthor = Boolean(postAuthorName && postAuthorName === currentUserName);

    const role = (currentUser.role || '').toLowerCase();
    const isAdmin = role.includes('administrador') || currentUser.login === 'admin';
    const isPastor = role.includes('pastor') || role.includes('pastora');

    return isAuthor || isAdmin || isPastor;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setSelectedImageUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePublishPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostCaption.trim() && !selectedImageUrl) return;

    setIsSubmitting(true);
    try {
      await onCreatePost({
        churchId: currentUser.churchId,
        cellId: currentCell.id,
        cellName: `Célula ${currentCell.name}`,
        authorName: currentUser.name,
        authorRole: currentUser.role,
        authorAvatar: currentUser.avatarUrl,
        caption: newPostCaption.trim(),
        imageUrl: selectedImageUrl || undefined,
        category: selectedCategory,
      });

      setNewPostCaption('');
      setSelectedImageUrl('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCommentSubmit = (postId: string) => {
    const text = commentInputs[postId]?.trim();
    if (!text) return;
    onAddComment(postId, text);
    setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
  };

  const confirmDeletePost = () => {
    if (postToDelete) {
      onDeletePost(postToDelete);
      setPostToDelete(null);
    }
  };

  return (
    <div id="screen-feed" className="bg-[#e9eff6] min-h-screen pb-20 font-sans select-none">
      <div className="max-w-3xl mx-auto px-3 sm:px-6 pt-4">
        {/* Header do Feed de Notícias */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#052447] text-white flex items-center justify-center">
              <Sparkles size={16} className="text-sky-300" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#052447]">
                Feed de Notícias
              </h2>
              <p className="text-xs text-slate-500">
                {churchName} • {currentCell.name}
              </p>
            </div>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            {posts.length} {posts.length === 1 ? 'publicação' : 'publicações'}
          </span>
        </div>

        {/* Post Creation Box - Only for allowed leadership roles */}
        {canUserPost && (
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs mb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden border border-slate-300 shrink-0 relative">
                <Image
                  src={
                    currentUser.avatarUrl ||
                    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
                  }
                  alt={currentUser.name}
                  width={40}
                  height={40}
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

              {/* Image Preview if selected */}
              {selectedImageUrl && (
                <div className="relative mt-2 rounded-xl overflow-hidden border border-slate-200 max-h-60 bg-slate-900">
                  <Image
                    src={selectedImageUrl}
                    alt="Preview do momento"
                    width={800}
                    height={400}
                    className="w-full h-auto object-cover max-h-60"
                    unoptimized
                    referrerPolicy="no-referrer"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedImageUrl('')}
                    className="absolute top-2 right-2 bg-black/70 hover:bg-black text-white text-xs px-2.5 py-1 rounded-full cursor-pointer"
                  >
                    Remover foto
                  </button>
                </div>
              )}

              {/* Hidden native file input */}
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />

              {/* Action Bar inside Post Creator */}
              <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    id="btn-upload-photo"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <ImageIcon size={15} className="text-sky-700" />
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
                  disabled={isSubmitting || (!newPostCaption.trim() && !selectedImageUrl)}
                  className="px-5 py-1.5 bg-[#052447] hover:bg-[#073366] text-white text-xs font-bold rounded-xl shadow-xs disabled:opacity-50 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Send size={13} />
                  {isSubmitting ? 'Publicando...' : 'Publicar'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Posts Stream */}
        <div className="space-y-4">
          {posts.length === 0 ? (
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
            posts.map((post) => {
              const isCommentsOpen = activeCommentPostId === post.id;
              return (
                <article
                  key={post.id}
                  id={`feed-post-${post.id}`}
                  className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden"
                >
                  {/* Post Author Header */}
                  <div className="p-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden border border-slate-300 shrink-0 relative">
                        <Image
                          src={
                            post.authorAvatar ||
                            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
                          }
                          alt={post.authorName}
                          width={40}
                          height={40}
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
                    {canUserDeletePost(post) && (
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

                  {/* Post Photo */}
                  {post.imageUrl && (
                    <div className="w-full bg-slate-950 max-h-[460px] overflow-hidden flex items-center justify-center relative">
                      <Image
                        src={post.imageUrl}
                        alt="Momento da Célula"
                        width={800}
                        height={500}
                        className="w-full h-auto object-cover max-h-[460px] hover:scale-[1.01] transition duration-300"
                        unoptimized
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  )}

                  {/* Interaction stats row */}
                  <div className="px-4 py-2 flex items-center justify-between text-xs text-slate-500 border-b border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center text-[9px]">
                        ❤️
                      </span>
                      <span>{post.likes} curtidas</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span>{post.comments.length} comentários</span>
                    </div>
                  </div>

                  {/* Interaction Action Buttons (Curtir e Comentar - sem compartilhar) */}
                  <div className="px-2 sm:px-4 py-1.5 flex items-center justify-around border-b border-slate-100 text-xs font-semibold text-slate-600">
                    <button
                      type="button"
                      onClick={() => onLikePost(post.id)}
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
                      onClick={() =>
                        setActiveCommentPostId(isCommentsOpen ? null : post.id)
                      }
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl hover:bg-slate-50 text-slate-600 transition cursor-pointer"
                    >
                      <MessageCircle size={18} />
                      <span>Comentar</span>
                    </button>
                  </div>

                  {/* Comments Section */}
                  <div className="bg-slate-50/60 p-4 space-y-3">
                    {/* List of comments */}
                    {post.comments.length > 0 && (
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {post.comments.map((comment) => (
                          <div key={comment.id} className="flex items-start gap-2 text-xs">
                            <div className="w-7 h-7 rounded-full bg-slate-300 overflow-hidden shrink-0 mt-0.5 relative">
                              <Image
                                src={
                                  comment.authorAvatar ||
                                  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'
                                }
                                alt={comment.authorName}
                                width={28}
                                height={28}
                                className="w-full h-full object-cover"
                                unoptimized
                                referrerPolicy="no-referrer"
                              />
                            </div>
                            <div className="bg-white p-2.5 rounded-xl border border-slate-200/70 flex-1 shadow-2xs">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-900">
                                  {comment.authorName}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {comment.createdAt}
                                </span>
                              </div>
                              <p className="text-slate-700 mt-0.5">{comment.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add comment input */}
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
                </article>
              );
            })
          )}
        </div>
      </div>

      {/* Modal de Confirmação para Excluir Publicação */}
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
              Esta ação removerá a publicação e todos os comentários associados de forma definitiva no Supabase.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setPostToDelete(null)}
                className="flex-1 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeletePost}
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
