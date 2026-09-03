import { BrowserRouter as Router, Routes, Route, useLocation as useRouterLocation } from 'react-router-dom';
import React, { Suspense } from 'react';
import { ToastProvider } from './context/ToastContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Navbar } from './components/Navbar';
import { useLocation } from './hooks/useLocation';
import { App as CapApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';
import { useNavigate } from 'react-router-dom';
import { PushNotifications } from '@capacitor/push-notifications';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './context/AuthContext';
import { NotificationBannerProvider, useNotificationBanner } from './context/NotificationBannerContext';
import { NotificationBanner } from './components/NotificationBanner';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthPromptProvider } from './context/AuthPromptContext';

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
const BusinessDashboardPage = React.lazy(() => import('./pages/BusinessDashboardPage').then(m => ({ default: m.BusinessDashboardPage })));
const BusinessManagePage = React.lazy(() => import('./pages/BusinessManagePage').then(m => ({ default: m.BusinessManagePage })));
const ChatsPage = React.lazy(() => import('./pages/ChatsPage').then(m => ({ default: m.ChatsPage })));
const CreateReviewPage = React.lazy(() => import('./pages/CreateReviewPage').then(m => ({ default: m.CreateReviewPage })));
const AboutPage = React.lazy(() => import('./pages/AboutPage').then(m => ({ default: m.AboutPage })));
const PrivacyPage = React.lazy(() => import('./pages/PrivacyPage').then(m => ({ default: m.PrivacyPage })));
const ChildSafetyPage = React.lazy(() => import('./pages/ChildSafetyPage').then(m => ({ default: m.ChildSafetyPage })));
const IstariCorePage = React.lazy(() => import('./pages/IstariCorePage').then(m => ({ default: m.IstariCorePage })));
const TermsPage = React.lazy(() => import('./pages/TermsPage').then(m => ({ default: m.TermsPage })));
const LabPage = React.lazy(() => import('./pages/LabPage').then(m => ({ default: m.LabPage })));

// Activating location request globally
const LocationActivator = () => {
  useLocation();
  return null;
};

// Hide Navbar on fullscreen routes like /lab
const NavbarWrapper = () => {
  const location = useRouterLocation();
  if (location.pathname.startsWith('/lab')) return null;
  return <Navbar />;
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
  <div className="min-h-screen animate-pulse" style={{ background: 'var(--lt-bg)' }}>
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

// Registra FCM e intercepta pushes cuando la app está abierta
const PushSetup: React.FC = () => {
    const { user } = useAuth();
    const { showBanner } = useNotificationBanner();
    const navigate = useNavigate();

    React.useEffect(() => {
        if (!Capacitor.isNativePlatform() || !user) return;

        const setup = async () => {
            try {
                // Crear el canal ANTES de pedir permiso/registrar (Android 8.0+)
                await PushNotifications.createChannel({
                    id: 'listopic_default',
                    name: 'Notificaciones Listopic',
                    description: 'Notificaciones generales de la aplicación',
                    importance: 5, // IMPORTANCE_HIGH → banner visible
                    visibility: 1, // VISIBILITY_PUBLIC
                    vibration: true,
                    lights: true,
                });
            } catch (err) {
                console.warn("createChannel failed:", err);
            }

            try {
                const permission = await PushNotifications.requestPermissions();
                if (permission.receive === 'granted') {
                    await PushNotifications.register();
                }
            } catch (err) {
                console.warn("requestPermissions/register failed:", err);
            }
        };
        setup();

        const regListener = PushNotifications.addListener('registration', async ({ value: token }) => {
            try {
                await setDoc(
                    doc(db, 'users', user.uid, 'fcmTokens', token),
                    { token, platform: 'android', lastSeen: serverTimestamp(), createdAt: serverTimestamp() },
                    { merge: true }
                );
            } catch (err) {
                console.error("FCM Token save failed:", err);
            }
        });

        const recvListener = PushNotifications.addListener('pushNotificationReceived', (notification) => {
            showBanner({
                type: notification.data?.type || 'system',
                message: notification.body || notification.title || '',
                link: notification.data?.link || '',
                senderPhoto: notification.data?.senderPhoto || null,
            });
        });

        const actionListener = PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
            const link = action.notification.data?.link;
            if (link) navigate(link);
        });

        return () => {
            regListener.then(l => l.remove());
            recvListener.then(l => l.remove());
            actionListener.then(l => l.remove());
        };
    }, [user, showBanner, navigate]);

    return null;
};

// All routes wrapped so we can key by pathname for enter animations
const AppRoutes = () => {
  const location = useRouterLocation();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    // StatusBar style is managed by ThemeContext based on active theme.
    SplashScreen.hide().catch(() => { });
  }, []);

  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Deep Linking Listener
    const urlListener = CapApp.addListener('appUrlOpen', (event) => {
      const parts = event.url.split(window.location.host);
      const slug = parts.length > 1 ? parts.pop() : event.url.replace(/^https?:\/\/[^/]+/, '');
      if (slug) {
        navigate(slug);
      }
    });

    const backListener = CapApp.addListener('backButton', () => {
      if (location.pathname.startsWith('/lab')) {
        window.dispatchEvent(new CustomEvent('listopic:lab-back'));
        return;
      }

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
          <ErrorBoundary>
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
              <Route path="/businesses" element={<ProtectedRoute><BusinessDashboardPage /></ProtectedRoute>} />
              <Route path="/businesses/:placeId/manage" element={<ProtectedRoute><BusinessManagePage /></ProtectedRoute>} />
              <Route path="/chats" element={<ProtectedRoute><ChatsPage /></ProtectedRoute>} />
              <Route path="/chats/:chatId" element={<ProtectedRoute><ChatsPage /></ProtectedRoute>} />

              {/* Public info pages */}
              <Route path="/about" element={<AboutPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/child-safety" element={<ChildSafetyPage />} />
              <Route path="/istari-core" element={<IstariCorePage />} />
              <Route path="/terms" element={<TermsPage />} />

              {/* Lab / Easter egg — visibility gated by config.showLab */}
              <Route path="/lab" element={<LabPage />} />
            </Routes>
          </ErrorBoundary>
        </div>
      </main>
    </Suspense>
  );
};

function App() {
  return (
    <ToastProvider>
      <LocationActivator />
      <NotificationBannerProvider>
        <Router>
          <AuthPromptProvider>
            <ScrollToTop />
            <div className="min-h-screen font-sans selection:bg-[var(--lt-accent-soft)]"
              style={{
                background: 'var(--lt-bg)',
                color: 'var(--lt-text)',
                minHeight: '100dvh',
                paddingBottom: 'env(safe-area-inset-bottom)',
              }}>
              <NavbarWrapper />
              <NotificationBanner />
              <AppRoutes />
              <PushSetup />
            </div>
          </AuthPromptProvider>
        </Router>
      </NotificationBannerProvider>
    </ToastProvider>
  );
}

export default App;
