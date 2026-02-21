// frontend/src/App.jsx
import { useState } from "react";
import Login from "./Login";

function App() {
  const [user, setUser] = useState(null);

  return (
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
  );
}

export default App;