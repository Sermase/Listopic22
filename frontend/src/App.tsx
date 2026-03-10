import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import React, { Suspense } from 'react';
import { ToastProvider } from './context/ToastContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Navbar } from './components/Navbar';
import { useLocation } from './hooks/useLocation';

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

// Loading Fallback
const PageLoader = () => (
  <div className="min-h-screen pt-32 flex justify-center bg-[#0b1021]">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
  </div>
);

function App() {
  return (
    <ToastProvider>
      <LocationActivator />
      <Router>
        <div className="min-h-screen bg-[#0b1021] text-gray-100 font-sans selection:bg-indigo-500/30">
          <Navbar />
          <main>
            <Suspense fallback={<PageLoader />}>
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
            </Suspense>
          </main>
        </div>
      </Router>
    </ToastProvider>
  );
}

export default App;
