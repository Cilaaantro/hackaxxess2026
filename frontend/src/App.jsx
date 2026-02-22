// frontend/src/App.jsx
import { useState } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Login from "./Login";
import UploadAudio from "./pages/UploadAudio";
import Chat from "./pages/Chat";

function App() {
  const [user, setUser] = useState(null);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <div style={{ padding: 40 }}>
              {!user ? (
                <Login setUser={setUser} />
              ) : (
                <>
                  <p>Welcome {user.displayName}</p>
                  <p>Email: {user.email}</p>
                  <p>
                    <Link to="/chat">Chat</Link> · <Link to="/upload">Speak &amp; send</Link>
                  </p>
                </>
              )}
            </div>
          }
        />
        <Route path="/upload" element={<UploadAudio />} />
        <Route path="/chat" element={<Chat />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;