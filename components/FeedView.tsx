'use client';

import React, { useState, useRef } from 'react';
import {
  FeedPost,
  UserProfile,
  CellGroup,
  ChurchAnnouncement,
} from '../types';
import {
  Heart,
  MessageCircle,
  Share2,
  Image as ImageIcon,
  Send,
  MoreHorizontal,
  Check,
  Bell,
  Calendar,
  MapPin,
  Clock,
  Sparkles,
  ShieldCheck,
  Plus,
  Users,
  CheckCircle2,
} from 'lucide-react';

interface FeedViewProps {
  posts: FeedPost[];
  announcements: ChurchAnnouncement[];
  currentUser: UserProfile;
  currentCell: CellGroup;
  churchName: string;
  onLikePost: (postId: string) => void;
  onAddComment: (postId: string, commentText: string) => void;
  onCreatePost: (
    newPost: Omit<FeedPost, 'id' | 'likes' | 'likedByCurrentUser' | 'comments' | 'createdAt'>
  ) => void;
  onCreateAnnouncement: (
    newAnnouncement: Omit<
      ChurchAnnouncement,
      'id' | 'createdAt' | 'confirmedAttendeesCount' | 'isConfirmedByCurrentUser'
    >
  ) => void;
  onToggleRSVP: (announcementId: string) => void;
}

const MOMENT_PHOTO_PRESETS = [
  {
    label: 'Reunião da Célula',
    url: 'https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=800&auto=format&fit=crop&q=80',
  },
  {
    label: 'Momento de Comunhão',
    url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&auto=format&fit=crop&q=80',
  },
  {
    label: 'Culto de Celebração',
    url: 'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?w=800&auto=format&fit=crop&q=80',
  },
  {
    label: 'Louvor & Oração',
    url: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=800&auto=format&fit=crop&q=80',
  },
];

