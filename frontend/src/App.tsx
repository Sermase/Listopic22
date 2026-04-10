import { BrowserRouter as Router, Routes, Route, useLocation as useRouterLocation } from 'react-router-dom';
import React, { Suspense, useRef } from 'react';
import { ToastProvider } from './context/ToastContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Navbar } from './components/Navbar';
import { useLocation } from './hooks/useLocation';
import { App as CapApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import { useNavigate } from 'react-router-dom';

// Lazy Load Pages
const HomePage = React.lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })));
const SearchPage = React.lazy(() => import('./pages/SearchPage').then(m => ({ default: m.SearchPage })));
const ListPage = React.lazy(() => import('./pages/ListPage').then(m => ({ default: m.ListPage })));
const EditListPage = React.lazy(() => import('./pages/EditListPage').then(m => ({ default: m.EditListPage })));
const CreateListPage = React.lazy(() => import('./pages/CreateListPage').then(m => ({ default: m.CreateListPage })));
const CreateSublistPage = React.lazy(() => import('./pages/CreateSublistPage').then(m => ({ default: m.CreateSublistPage })));
const UsersPage = React.lazy(() => import('./pages/UsersPage').then(m => ({ default: m.UsersPage })));
const PlacePage = React.lazy(() => import('./pages/PlacePage').then(m => ({ default: m.PlacePage })));
const GroupPage = React.lazy(() => import('./pages/GroupPage').then(m => ({ default: m.GroupPage })));
const DebugView = React.lazy(() => import('./pages/DebugView').then(m => ({ default: m.DebugView })));
const DeveloperPage = React.lazy(() => import('./pages/DeveloperPage').then(m => ({ default: m.DeveloperPage })));
const LoginPage = React.lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const ProfilePage = React.lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const ArchivePage = React.lazy(() => import('./pages/ArchivePage').then(m => ({ default: m.ArchivePage })));
const ChatsPage = React.lazy(() => import('./pages/ChatsPage').then(m => ({ default: m.ChatsPage })));
const CreateReviewPage = React.lazy(() => import('./pages/CreateReviewPage').then(m => ({ default: m.CreateReviewPage })));

// Activating location request globally
const LocationActivator = () => {
  useLocation();
  return null;
};

// Scroll to top on every route change
const ScrollToTop = () => {
  const location = useRouterLocation();
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return null;
};

// Loading Fallback (shown on first lazy-chunk load)
const PageLoader = () => (
  <div className="min-h-screen bg-[#0b1021] animate-pulse">
    <div className="h-[40vh] min-h-[300px] bg-white/5" />
    <div className="px-4 pt-6 space-y-4 max-w-4xl mx-auto">
      <div className="h-8 bg-white/10 rounded w-1/2" />
      <div className="h-4 bg-white/5 rounded w-1/3" />
      <div className="flex gap-3 pt-2">
        <div className="h-8 w-20 bg-white/10 rounded-full" />
        <div className="h-8 w-20 bg-white/10 rounded-full" />
      </div>
      <div className="space-y-3 pt-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex gap-3 h-24 bg-white/5 rounded-xl overflow-hidden">
            <div className="w-24 h-full bg-white/10 shrink-0" />
            <div className="flex-1 p-3 space-y-2">
              <div className="h-4 bg-white/10 rounded w-3/4" />
              <div className="h-3 bg-white/5 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// All routes wrapped so we can key by pathname for enter animations
const AppRoutes = () => {
  const location = useRouterLocation();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    StatusBar.setStyle({ style: Style.Light }).catch(() => { });
    SplashScreen.hide().catch(() => { });
  }, []);

  const backListenerRef = useRef<{ remove: () => void } | null>(null);

  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Deep Linking Listener
    const urlListener = CapApp.addListener('appUrlOpen', (event) => {
      const parts = event.url.split(window.location.host);
      const slug = parts.length > 1 ? parts.pop() : event.url.replace(/^https?:\/\/[^\/]+/, '');
      if (slug) {
        navigate(slug);
      }
    });

    const backListener = CapApp.addListener('backButton', () => {
      if (location.pathname === '/' || location.pathname === '/login') {
        CapApp.exitApp();
      } else {
        navigate(-1);
      }
    });

    return () => {
      backListener.then(listener => listener.remove());
      urlListener.then(listener => listener.remove());
    };
  }, [location.pathname, navigate]);

  return (
    <Suspense fallback={<PageLoader />}>
      <main>
        <div key={location.pathname} className="animate-page-fade">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/list/:listId" element={<ListPage />} />
            <Route path="/list/:listId/edit" element={<EditListPage />} />

            {/* List Creation Flow (Protected) */}
            <Route path="/create" element={<ProtectedRoute><CreateListPage /></ProtectedRoute>} />
            <Route path="/create-list" element={<ProtectedRoute><CreateListPage /></ProtectedRoute>} />

            {/* Sublist Creation Flow */}
            <Route path="/create-sublist" element={<ProtectedRoute><CreateSublistPage /></ProtectedRoute>} />
            <Route path="/create-sublist/:parentId" element={<ProtectedRoute><CreateSublistPage /></ProtectedRoute>} />
            <Route path="/create-review" element={<ProtectedRoute><CreateReviewPage /></ProtectedRoute>} />

            <Route path="/users" element={<UsersPage />} />
            <Route path="/place/:placeId" element={<PlacePage />} />
            <Route path="/group/:placeId" element={<GroupPage />} />
            <Route path="/group/:placeId/:itemName" element={<GroupPage />} />
            <Route path="/debug" element={<DebugView />} />
            <Route path="/developer" element={<ProtectedRoute><DeveloperPage /></ProtectedRoute>} />
            <Route path="/login" element={<LoginPage />} />

            {/* Protected Profile Pages */}
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/profile/:userId" element={<ProfilePage />} />

            <Route path="/archive" element={<ProtectedRoute><ArchivePage /></ProtectedRoute>} />
            <Route path="/chats" element={<ProtectedRoute><ChatsPage /></ProtectedRoute>} />
            <Route path="/chats/:chatId" element={<ProtectedRoute><ChatsPage /></ProtectedRoute>} />
          </Routes>
        </div>
      </main>
    </Suspense>
  );
};

function App() {
  return (
    <ToastProvider>
      <LocationActivator />
      <Router>
        <ScrollToTop />
        <div className="min-h-screen bg-[#0b1021] text-gray-100 font-sans selection:bg-indigo-500/30"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <Navbar />
          <AppRoutes />
        </div>
      </Router>
    </ToastProvider>
  );
}

export default App;
