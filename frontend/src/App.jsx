// frontend/src/App.jsx
import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./Login";
import UploadAudio from "./pages/UploadAudio";

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
                </>
              )}
            </div>
          }
        />
        <Route path="/upload" element={<UploadAudio />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;