export const FeedView: React.FC<FeedViewProps> = ({
  posts,
  announcements,
  currentUser,
  currentCell,
  churchName,
  onLikePost,
  onAddComment,
  onCreatePost,
  onCreateAnnouncement,
  onToggleRSVP,
}) => {
  // Main view tab: 'feed' (Feed de Células) or 'announcements' (Avisos Gerais)
  const [activeTab, setActiveTab] = useState<'feed' | 'announcements'>('feed');

  // Feed post state
  const [newPostCaption, setNewPostCaption] = useState('');
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<FeedPost['category']>('Célula');
  const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null);
  const [feedFilter, setFeedFilter] = useState<'all' | 'my_cell'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Announcement creation state (for privileged users: Líder de Setor, Pastor, etc.)
  const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] = useState(false);
  const [ancTitle, setAncTitle] = useState('');
  const [ancContent, setAncContent] = useState('');
  const [ancDate, setAncDate] = useState('');
  const [ancTime, setAncTime] = useState('');
  const [ancLocation, setAncLocation] = useState('');
  const [ancCategory, setAncCategory] =
    useState<ChurchAnnouncement['category']>('Geral');
  const [ancIsImportant, setAncIsImportant] = useState(false);

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

  const handlePublishPost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostCaption.trim() && !selectedImageUrl) return;

    onCreatePost({
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
  };

  const handleCreateAnnouncementSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ancTitle.trim() || !ancContent.trim()) return;

    onCreateAnnouncement({
      churchId: currentUser.churchId,
      title: ancTitle.trim(),
      content: ancContent.trim(),
      authorName: currentUser.name,
      authorRole: currentUser.role,
      authorAvatar: currentUser.avatarUrl,
      eventDate: ancDate.trim() || undefined,
      eventTime: ancTime.trim() || undefined,
      location: ancLocation.trim() || undefined,
      category: ancCategory,
      isImportant: ancIsImportant,
      imageUrl:
        ancCategory === 'Encontro com Deus'
          ? 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800'
          : ancCategory === 'Conferência'
          ? 'https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=800'
          : undefined,
    });

    setAncTitle('');
    setAncContent('');
    setAncDate('');
    setAncTime('');
    setAncLocation('');
    setAncIsImportant(false);
    setIsAnnouncementModalOpen(false);
  };

  const handleCommentSubmit = (postId: string) => {
    const text = commentInputs[postId]?.trim();
    if (!text) return;
    onAddComment(postId, text);
    setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
  };

  const handleShareClick = (postId: string) => {
    setCopiedShareId(postId);
    setTimeout(() => setCopiedShareId(null), 1800);
  };

  // Filter posts strictly for this church, and optionally for selected cell
  const filteredPosts =
    feedFilter === 'my_cell'
      ? posts.filter((p) => p.cellId === currentCell.id)
      : posts;

  return (
    <div id="screen-feed" className="bg-[#e9eff6] min-h-screen pb-20 font-sans select-none">
      <div className="max-w-3xl mx-auto px-3 sm:px-6 pt-4">
        {/* Church Context Bar */}
        <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-2xs mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-[#052447]">{churchName}</span>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Feed isolado para a congregação
          </span>
        </div>

        {/* Feed vs Announcements Switcher Tabs */}
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            id="tab-feed-moments"
            onClick={() => setActiveTab('feed')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'feed'
                ? 'bg-[#052447] text-white shadow-md'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Sparkles size={16} className={activeTab === 'feed' ? 'text-sky-300' : 'text-slate-400'} />
            <span>Feed de Células ({filteredPosts.length})</span>
          </button>
          <button
            type="button"
            id="tab-feed-announcements"
            onClick={() => setActiveTab('announcements')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'announcements'
                ? 'bg-[#052447] text-white shadow-md'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Bell
              size={16}
              className={activeTab === 'announcements' ? 'text-sky-300' : 'text-slate-400'}
            />
            <span>Avisos Gerais & Eventos ({announcements.length})</span>
          </button>
        </div>

        {/* TAB 1: FEED DE CÉLULAS */}
        {activeTab === 'feed' && (
          <>
            {/* Post Creation Box - Exactly matching screenshot */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs mb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden border border-slate-300 shrink-0">
                  <img
                    src={
                      currentUser.avatarUrl ||
                      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
                    }
                    alt={currentUser.name}
                    className="w-full h-full object-cover"
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
                    <img
                      src={selectedImageUrl}
                      alt="Preview do momento"
                      className="w-full h-auto object-cover max-h-60"
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

                {/* Quick photo suggestions matching screenshot */}
                {!selectedImageUrl && (
                  <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] text-slate-500">
                    <span className="shrink-0 font-medium text-slate-400">
                      Sugestões de fotos:
                    </span>
                    {MOMENT_PHOTO_PRESETS.map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedImageUrl(p.url)}
                        className="shrink-0 bg-slate-100 hover:bg-sky-50 hover:text-sky-800 px-2.5 py-1 rounded-lg border border-slate-200 font-medium cursor-pointer"
                      >
                        + {p.label}
                      </button>
                    ))}
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
                    disabled={!newPostCaption.trim() && !selectedImageUrl}
                    className="px-5 py-1.5 bg-[#052447] hover:bg-[#073366] text-white text-xs font-bold rounded-xl shadow-xs disabled:opacity-50 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send size={13} />
                    Publicar
                  </button>
                </div>
              </form>
            </div>

            {/* Feed Filter Tabs matching screenshot */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <button
                  id="btn-filter-all-cells"
                  onClick={() => setFeedFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    feedFilter === 'all'
                      ? 'bg-[#052447] text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                  }`}
                >
                  Todas as Células
                </button>
                <button
                  id="btn-filter-my-cell"
                  onClick={() => setFeedFilter('my_cell')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    feedFilter === 'my_cell'
                      ? 'bg-[#052447] text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                  }`}
                >
                  Célula {currentCell.name}
                </button>
              </div>
              <span className="text-xs text-slate-400 font-medium">
                {filteredPosts.length} publicações
              </span>
            </div>

            {/* Posts Stream */}
            <div className="space-y-4">
              {filteredPosts.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center text-slate-500 border border-slate-200">
                  <p className="text-sm font-medium">
                    Ainda não há postagens no feed desta célula/igreja.
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Seja o primeiro líder a compartilhar um momento abençoado!
                  </p>
                </div>
              ) : (
                filteredPosts.map((post) => {
                  const isCommentsOpen = activeCommentPostId === post.id;
                  return (
                    <article
                      key={post.id}
                      id={`feed-post-${post.id}`}
                      className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden"
                    >
                      {/* Post Author Header matching screenshot */}
                      <div className="p-4 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden border border-slate-300 shrink-0">
                            <img
                              src={
                                post.authorAvatar ||
                                'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
                              }
                              alt={post.authorName}
                              className="w-full h-full object-cover"
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
                        <button className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer shrink-0">
                          <MoreHorizontal size={18} />
                        </button>
                      </div>

                      {/* Post Caption */}
                      {post.caption && (
                        <div className="px-4 pb-3 text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-line">
                          {post.caption}
                        </div>
                      )}

                      {/* Post Photo matching screenshot */}
                      {post.imageUrl && (
                        <div className="w-full bg-slate-950 max-h-[460px] overflow-hidden flex items-center justify-center">
                          <img
                            src={post.imageUrl}
                            alt="Momento da Célula"
                            className="w-full h-auto object-cover max-h-[460px] hover:scale-[1.01] transition duration-300"
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

                      {/* Interaction Action Buttons */}
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
                        <button
                          type="button"
                          onClick={() => handleShareClick(post.id)}
                          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl hover:bg-slate-50 text-slate-600 transition cursor-pointer"
                        >
                          {copiedShareId === post.id ? (
                            <>
                              <Check size={18} className="text-emerald-600" />
                              <span className="text-emerald-600">Copiado!</span>
                            </>
                          ) : (
                            <>
                              <Share2 size={18} />
                              <span>Compartilhar</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Comments Section */}
                      <div className="bg-slate-50/60 p-4 space-y-3">
                        {/* List of comments */}
                        {post.comments.length > 0 && (
                          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                            {post.comments.map((comment) => (
                              <div key={comment.id} className="flex items-start gap-2 text-xs">
                                <div className="w-7 h-7 rounded-full bg-slate-300 overflow-hidden shrink-0 mt-0.5">
                                  <img
                                    src={
                                      comment.authorAvatar ||
                                      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'
                                    }
                                    alt={comment.authorName}
                                    className="w-full h-full object-cover"
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
          </>
        )}

        {/* TAB 2: AVISOS GERAIS & EVENTOS DA IGREJA */}
        {activeTab === 'announcements' && (
          <div className="space-y-4">
            {/* Header info & action for privileged roles (Líder de Setor, Pastor, etc.) */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-900 text-xs font-bold mb-1">
                  <ShieldCheck size={13} className="text-sky-700" />
                  Mural Oficial da Igreja
                </div>
                <h3 className="text-base sm:text-lg font-bold text-[#052447]">
                  Avisos & Eventos de {churchName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Gerenciado por Líderes de Setor, Supervisores e Pastores da congregação.
                </p>
              </div>

              {currentUser.isPrivileged ? (
                <button
                  type="button"
                  id="btn-new-announcement"
                  onClick={() => setIsAnnouncementModalOpen(true)}
                  className="px-4 py-2 bg-[#052447] hover:bg-[#073366] text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                >
                  <Plus size={16} />
                  Novo Aviso da Igreja
                </button>
              ) : (
                <span className="text-[11px] text-slate-400 italic">
                  Visualização liberada para toda a membresia
                </span>
              )}
            </div>

            {/* List of Church Announcements */}
            {announcements.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-slate-500 border border-slate-200">
                <p className="text-sm font-medium">
                  Nenhum aviso ou evento cadastrado no momento para esta igreja.
                </p>
              </div>
            ) : (
              announcements.map((anc) => (
                <div
                  key={anc.id}
                  id={`announcement-${anc.id}`}
                  className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden transition hover:border-sky-300"
                >
                  {/* Banner Image if available */}
                  {anc.imageUrl && (
                    <div className="w-full h-44 bg-slate-900 overflow-hidden relative">
                      <img
                        src={anc.imageUrl}
                        alt={anc.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      {anc.isImportant && (
                        <div className="absolute top-3 right-3 bg-rose-600 text-white text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full shadow-md">
                          Destaque Pastoral
                        </div>
                      )}
                    </div>
                  )}

                  <div className="p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-sky-800 bg-sky-100 px-2.5 py-0.5 rounded-full">
                        {anc.category}
                      </span>
                      <span className="text-xs text-slate-400">{anc.createdAt}</span>
                    </div>

                    <h4 className="text-base sm:text-lg font-bold text-[#052447] mb-2">
                      {anc.title}
                    </h4>
                    <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line mb-4">
                      {anc.content}
                    </p>

                    {/* Event metadata badge row */}
                    {(anc.eventDate || anc.location) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700 mb-4">
                        {anc.eventDate && (
                          <div className="flex items-center gap-2">
                            <Calendar size={15} className="text-sky-700 shrink-0" />
                            <span>
                              <strong>Data:</strong> {anc.eventDate}{' '}
                              {anc.eventTime && `• ${anc.eventTime}`}
                            </span>
                          </div>
                        )}
                        {anc.location && (
                          <div className="flex items-center gap-2">
                            <MapPin size={15} className="text-sky-700 shrink-0" />
                            <span className="truncate">
                              <strong>Local:</strong> {anc.location}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Author footer and RSVP button */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-200 overflow-hidden border border-slate-300 shrink-0">
                          <img
                            src={
                              anc.authorAvatar ||
                              'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100'
                            }
                            alt={anc.authorName}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="text-xs">
                          <div className="font-semibold text-slate-900">{anc.authorName}</div>
                          <div className="text-[10px] text-slate-400">{anc.authorRole}</div>
                        </div>
                      </div>

                      {/* RSVP Attendee Action */}
                      <button
                        type="button"
                        onClick={() => onToggleRSVP(anc.id)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                          anc.isConfirmedByCurrentUser
                            ? 'bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {anc.isConfirmedByCurrentUser ? (
                          <>
                            <CheckCircle2 size={14} className="text-emerald-600" />
                            <span>Presença Confirmada ({anc.confirmedAttendeesCount || 1})</span>
                          </>
                        ) : (
                          <>
                            <Users size={14} className="text-slate-500" />
                            <span>
                              Confirmar Presença ({anc.confirmedAttendeesCount || 0})
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Modal to Create Announcement (Sector Leader / Pastor only) */}
      {isAnnouncementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in select-none">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="bg-[#052447] text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell size={18} className="text-sky-300" />
                <h3 className="font-bold text-base">Publicar Aviso Oficial da Igreja</h3>
              </div>
              <button
                onClick={() => setIsAnnouncementModalOpen(false)}
                className="text-slate-300 hover:text-white cursor-pointer"
              >
                <MoreHorizontal size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateAnnouncementSubmit} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Título do Aviso / Evento: *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 46º Encontro com Deus, Vigília de Setor..."
                  value={ancTitle}
                  onChange={(e) => setAncTitle(e.target.value)}
                  className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#052447]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Descrição / Orientações: *
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Instruções para os líderes de célula e membros..."
                  value={ancContent}
                  onChange={(e) => setAncContent(e.target.value)}
                  className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#052447]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Categoria:
                  </label>
                  <select
                    value={ancCategory}
                    onChange={(e) =>
                      setAncCategory(e.target.value as ChurchAnnouncement['category'])
                    }
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#052447] cursor-pointer"
                  >
                    <option value="Geral">Geral</option>
                    <option value="Encontro com Deus">Encontro com Deus</option>
                    <option value="Conferência">Conferência</option>
                    <option value="Culto Especial">Culto Especial</option>
                    <option value="Treinamento">Treinamento</option>
                    <option value="Social">Social</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Data:</label>
                  <input
                    type="text"
                    placeholder="Ex: 24/10 ou Próximo Sábado"
                    value={ancDate}
                    onChange={(e) => setAncDate(e.target.value)}
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#052447]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Horário:
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 19:30"
                    value={ancTime}
                    onChange={(e) => setAncTime(e.target.value)}
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#052447]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Local:</label>
                  <input
                    type="text"
                    placeholder="Ex: Templo Central Paz..."
                    value={ancLocation}
                    onChange={(e) => setAncLocation(e.target.value)}
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#052447]"
                  />
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ancIsImportant}
                    onChange={(e) => setAncIsImportant(e.target.checked)}
                    className="rounded text-sky-900"
                  />
                  <span>Destacar como comunicado urgente/prioritário</span>
                </label>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAnnouncementModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-[#052447] hover:bg-[#073366] rounded-xl shadow-xs cursor-pointer"
                >
                  Publicar Aviso
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
