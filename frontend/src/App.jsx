import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import Login from "./Login";
import Layout from "./components/Layout";
import Profile from "./pages/Profile";
import Dashboard from "./pages/Dashboard";
import Upload from "./Upload";
import Chat from "./pages/Chat";
import Appointments from "./pages/Appointments";
import BackgroundInfo from "./pages/BackgroundInfo";
import Symptoms from "./pages/Symptoms";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="login-wrap">
        <p style={{ color: "var(--warm-text-muted)" }}>Loading…</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      {!user ? (
        <Login setUser={setUser} />
      ) : (
        <Routes>
          <Route element={<Layout user={user} />}>
            <Route path="/" element={<Profile />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/appointments" element={<Appointments />} />
            <Route path="/symptoms" element={<Symptoms />} />
            <Route path="/background-info" element={<BackgroundInfo />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
    </BrowserRouter>
  );
}

export default App;
