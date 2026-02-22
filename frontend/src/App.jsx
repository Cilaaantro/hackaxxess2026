import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { auth } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import Login from "./Login";
import Upload from "./Upload";
import Chat from "./pages/Chat";

function App() {
  const [user, setUser] = useState(null);

  // Listen for login state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
  };

  return (
    <BrowserRouter>
      <div style={{ padding: "40px", fontFamily: "Arial" }}>
        <h1>Bloodwork Analyzer</h1>

        {!user ? (
          <Login setUser={setUser} />
        ) : (
          <>
            <div style={{ marginBottom: "20px" }}>
              <p><strong>Name:</strong> {user.displayName}</p>
              <p><strong>Email:</strong> {user.email}</p>
              <button onClick={handleLogout}>Logout</button>
            </div>

            <nav style={{ marginBottom: "20px" }}>
              <Link to="/" style={{ marginRight: "12px" }}>Home</Link>
              <Link to="/chat">Chat</Link>
            </nav>

            <Routes>
              <Route path="/" element={<Upload />} />
              <Route path="/chat" element={<Chat />} />
            </Routes>
          </>
        )}
      </div>
    </BrowserRouter>
  );
}

export default App;