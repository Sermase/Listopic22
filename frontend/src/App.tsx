import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { HomePage } from './pages/HomePage';
import { SearchPage } from './pages/SearchPage';
// import { ListView } from './pages/ListView';

import { ListPage } from './pages/ListPage';

import { DebugView } from './pages/DebugView';

import { LoginPage } from './pages/LoginPage';
import { ChatsPage } from './pages/ChatsPage';

import { ProfilePage } from './pages/ProfilePage';

import { CreateListPage } from './pages/CreateListPage';
import { EditListPage } from './pages/EditListPage';
import { UsersPage } from './pages/UsersPage';
import { PlacePage } from './pages/PlacePage';
import { GroupPage } from './pages/GroupPage';
import { ArchivePage } from './pages/ArchivePage';

import { useLocation } from './hooks/useLocation';

// Separate component to use hook inside provider if needed, but here simple is fine
// Activating location request globally
const LocationActivator = () => {
  useLocation();
  return null;
};

function App() {
  return (
    <AuthProvider>
      <LocationActivator />
      <Router>
        <div className="min-h-screen bg-[#0b1021] text-gray-100 font-sans selection:bg-indigo-500/30">
          <Navbar />
          <main>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/list/:listId" element={<ListPage />} />
              <Route path="/list/:listId/edit" element={<EditListPage />} />
              <Route path="/create" element={<CreateListPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/place/:placeId" element={<PlacePage />} />
              <Route path="/group/:placeId/:itemName" element={<GroupPage />} />
              <Route path="/debug" element={<DebugView />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/profile/:userId" element={<ProfilePage />} />
              <Route path="/archive" element={<ArchivePage />} />
              <Route path="/chats" element={<ChatsPage />} />
              <Route path="/chats/:chatId" element={<ChatsPage />} />
              <Route path="/profile" element={<div className="pt-24 text-center">Perfil de Usuario (Próximamente)</div>} />
              <Route path="/login" element={<div className="pt-24 text-center">Login (Próximamente)</div>} />
            </Routes>
          </main>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
