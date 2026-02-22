import { useState, useEffect } from "react";
import { auth } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import Login from "./Login";
import Upload from "./Upload";

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
    <div style={{ padding: "40px", fontFamily: "Arial" }}>
      <h1>Bloodwork Analyzer</h1>

      {!user ? (
        <Login />
      ) : (
        <>
          <div style={{ marginBottom: "20px" }}>
            <p><strong>Name:</strong> {user.displayName}</p>
            <p><strong>Email:</strong> {user.email}</p>
            <button onClick={handleLogout}>Logout</button>
          </div>

          <Upload />
        </>
      )}
    </div>
  );
}

export default App;