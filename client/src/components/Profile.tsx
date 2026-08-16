/**
 * ============================================================
 * 用户主页组件 (Profile)
 * ============================================================
 * 展示用户资料和帖子网格（状态编排层）
 *
 * 功能:
 * - 用户资料展示（头像、用户名、简介、统计数据）
 * - 头像上传（自己的主页）
 * - 资料编辑（用户名、简介）
 * - 帖子网格展示（9宫格布局）
 * - 私密文件夹管理（最多10张私密图片）
 * - 关注/取消关注、发消息按钮（他人主页）
 *
 * 结构: 数据/行为逻辑保留在本组件，
 * 视图拆分到 components/profile/（ProfileHeader/ProfilePostGrid/PrivateFolder）。
 * ============================================================
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { postsFeedKey } from '../hooks/usePostsFeed';
import api from '../api';
import { User, Post } from '../types';
import { useAuth } from '../context/AuthContext';
import { useFollow } from '../state/cache';
import { useFollowUser } from '../hooks/useFollowUser';
import { useEvent } from '../context/CreateContext';
import { showToast } from './ui/Toast';
import ConfirmDialog from './ui/ConfirmDialog';
import PostDetail from './PostDetail';
import FollowersModal from './FollowersModal';
import ProfileHeader from './profile/ProfileHeader';
import ProfilePostGrid from './profile/ProfilePostGrid';
import PrivateFolder, { PrivateImageItem, PrivateNewFileItem, PrivateZoomItem } from './profile/PrivateFolder';
import styles from './profile/Profile.module.css';

interface ProfileProps {
  embeddedUserId?: number;
  onBack?: () => void;
}

export default function Profile({ embeddedUserId, onBack }: ProfileProps = {}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: currentUser, updateUser, logout } = useAuth();
  const { getFollowStatus, setFollowStatus } = useFollow();
  const { follow, unfollow } = useFollowUser();
  const { openEdit, setOnEditSave } = useEvent();
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [showPrivateFolder, setShowPrivateFolder] = useState(false);
  const [privateImages, setPrivateImages] = useState<PrivateImageItem[]>([]);
  const [privateNewFiles, setPrivateNewFiles] = useState<PrivateNewFileItem[]>([]);
  const [privateDeletedIds, setPrivateDeletedIds] = useState<Set<number>>(new Set());
  const [privateZoomIndex, setPrivateZoomIndex] = useState<number | null>(null);
  const [deletePostId, setDeletePostId] = useState<number | null>(null);
  const [showFollowModal, setShowFollowModal] = useState<'followers' | 'following' | null>(null);
  const [activeTab, setActiveTab] = useState<'posts' | 'bookmarks' | 'reposts'>('posts');
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Post[]>([]);
  const [loadingBookmarks, setLoadingBookmarks] = useState(false);
  const [repostedPosts, setRepostedPosts] = useState<Post[]>([]);
  const [loadingReposts, setLoadingReposts] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const privateFileInputRef = useRef<HTMLInputElement>(null);

  const isOwnProfile = !!(embeddedUserId ? (currentUser && embeddedUserId === currentUser.id) : (!id || (currentUser && parseInt(id) === currentUser.id)));
  const userId = embeddedUserId || (id ? parseInt(id) : currentUser?.id);

  useEffect(() => {
    if (!userId) return;
    const loadProfile = async () => {
      try {
        const [userRes, postsRes] = await Promise.all([
          api.get(`/users/${userId}`),
          api.get(`/users/${userId}/posts`),
        ]);
        setProfileUser(userRes.data);
        setPosts(postsRes.data.posts);
        setUsername(userRes.data.username);
        setBio(userRes.data.bio || '');
        setFollowersCount(userRes.data.followers_count || 0);
        setFollowingCount(userRes.data.following_count || 0);

        // Load follow status if not own profile
        if (currentUser && userId !== currentUser.id) {
          const cached = getFollowStatus(userId);
          if (cached !== undefined) {
            setIsFollowing(cached);
          } else {
            const statusRes = await api.get(`/friends/status/${userId}`);
            setIsFollowing(statusRes.data.is_following);
            setFollowStatus(userId, statusRes.data.is_following);
          }
        }
      } catch {
        showToast('加载失败');
      }
    };
    loadProfile();
  }, [userId, currentUser, getFollowStatus, setFollowStatus]);

  // 切到收藏/转发标签时进入加载态（渲染期 prev 值模式，替代 effect 内同步 setState）
  const [prevActiveTab, setPrevActiveTab] = useState(activeTab);
  if (activeTab !== prevActiveTab) {
    setPrevActiveTab(activeTab);
    if (activeTab === 'bookmarks' && isOwnProfile) setLoadingBookmarks(true);
    if (activeTab === 'reposts' && isOwnProfile) setLoadingReposts(true);
  }

  // 加载收藏帖子
  useEffect(() => {
    if (activeTab !== 'bookmarks' || !isOwnProfile) return;
    api.get('/posts/bookmarks/me')
      .then(res => {
        setBookmarkedPosts(res.data.posts);
      })
      .catch(() => {
        showToast('加载收藏失败');
      })
      .finally(() => {
        setLoadingBookmarks(false);
      });
  }, [activeTab, isOwnProfile]);

  // 加载转发帖子
  useEffect(() => {
    if (activeTab !== 'reposts' || !isOwnProfile) return;
    api.get('/posts/reposts/me')
      .then(res => {
        setRepostedPosts(res.data.posts);
      })
      .catch(() => {
        showToast('加载转发失败');
      })
      .finally(() => {
        setLoadingReposts(false);
      });
  }, [activeTab, isOwnProfile]);

  // 嵌入模式下：管理帖子详情的历史栈
  useEffect(() => {
    if (!embeddedUserId || !selectedPostId) return;
    window.history.pushState({ profilePost: true }, '');
    const onPopState = () => setSelectedPostId(null);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [selectedPostId, embeddedUserId]);

  const handleFollow = async () => {
    if (!profileUser) return;
    try {
      if (isFollowing) {
        const res = await unfollow(profileUser.id);
        setIsFollowing(false);
        setFollowersCount(res.followers_count);
        showToast('o(TヘTo)取消关注成功！');
      } else {
        const res = await follow(profileUser.id);
        setIsFollowing(true);
        setFollowersCount(res.followers_count);
        showToast('ヾ(≧▽≦*)o关注成功！');
      }
    } catch {}
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 检查头像大小 (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      showToast('头像超过10MB限制');
      e.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const res = await api.post('/users/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setProfileUser(prev => prev ? { ...prev, avatar: res.data.avatar } : prev);
      updateUser(res.data);
    } catch {}
  };

  const handleDeletePost = (postId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletePostId(postId);
  };

  const confirmDeletePost = async () => {
    if (deletePostId === null) return;
    try {
      await api.delete(`/posts/${deletePostId}`);
      setPosts(prev => prev.filter(p => p.id !== deletePostId));
      // 同步信息流缓存，回到首页立即生效（staleTime: Infinity 不会自动重取）
      queryClient.setQueryData(postsFeedKey, (prev: Post[] | undefined) =>
        prev ? prev.filter(p => p.id !== deletePostId) : prev
      );
      showToast('删除成功！');
    } catch {}
    setDeletePostId(null);
  };

  const handleEditPost = (post: Post, e: React.MouseEvent) => {
    e.stopPropagation();
    openEdit({
      id: post.id,
      description: post.description || '',
      images: post.images || [post.image_url],
      closeComments: !!post.close_comments,
      pinned: !!post.pinned,
      videoUrl: post.video_url || null,
      videoCover: post.video_cover || null,
    });
    setOnEditSave(() => () => {
      // Refresh posts after edit
      if (userId) {
        api.get(`/users/${userId}/posts`).then(res => {
          setPosts(res.data.posts);
        });
      }
    });
  };

  const handleOpenPrivateFolder = async () => {
    setShowPrivateFolder(true);
    setPrivateDeletedIds(new Set());
    setPrivateNewFiles([]);
    try {
      const res = await api.get('/users/me/private-images');
      setPrivateImages(res.data.images);
    } catch {}
  };

  const handleAddPrivateImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const visibleCount = privateImages.filter(img => !privateDeletedIds.has(img.id)).length + privateNewFiles.length;
    const remaining = 10 - visibleCount;
    const toAdd = files.slice(0, remaining);
    if (toAdd.length === 0) return;
    const newItems = toAdd.map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setPrivateNewFiles(prev => [...prev, ...newItems]);
    e.target.value = '';
  };

  const handleRemovePrivateNewFile = (index: number) => {
    setPrivateNewFiles(prev => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleToggleDeletePrivate = (id: number) => {
    setPrivateDeletedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSavePrivateFolder = async () => {
    try {
      // Delete marked images
      for (const id of privateDeletedIds) {
        await api.delete(`/users/me/private-images/${id}`);
      }
      // Upload new images
      for (const item of privateNewFiles) {
        const formData = new FormData();
        formData.append('image', item.file);
        await api.post('/users/me/private-images', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      // Refresh
      const res = await api.get('/users/me/private-images');
      setPrivateImages(res.data.images);
      setPrivateNewFiles([]);
      setPrivateDeletedIds(new Set());
      setShowPrivateFolder(false);
      showToast('保存成功！');
    } catch (err: any) {
      showToast(err.response?.data?.error || '保存失败');
    }
  };

  const handleCancelPrivateFolder = () => {
    privateNewFiles.forEach(item => URL.revokeObjectURL(item.preview));
    setPrivateNewFiles([]);
    setPrivateDeletedIds(new Set());
    setShowPrivateFolder(false);
  };

  const getAllPrivateImages = (): PrivateZoomItem[] => {
    const existing = privateImages
      .filter(img => !privateDeletedIds.has(img.id))
      .map(img => ({ type: 'existing' as const, url: img.image_url, id: img.id }));
    const newOnes = privateNewFiles.map((item, i) => ({ type: 'new' as const, url: item.preview, index: i }));
    return [...existing, ...newOnes];
  };

  const handleSaveProfile = async () => {
    try {
      const res = await api.put('/users/me', { username, bio });
      setProfileUser(prev => prev ? { ...prev, username: res.data.username, bio: res.data.bio } : prev);
      updateUser(res.data);
      setEditing(false);
    } catch (err: any) {
      const msg = err.response?.data?.error || '保存失败';
      alert(msg);
    }
  };

  if (!profileUser) return null;

  return (
    <div className={styles.container}>
      <ProfileHeader
        user={profileUser}
        isOwnProfile={isOwnProfile}
        isEmbedded={!!embeddedUserId}
        postsCount={posts.length}
        followersCount={followersCount}
        followingCount={followingCount}
        isFollowing={isFollowing}
        editing={editing}
        username={username}
        bio={bio}
        setUsername={setUsername}
        setBio={setBio}
        onBack={() => { if (onBack) onBack(); else window.history.back(); }}
        onLogout={logout}
        fileInputRef={fileInputRef}
        onAvatarUpload={handleAvatarUpload}
        onToggleEdit={() => setEditing(!editing)}
        onOpenPrivateFolder={handleOpenPrivateFolder}
        onFollow={handleFollow}
        onMessage={() => navigate(`/messages/${profileUser.id}`)}
        onSaveProfile={handleSaveProfile}
        onCancelEdit={() => setEditing(false)}
        onShowFollowers={() => setShowFollowModal('followers')}
        onShowFollowing={() => setShowFollowModal('following')}
      />

      <ProfilePostGrid
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOwnProfile={isOwnProfile}
        posts={posts}
        bookmarkedPosts={bookmarkedPosts}
        loadingBookmarks={loadingBookmarks}
        repostedPosts={repostedPosts}
        loadingReposts={loadingReposts}
        onPostClick={(postId) => setSelectedPostId(postId)}
        onEditPost={handleEditPost}
        onDeletePost={handleDeletePost}
      />

      {selectedPostId && (
        <PostDetail postId={selectedPostId} onClose={() => {
          setSelectedPostId(null);
        }} />
      )}

      {showPrivateFolder && (
        <PrivateFolder
          privateImages={privateImages}
          privateNewFiles={privateNewFiles}
          privateDeletedIds={privateDeletedIds}
          allImages={getAllPrivateImages()}
          privateZoomIndex={privateZoomIndex}
          setPrivateZoomIndex={setPrivateZoomIndex}
          privateFileInputRef={privateFileInputRef}
          onAddImages={handleAddPrivateImages}
          onToggleDelete={handleToggleDeletePrivate}
          onRemoveNew={handleRemovePrivateNewFile}
          onCancel={handleCancelPrivateFolder}
          onSave={handleSavePrivateFolder}
          onZoomClose={() => setPrivateZoomIndex(null)}
        />
      )}

      {deletePostId !== null && (
        <ConfirmDialog
          message="确定要删除这篇帖子吗？"
          onConfirm={confirmDeletePost}
          onCancel={() => setDeletePostId(null)}
        />
      )}

      {showFollowModal && userId && (
        <FollowersModal
          type={showFollowModal}
          userId={userId}
          onClose={() => setShowFollowModal(null)}
        />
      )}
    </div>
  );
}
